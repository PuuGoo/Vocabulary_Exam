export type MistakeRow = {
  id: number;
  timesWrong: number;
  lastWrongAt: string;
  wordId: number;
  meaning: string;
  term: string | null;
  alternateTerm?: string | null;
  pronunciation?: string | null;
  v1: string | null;
  v2: string | null;
  v3: string | null;
  ipa: string | null;
  setId: number;
  setName: string;
  setType: "irregular_verb" | "ielts_vocab" | "language_vocab";
  languageCode?: string | null;
  languageSettings?: unknown;
};

export type MistakeSetGroup = {
  setId: number;
  setName: string;
  setType: "irregular_verb" | "ielts_vocab" | "language_vocab";
  languageCode?: string | null;
  languageSettings?: unknown;
  items: MistakeRow[];
};

export function groupMistakesBySet(rows: MistakeRow[]): MistakeSetGroup[] {
  const groups = new Map<number, MistakeSetGroup>();
  for (const row of rows) {
    let group = groups.get(row.setId);
    if (!group) {
      group = { setId: row.setId, setName: row.setName, setType: row.setType, languageCode: row.languageCode, languageSettings: row.languageSettings, items: [] };
      groups.set(row.setId, group);
    }
    group.items.push(row);
  }
  return Array.from(groups.values());
}
