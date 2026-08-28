import {
  normalizeQuestionIdentity,
  revalidateParsedQuestion,
  type ParsedQuestion,
} from "./questionImportParser";

export type SpreadsheetRow = Record<string, unknown>;

export function spreadsheetOptionId(index: number) {
  return index >= 0 && index < 26 ? String.fromCharCode(65 + index) : "";
}

export function safeSpreadsheetCell(value: unknown) {
  const text = String(value ?? "");
  return /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
}

function normalizedRow(row: SpreadsheetRow) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value]));
}

export function parseQuestionSpreadsheetRows(
  rows: SpreadsheetRow[],
  existingQuestions: Array<{ id?: number; question: string }> = [],
) {
  const existingByIdentity = new Map(existingQuestions.map((item) => [normalizeQuestionIdentity(item.question), item]));
  const seenQuestions = new Map<string, ParsedQuestion>();
  const idCounts = new Map<string, number>();

  for (const source of rows) {
    const row = normalizedRow(source);
    const stableId = String(row.id ?? "").trim();
    if (stableId) idCounts.set(stableId, (idCounts.get(stableId) || 0) + 1);
  }

  return rows.map((source, index) => {
    const row = normalizedRow(source);
    const optionEntries = Array.from({ length: 26 }, (_, optionIndex) => {
      const id = spreadsheetOptionId(optionIndex);
      const text = String(row[`option_${id.toLowerCase()}`] ?? "").trim();
      return { id, text };
    }).filter((option) => option.text);
    const rawAnswer = String(row.correct_answer ?? "").toUpperCase();
    const requestedAnswers = [...new Set(rawAnswer.match(/[A-Z]|\d+/g) || [])];
    const correctIds = requestedAnswers.map((token) => /^\d+$/.test(token)
      ? optionEntries[Number(token) - 1]?.id || ""
      : optionEntries.some((option) => option.id === token) ? token : "").filter(Boolean);
    const typeValue = String(row.type || (optionEntries.length ? "multiple_choice" : "essay")).toLowerCase();
    const type = (["multiple_choice", "true_false", "essay", "speaking"].includes(typeValue) ? typeValue : "unknown") as ParsedQuestion["type"];
    const difficultyValue = String(row.difficulty || "").toLowerCase();
    const speakingPartValue = String(row.speaking_part || "").toLowerCase();
    const item: ParsedQuestion = {
      clientId: `xlsx-${index}`,
      sourceNumber: String(row.question_number || index + 1),
      sourceStart: index,
      sourceEnd: index,
      raw: JSON.stringify(source, null, 2),
      question: String(row.question ?? "").trim(),
      type,
      options: optionEntries.map((option) => ({ ...option, isCorrect: correctIds.includes(option.id) })),
      answer: String(row.answer || row.sample_answer || "").trim(),
      explanation: String(row.explanation || "").trim(),
      difficulty: (["easy", "medium", "hard"].includes(difficultyValue) ? difficultyValue : "") as ParsedQuestion["difficulty"],
      tags: String(row.tags || "").split(/[,;]/).map((tag) => tag.trim()).filter(Boolean),
      speakingPart: (["part_1", "part_2", "part_3"].includes(speakingPartValue) ? speakingPartValue : "") as ParsedQuestion["speakingPart"],
      topic: String(row.topic || "").trim(),
      confidence: 0,
      status: "needs_review",
      issues: [],
    };
    if (requestedAnswers.length && correctIds.length !== requestedAnswers.length) item.issues.push("INVALID_CORRECT_ANSWER");
    const stableId = String(row.id ?? "").trim();
    if (stableId && (idCounts.get(stableId) || 0) > 1) item.issues.push("DUPLICATE_STABLE_ID");
    const identity = normalizeQuestionIdentity(item.question);
    const existing = existingByIdentity.get(identity);
    const prior = seenQuestions.get(identity);
    if (identity && (existing || prior)) {
      item.duplicateOf = existing ? { ...existing, similarity: 1 } : { question: prior!.question, similarity: 1 };
      item.issues.push("POSSIBLE_DUPLICATE");
    }
    if (identity) seenQuestions.set(identity, item);
    return revalidateParsedQuestion(item);
  });
}
