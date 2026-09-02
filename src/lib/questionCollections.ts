export const QUESTION_COLLECTION_KEYS = ["quiz", "essay", "speaking"] as const;
export type QuestionCollectionKey = (typeof QUESTION_COLLECTION_KEYS)[number];

export const QUESTION_COLLECTION_META: Record<QuestionCollectionKey, { label: string; questionTypes: readonly string[] }> = {
  quiz: { label: "Bộ trắc nghiệm", questionTypes: ["multiple_choice", "true_false"] },
  essay: { label: "Bộ tự luận", questionTypes: ["essay"] },
  speaking: { label: "Bộ Speaking", questionTypes: ["speaking"] },
};

export function questionCollectionForType(questionType: string): QuestionCollectionKey | null {
  return QUESTION_COLLECTION_KEYS.find((key) => QUESTION_COLLECTION_META[key].questionTypes.includes(questionType)) || null;
}

export function questionTypesForCollections(keys: readonly string[]) {
  return QUESTION_COLLECTION_KEYS.flatMap((key) => keys.includes(key) ? [...QUESTION_COLLECTION_META[key].questionTypes] : []);
}

