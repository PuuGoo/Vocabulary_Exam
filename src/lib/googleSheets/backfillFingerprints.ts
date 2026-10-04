import "dotenv/config";
import postgres from "postgres";
import { getGoogleSheetTemplate, SOURCE_ID_HEADER } from "@/lib/googleSheets/template";
import { fingerprintDbWord } from "@/lib/googleSheets/fingerprint";

/**
 * One-time backfill: re-anchor google_sheet_row_mappings fingerprints onto the
 * new canonical, template-scoped fingerprint.
 *
 * Why this exists: every fingerprint written before this fix used the old
 * global key list, while the sync now derives its keys from template.fields.
 * A hash from the old rule can never equal the new one, so on the first sync
 * after deploy BOTH sides (DB and Sheet) would differ from the stored value
 * and the conflict rule would fire on healthy, untouched rows.
 *
 * What it writes: last_synced_fingerprint = fingerprintDbWord(current word).
 * That is exactly the value a successful sync writes, and it makes the DB the
 * anchor for the next run - so the next genuine Google Sheets edit resolves as
 * an UPDATE instead of a conflict. source_fingerprint is left untouched: it
 * records what the Sheet itself last produced.
 */
export type BackfillResult = { scanned: number; reanchored: number; alreadyCurrent: number };

export async function backfillFingerprints(): Promise<BackfillResult> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const sql = postgres(connectionString, { max: 1, ssl: "require", connect_timeout: 30 });
  try {
    const rows = await sql`
      select m.id as mapping_id, m.last_synced_fingerprint as stored,
             s.type as set_type, s.language_code as language_code,
             w.term, w.meaning, w.ipa, w.wtype, w.example, w.example_pronunciation, w.example_meaning,
             w.level, w.cefr_level, w.ielts_band_relevance, w.ielts_skills, w.usage_context,
             w.register, w.frequency, w.notes, w.alternate_term, w.pronunciation, w.classifier,
             w.v1, w.v2, w.v3, w.ipa_v1, w.ipa_v2, w.ipa_v3
      from google_sheet_row_mappings m
      join google_sheet_connections c on c.id = m.connection_id
      join vocab_sets s on s.id = c.set_id
      join words w on w.id = m.word_id
      where m.word_id is not null and m.deleted_at is null
    `;
    const result: BackfillResult = { scanned: rows.length, reanchored: 0, alreadyCurrent: 0 };
    for (const row of rows) {
      const template = getGoogleSheetTemplate({ type: row.set_type, languageCode: row.language_code });
      const values = templateValues(row, template);
      const newFingerprint = fingerprintDbWord(template, values);
      if (row.stored === newFingerprint) {
        result.alreadyCurrent += 1;
        continue;
      }
      await sql`
        update google_sheet_row_mappings
        set last_synced_fingerprint = ${newFingerprint}, updated_at = now()
        where id = ${row.mapping_id}
      `;
      result.reanchored += 1;
    }
    return result;
  } finally {
    await sql.end();
  }
}

function templateValues(row: Record<string, unknown>, template: ReturnType<typeof getGoogleSheetTemplate>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of template.fields) {
    if (field.key === SOURCE_ID_HEADER) continue;
    // Postgres returns snake_case column names (example_pronunciation,
    // ielts_band_relevance, ...) while template fields use camelCase keys.
    const snakeKey = toSnake(field.key);
    const value = Object.prototype.hasOwnProperty.call(row, snakeKey) ? row[snakeKey] : row[field.key];
    values[field.key] = value == null ? "" : String(value);
  }
  return values;
}

function toSnake(key: string): string {
  return key.replace(/([A-Z])/g, "_$1").toLowerCase();
}
