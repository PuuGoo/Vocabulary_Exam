import { generateSourceId, isValidSourceId } from "./identity";

export function replacementIdentities(
  wordIds: readonly number[],
  mappings: ReadonlyArray<{ wordId: number | null; sourceId: string; deletedAt?: Date | null }>,
) {
  const byWord = new Map<number, string>();
  const used = new Set<string>();
  const archivedWordIds = new Set<number>();
  for (const mapping of mappings) {
    if (!isValidSourceId(mapping.sourceId) || used.has(mapping.sourceId)) throw new Error("Danh tính dòng không hợp lệ hoặc trùng; hãy sửa kết nối trước khi thay Sheet.");
    used.add(mapping.sourceId);
    if (mapping.wordId == null) continue;
    if (byWord.has(mapping.wordId)) throw new Error("Một từ có nhiều danh tính dòng; không thể thay Sheet an toàn.");
    byWord.set(mapping.wordId, mapping.sourceId);
    if (mapping.deletedAt) archivedWordIds.add(mapping.wordId);
  }
  return wordIds.filter(wordId => !archivedWordIds.has(wordId)).map(wordId => {
    const sourceId = byWord.get(wordId) ?? generateSourceId(used);
    used.add(sourceId);
    return { wordId, sourceId };
  });
}
