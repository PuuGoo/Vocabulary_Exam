import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { db } from "@/db";
import { googleSheetConnections, vocabSets } from "@/db/schema";
import { createGoogleSheetForSet } from "@/lib/googleSheets/sheetLifecycle";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";
import { isGoogleOAuthConfigured } from "@/lib/googleSheets/auth";
import { createSheetErrorOutcome, createSheetJson } from "@/lib/googleSheets/createFlow";
import { connectionView, connectionViewMessage, loadConnectionForSet, recoverGoogleSheetConnection } from "@/lib/googleSheets/recovery";
import { normalizeAiPrompt, type AiPromptOverrides } from "@/lib/googleSheets/aiFormula";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// aiEnrich only controls whether Lexora plants the native Google Sheets AI
// formulas in the new Sheet. Lexora never calls any AI API for this feature.
const bodySchema = z.object({
  setId: z.number().int().positive(),
  deleteBehavior: z.enum(["archive", "delete", "ignore"]).optional(),
  aiEnrich: z.boolean().optional(),
  // Optional admin-authored instruction text per AI column. Normalized before
  // it is handed to the sheet builder; invalid entries fall back to defaults.
  aiPrompts: z.record(z.string(), z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const access = await requireAdminPermission("google_sheets.manage");
  if (isAuthorizationError(access)) return access;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Thiếu setId hợp lệ.", code: "INVALID_SCHEMA" }, { status: 400 });
  const setId = parsed.data.setId;
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, setId)).limit(1);
  if (!set) return NextResponse.json({ error: "Không tìm thấy bộ từ vựng.", code: "NOT_FOUND" }, { status: 404 });
  const scoped = await requireAdminResourceAccess({ permission: "google_sheets.manage", folderId: set.folderId, level: "editor", access });
  if (isAuthorizationError(scoped)) return scoped;

  // ---- Existing connection -------------------------------------------------
  // A connection row is not proof of a working integration: a half-finished
  // create leaves status=error/enabled=false with the spreadsheet already
  // created. A flat 409 for *any* row is what made the admin UI ("Chưa kết
  // nối") and the API disagree, so every state gets its own actionable outcome
  // and no state ever silently spawns a second spreadsheet.
  const existing = await loadConnectionForSet(setId);
  if (existing) {
    const view = connectionView(existing);
    if (view === "connected" || view === "paused") {
      // Idempotent: return the existing connection instead of creating a new
      // spreadsheet or answering an unhelpful 409 conflict.
      return NextResponse.json({
        connectionId: existing.id,
        spreadsheetId: existing.spreadsheetId,
        spreadsheetUrl: existing.spreadsheetUrl,
        sheetId: existing.sheetId,
        sheetTitle: existing.sheetTitle,
        status: existing.status,
        alreadyConnected: true,
        paused: view === "paused",
        view,
        message: connectionViewMessage(view),
      }, { status: 200 });
    }

    // error / disconnected: recover the existing spreadsheet, never duplicate it.
    if (!isGoogleOAuthConfigured()) return createSheetJson({ status: 501, body: { error: "Google OAuth chưa được cấu hình trên máy chủ.", code: "NOT_CONFIGURED", retryable: false, setId } });
    try {
      const result = await recoverGoogleSheetConnection(existing.id, { userId: access.userId });
      return NextResponse.json({ ...result, recovered: true, view: "connected", alreadyConnected: false }, { status: 200 });
    } catch (error) {
      if (error instanceof GoogleSheetsError && (error.code === "OAUTH_REQUIRED" || error.code === "OAUTH_REVOKED")) {
        // Expected onboarding state: hand the browser the OAuth continuation,
        // exactly like the not-yet-connected case below.
        return createSheetJson(createSheetErrorOutcome(error, setId));
      }
      if (error instanceof GoogleSheetsError && error.code === "SHEET_NOT_FOUND") {
        // The old spreadsheet is verifiably gone: only now may a fresh one be
        // created. The unusable row is removed first so the unique-on-set logic
        // cannot reject the replacement; mappings already cascade-delete with it.
        await db.delete(googleSheetConnections).where(eq(googleSheetConnections.id, existing.id));
        console.warn("[google-sheets] removed unusable connection", existing.id, "set", setId);
      } else if (error instanceof GoogleSheetsError && error.code === "INVALID_SCHEMA") {
        return NextResponse.json({ error: "Google Sheet đã được tạo nhưng kết nối chưa hoàn tất. Vui lòng thử khôi phục.", code: error.code, setId }, { status: 409 });
      }
      // Any other recovery failure falls through to the create attempt below,
      // which re-checks the connection state under the create lock.
    }
  }

  if (!isGoogleOAuthConfigured()) return createSheetJson({ status: 501, body: { error: "Google OAuth chưa được cấu hình trên máy chủ.", code: "NOT_CONFIGURED", retryable: false, setId } });
  try {
    const aiPrompts: AiPromptOverrides = {};
    for (const [key, value] of Object.entries(parsed.data.aiPrompts ?? {})) {
      const prompt = normalizeAiPrompt(value);
      if (prompt) aiPrompts[key as keyof AiPromptOverrides] = prompt;
    }
    const result = await createGoogleSheetForSet(setId, { userId: access.userId, displayName: access.displayName }, undefined, { aiEnrich: parsed.data.aiEnrich, aiPrompts });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof GoogleSheetsError) {
      const outcome = createSheetErrorOutcome(error, setId);
      if (outcome.kind === "failed") console.error("[google-sheets] create failed", error.code, error.message);
      return createSheetJson(outcome);
    }
    // Anything else (PostgresError, timeout, unexpected throw) must still come
    // back as a structured, admin-friendly JSON response - never a raw 502 with
    // an empty body. The raw message is logged server-side only.
    console.error("[google-sheets] create failed (non-GoogleSheetsError)", error instanceof Error ? error.name + ": " + error.message : String(error));
    return createSheetJson(createSheetErrorOutcome(new GoogleSheetsError("Không thể tạo Google Sheet lúc này.", "UNKNOWN", { retryable: true }), setId));
  }
}
