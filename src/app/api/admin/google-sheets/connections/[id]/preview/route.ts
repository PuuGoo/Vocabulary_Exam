import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { requireAdminResourceAccess } from "@/lib/folderAuthorization";
import { db } from "@/db";
import { googleSheetConnections, googleSheetRowMappings, vocabSets, words } from "@/db/schema";
import { gridFromValuesRange, parseSheetGrid } from "@/lib/googleSheets/parser";
import { getGoogleSheetTemplate } from "@/lib/googleSheets/template";
import { computeWordFingerprint } from "@/lib/googleSheets/fingerprint";
import { readSourceIdCell } from "@/lib/googleSheets/identity";
import { parseVocabularyRows } from "@/lib/vocabImport/parse";
import { importWordKey } from "@/lib/importDedup";
import { apiForUser } from "@/lib/googleSheets/sheetLifecycle";
import { GoogleSheetsError } from "@/lib/googleSheets/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Dry-run diff: no DB writes, safe to call repeatedly. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireAdminPermission("google_sheets.view");
  if (isAuthorizationError(access)) return access;
  const connectionId = Number(params.id);
  const [connection] = await db.select().from(googleSheetConnections).where(eq(googleSheetConnections.id, connectionId)).limit(1);
  if (!connection) return NextResponse.json({ error: "Không tìm thấy kết nối." }, { status: 404 });
  const [set] = await db.select().from(vocabSets).where(eq(vocabSets.id, connection.setId)).limit(1);
  if (!set) return NextResponse.json({ error: "Không tìm thấy bộ từ vựng." }, { status: 404 });
  const scoped = await requireAdminResourceAccess({ permission: "google_sheets.view", folderId: set.folderId, level: "viewer", access });
  if (isAuthorizationError(scoped)) return scoped;
  try {
    const api = await apiForUser(access.userId);
    const range = `'${connection.sheetTitle.replace(/'/g, "''")}'!A:Z`;
    const grid = gridFromValuesRange(await api.readValues(connection.spreadsheetId, range));
    const template = getGoogleSheetTemplate(set);
    const parsed = parseSheetGrid(grid, template);
    const [existingWords, mappings] = await Promise.all([
      db.select().from(words).where(eq(words.setId, set.id)).orderBy(asc(words.position), asc(words.id)),
      db.select().from(googleSheetRowMappings).where(eq(googleSheetRowMappings.connectionId, connectionId)),
    ]);
    const mappingBySourceId = new Map(mappings.map((mapping) => [mapping.sourceId, mapping]));
    const wordById = new Map(existingWords.map((word) => [word.id, word]));
    const existingKeys = existingWords.map((word) => importWordKey({ term: word.term, v1: word.v1, v2: word.v2, v3: word.v3 }, set.type));
    const drafts = parseVocabularyRows(parsed.map((row) => ({ ...row.values, __lexora_id: row.sourceId })), set, existingKeys);

    let created = 0; let updated = 0; let unchanged = 0;
    for (const row of parsed) {
      const draft = drafts.rows.find((candidate, index) => index === row.rowNumber - 2);
      if (!draft) continue;
      const mapping = mappingBySourceId.get(readSourceIdCell(row.sourceId));
      const word = mapping?.wordId != null ? wordById.get(mapping.wordId) : undefined;
      if (!word) { created += 1; continue; }
      const rowFingerprint = computeWordFingerprint(set.type, row.values as Record<string, string>);
      const dbFingerprint = computeWordFingerprint(set.type, word as unknown as Record<string, string>);
      if (dbFingerprint === rowFingerprint) unchanged += 1; else updated += 1;
    }
    return NextResponse.json({
      totalRows: parsed.length,
      new: created,
      update: updated,
      unchanged,
      duplicate: drafts.duplicateCount,
      invalid: drafts.invalidCount,
      invalidRows: drafts.issues.filter((issue) => issue.code !== "DUPLICATE").slice(0, 50),
    });
  } catch (error) {
    if (error instanceof GoogleSheetsError) return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    console.error("[google-sheets] preview failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Không thể xem trước đồng bộ." }, { status: 502 });
  }
}
