import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { db } from "@/db";
import { googleSheetConnections, vocabSets } from "@/db/schema";
import { writeAdminAudit } from "@/lib/adminAudit";
import { applyAiPromptsToSheet } from "@/lib/googleSheets/aiPrompts";
import {
  normalizeAiPrompt,
  parseAiPromptOverrides,
  type AiPromptOverrides,
} from "@/lib/googleSheets/aiFormula";
import { apiForUser } from "@/lib/googleSheets/sheetLifecycle";
import { getGoogleSheetTemplate } from "@/lib/googleSheets/template";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";
import { isGoogleOAuthConfigured } from "@/lib/googleSheets/auth";
import { createSheetJson } from "@/lib/googleSheets/createFlow";
import { checkRateLimit, recordRateLimitHit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RATE_LIMIT = { windowMs: 60 * 1000, maxAttempts: 6 };

const bodySchema = z.object({
  aiPrompts: z.record(z.string(), z.string()),
});

/**
 * Operation B — "Lưu & áp dụng cho Sheet".
 *
 * Saves the prompt wording and rewrites the EXISTING AI formulas in the
 * connected Google Sheet. Google Sheets still owns AI generation: Lexora only
 * rewrites the native =AI()/=Gemini() instruction text and never calls an AI
 * API. Plain-text cells (admin input or already-materialized AI output) are
 * never touched.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("google_sheets.manage");
  if (isAuthorizationError(access)) return access;
  const connectionId = Number(params.id);
  if (!Number.isInteger(connectionId) || connectionId < 1) {
    return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Thiếu nội dung prompt AI hợp lệ.", code: "INVALID_SCHEMA" }, { status: 400 });
  }

  const limitKey = `google-sheet-ai-prompt-apply:${access.userId}`;
  const limit = checkRateLimit(limitKey, RATE_LIMIT);
  if (limit.limited) {
    return NextResponse.json({ error: "Quá nhiều yêu cầu cập nhật prompt, thử lại sau ít phút.", retryAfterSeconds: limit.retryAfterSeconds }, { status: 429 });
  }
  recordRateLimitHit(limitKey, RATE_LIMIT);

  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
  if (!connection) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, connection.setId)).limit(1);
  const scoped = await requireAdminResourceAccess({ permission: "google_sheets.manage", folderId: set?.folderId ?? null, level: "editor", access });
  if (isAuthorizationError(scoped)) return scoped;
  if (!connection.enabled || connection.status === "disconnected") {
    return NextResponse.json({ error: "Kết nối đang bị tạm dừng.", code: "PAUSED" }, { status: 409 });
  }
  if (connection.aiEnrich === false) {
    return NextResponse.json({ error: "Google Sheets AI enrichment đang tắt. Bật trong Cài đặt rồi thử lại.", code: "AI_ENRICH_DISABLED" }, { status: 409 });
  }
  if (!set) return NextResponse.json({ error: "Không tìm thấy bộ từ vựng.", code: "NOT_FOUND" }, { status: 404 });
  if (!isGoogleOAuthConfigured()) {
    return createSheetJson({ status: 501, body: { error: "Google OAuth chưa được cấu hình trên máy chủ.", code: "NOT_CONFIGURED", retryable: false, setId: set.id } });
  }

  // Normalize server-side; unusable prompts fall back to the built-in default.
  const normalized: AiPromptOverrides = {};
  for (const [key, value] of Object.entries(parsed.data.aiPrompts)) {
    const prompt = normalizeAiPrompt(value);
    if (prompt) normalized[key as keyof AiPromptOverrides] = prompt;
  }
  const promptOverrides = Object.keys(normalized).length ? normalized : parseAiPromptOverrides(connection.aiPrompts);

  try {
    const template = getGoogleSheetTemplate(set);
    const api = await apiForUser(access.userId);
    const result = await applyAiPromptsToSheet({
      api,
      spreadsheetId: connection.spreadsheetId,
      template,
      promptOverrides,
    });

    // Save to the connection only AFTER the Sheet accepted the writes, so a
    // failed apply never silently changes what the admin sees as the active
    // prompt. Future rows then use the same wording (spec item 19).
    const patch = promptOverrides ? JSON.stringify(promptOverrides) : null;
    await db.update(googleSheetConnections).set({ aiPrompts: patch, updatedAt: new Date() }).where(eq(googleSheetConnections.id, connectionId));
    await writeAdminAudit({
      actorUserId: access.userId,
      action: "google_sheet.apply_ai_prompts",
      resourceType: "google_sheet_connection",
      resourceId: connectionId,
      metadata: { setId: set.id, spreadsheetId: connection.spreadsheetId, ...result.stats },
    });

    return NextResponse.json({
      ok: true,
      connectionId,
      ...result.stats,
      writeRequests: result.writeRequests,
      // Wording chosen deliberately (spec item 17): rewriting a formula does
      // NOT mean Google Sheets has already generated the result text.
      message: "Đã cập nhật lệnh AI trên Sheet.",
    });
  } catch (error) {
    if (error instanceof GoogleSheetsError) {
      if (error.code === "OAUTH_REQUIRED" || error.code === "OAUTH_REVOKED") {
        return createSheetJson({ status: 202, body: { error: "Kết nối Google để cập nhật prompt AI.", code: error.code, oauthRequired: true, setId: set.id } });
      }
      const status = error.code === "SHEET_NOT_FOUND" ? 404 : error.code === "RATE_LIMITED" ? 429 : 502;
      return NextResponse.json({ error: error.message, code: error.code, retryable: error.retryable }, { status });
    }
    console.error("[google-sheets] apply ai prompts failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Không thể cập nhật prompt AI trên Sheet lúc này.", code: "UNKNOWN", retryable: true }, { status: 502 });
  }
}
