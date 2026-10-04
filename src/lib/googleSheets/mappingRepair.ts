import type { SheetsValue } from "./api";
import type { GoogleSheetTemplate } from "./template";
import { gridFromValuesRange, parseSheetGrid } from "./parser";
import { isValidSourceId } from "./identity";
import { importWordKey } from "@/lib/importDedup";
import { fingerprintDbWord } from "./fingerprint";

export function planMappingRepair(input: {
  values: SheetsValue;
  template: GoogleSheetTemplate;
  setType: string;
  words: Array<{ id: number; term: string | null; v1: string | null; v2: string | null; v3: string | null }>;
  mappings: Array<{ wordId: number | null; sourceId: string }>;
}) {
  const rows = parseSheetGrid(gridFromValuesRange(input.values), input.template);
  const seen = new Set<string>();
  const mappedWords = new Set(input.mappings.map(mapping => mapping.wordId));
  const mappedIds = new Set(input.mappings.map(mapping => mapping.sourceId));
  const wordsByKey = new Map<string, typeof input.words>();
  for (const word of input.words) {
    const key = importWordKey(word, input.setType);
    wordsByKey.set(key, [...(wordsByKey.get(key) ?? []), word]);
  }
  const planned = [];
  for (const row of rows) {
    if (!row.sourceId) continue;
    if (!isValidSourceId(row.sourceId) || seen.has(row.sourceId)) throw new Error("Sheet có ID sai hoặc trùng. Không thể khôi phục mapping an toàn.");
    seen.add(row.sourceId);
    if (mappedIds.has(row.sourceId)) continue;
    const matches = wordsByKey.get(importWordKey(row.values, input.setType)) ?? [];
    if (matches.length > 1) throw new Error("Có nhiều từ cùng danh tính. Hãy xử lý trùng trước khi khôi phục.");
    if (!matches.length) continue;
    const word = matches[0];
    if (mappedWords.has(word.id)) throw new Error("Từ đã gắn với một ID khác. Không tự thay đổi danh tính dòng.");
    const baseline = fingerprintDbWord(input.template, word as unknown as Record<string, unknown>);
    planned.push({ wordId: word.id, sourceId: row.sourceId, sheetRowNumber: row.rowNumber, sourceFingerprint: baseline, lastSyncedFingerprint: baseline });
    mappedWords.add(word.id);
  }
  return planned;
}
