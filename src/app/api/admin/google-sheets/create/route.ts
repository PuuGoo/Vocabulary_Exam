import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { db } from "@/db";
import { googleSheetConnections, vocabSets } from "@/db/schema";
import { createGoogleSheetForSet, recreateFreshSheetForSet } from "@/lib/googleSheets/sheetLifecycle";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";
import { isGoogleOAuthConfigured } from "@/lib/googleSheets/auth";
import { createSheetErrorOutcome, createSheetJson } from "@/lib/googleSheets/createFlow";
import { connectionView, connectionViewMessage, isTerminalConnectionState, loadConnectionForSet, recoverGoogleSheetConnection } from "@/lib/googleSheets/recovery";
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
  // Clicking "Tạo Google Sheet mới" on the broken card for a terminal
  // connection (archived / replaced). It is the only path that may retire
  // that terminal row and forge a fresh one — never a normal "create".
  recreateAfterTerminal: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const access = await requireAdminPermission("google_sheets.manage");
  if (isAuthorizationError(access)) return access;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Thiếu setId hợp lệ.", code: "INVALID_SCHEMA" }, { status: 400 });
  const setId = parsed.data.setId;
  const wantRecreateAfterTerminal = parsed.data.recreateAfterTerminal === true;
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

    // archived / replaced are deliberate terminal states: the Sheet was
    // trashed or swapped on purpose. Recovery must NOT resurrect them, and
    // the old code fell through to createGoogleSheetForSet, which threw a
    // bare 409 for *any* existing row — the dead end the admin kept hitting.
    if (isTerminalConnectionState(existing)) {
      // ...unless the admin explicitly asks to forge a fresh Sheet: verified
      // before the forge runs, with the archived-word carry done at the DB
      // so Google Sheets' own deleted_at → archived_semantics stays true.
      if (wantRecreateAfterTerminal && !isGoogleOAuthConfigured()) {
        return createSheetJson({ status: 501, body: { error: "Google OAuth chưa được cấu hình trên máy chủ.", code: "NOT_CONFIGURED", retryable: false, setId } });
      }
      if (wantRecreateAfterTerminal) {
        const retired = await recreateFreshSheetForSet(setId, existing.id, { userId: access.userId, displayName: access.displayName }, { aiEnrich: parsed.data.aiEnrich, aiPrompts: parsed.data.aiPrompts ?? {} });
        return NextResponse.json(retired, { status: 201 });
      }
      return NextResponse.json({
        error: view === "archived"
          ? "Google Sheet của bộ từ này đã được đưa vào Thùng rác. Hãy tạo Google Sheet mới để tiếp tục."
          : "Google Sheet của bộ từ này đã được thay thế. Hãy kiểm tra kết nối hiện tại hoặc tạo Sheet mới.",
        code: "INVALID_SCHEMA",
        view,
        terminal: true,
        needsCreateNew: true,
        connectionId: existing.id,
        retryable: false,
        setId,
      }, { status: 409 });
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
        // The row exists but its tab/metadata cannot be resolved (e.g. the tab
        // was deleted in Google). Recovery is impossible without touching the
        // existing spreadsheet, so offer the recovery dialog explicitly rather
        // than an opaque conflict.
        return NextResponse.json({
          error: "Google Sheet đã được tạo nhưng kết nối chưa hoàn tất. Hãy khôi phục kết nối hiện có.",
          code: error.code,
          needsRecovery: true,
          connectionId: existing.id,
          retryable: true,
          setId,
        }, { status: 409 });
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
    // Race-safe fallback: Postgres unique-violation (23505) on the
    // google_sheet_connections_set_unique index means another request won the
    // create race (or the pre-check missed a concurrent insert). Re-read the
    // connection and return it instead of a 502/409: the set ends up with
    // exactly one row and no vocabulary is touched.
    if (isUniqueViolation(error)) {
      const raced = await loadConnectionForSet(setId);
      if (raced) {
        const view = connectionView(raced);
        console.warn("[google-sheets] create raced, returning existing connection", raced.id, "set", setId);
        return NextResponse.json({
          connectionId: raced.id,
          spreadsheetId: raced.spreadsheetId,
          spreadsheetUrl: raced.spreadsheetUrl,
          sheetId: raced.sheetId,
          sheetTitle: raced.sheetTitle,
          status: raced.status,
          alreadyConnected: view === "connected" || view === "paused",
          needsRecovery: view === "error" || view === "disconnected",
          raced: true,
          view,
          message: connectionViewMessage(view),
        }, { status: 200 });
      }
    }
    // Anything else (PostgresError, timeout, unexpected throw) must still come
    // back as a structured, admin-friendly JSON response - never a raw 502 with
    // an empty body. The raw message is logged server-side only.
    console.error("[google-sheets] create failed (non-GoogleSheetsError)", error instanceof Error ? error.name + ": " + error.message : String(error));
    return createSheetJson(createSheetErrorOutcome(new GoogleSheetsError("Không thể tạo Google Sheet lúc này.", "UNKNOWN", { retryable: true }), setId));
  }
}

/**
 * Detect a Postgres unique-violation without importing pg internals.
 * drizzle/postgres-js surface it as { code: "23505" } on the thrown error.
 */
function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const rec = error as Record<string, unknown>;
  if (String(rec.code ?? "") === "23505") return true;
  const cause = rec.cause;
  if (cause && typeof cause === "object" && String((cause as Record<string, unknown>).code ?? "") === "23505") return true;
  const message = error instanceof Error ? error.message : "";
  return /duplicate key|already exists|google_sheet_connections_set_unique|google_sheet_connections_spreadsheet_idx/i.test(message);
}
