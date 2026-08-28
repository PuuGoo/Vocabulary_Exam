export type ImportedQuestionType = "multiple_choice" | "true_false" | "essay" | "speaking" | "unknown";
export type ImportStatus = "ready" | "needs_review" | "error";
export type ImportIssueCode =
  | "MISSING_QUESTION" | "MISSING_OPTIONS" | "EMPTY_OPTION" | "INVALID_CORRECT_ANSWER"
  | "CONFLICTING_ANSWERS" | "MISSING_CORRECT_ANSWER" | "POSSIBLE_DUPLICATE"
  | "POSSIBLE_MERGED_QUESTIONS" | "DUPLICATE_OPTION_MARKER" | "DUPLICATE_STABLE_ID" | "UNKNOWN_TYPE";

export type ParsedOption = { id: string; text: string; isCorrect: boolean };
export type ParsedQuestion = {
  clientId: string;
  sourceNumber: string | null;
  sourceStart: number;
  sourceEnd: number;
  raw: string;
  question: string;
  type: ImportedQuestionType;
  options: ParsedOption[];
  answer: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard" | "";
  tags: string[];
  speakingPart: "part_1" | "part_2" | "part_3" | "";
  topic: string;
  confidence: number;
  structurallyValid: boolean;
  status: ImportStatus;
  issues: ImportIssueCode[];
  detectedAnswer?: string;
  answerKeyAnswer?: string;
  duplicateOf?: { id?: number; question: string; similarity: number };
};

export type ParsingProfile = {
  name: string;
  questionPattern?: string;
  optionPattern?: string;
  answerPattern?: string;
  explanationPattern?: string;
  defaultType?: ImportedQuestionType;
};

export type ParseQuestionOptions = {
  profile?: ParsingProfile;
  existingQuestions?: Array<{ id?: number; question: string }>;
};

const ANSWER_RE = /^(?:đáp\s*án|đ[áa]|da|answer|correct(?:\s+answer|\s+option)?|trả\s*lời)\s*(?:[:=\-]\s*|\s+)(.*)$/iu;
const EXPLANATION_RE = /^(?:giải\s*thích|explanation|solution|hướng\s*dẫn|gợi\s*ý)\s*[:=\-]?\s*(.*)$/iu;
const QUESTION_RE = /^(?:(?:câu|question|q)\s*)?(\d+)\s*[\.)\]:\-]\s*(.*)$/iu;
const EXPLICIT_QUESTION_RE = /^(?:câu|question|q)\s*(\d+)\s*(?:[\.)\]:\-]\s*|\s+)(.*)$/iu;
const LETTER_OPTION_RE = /^(\*?)\s*([a-z])\s*[\.)\]:\/\-]\s*(?:\[([xX ])\]\s*)?(.*)$/iu;
const BARE_LETTER_OPTION_RE = /^(\*?)\s*([a-z])\s+(?:\[([xX ])\]\s*)?(.+)$/iu;
const NUMBER_OPTION_RE = /^(\*?)\s*(\d{1,2})\s*[\.)\]:\/\-]\s*(?:\[([xX ])\]\s*)?(.*)$/u;
const CIRCLED_OPTION_RE = /^(\*?)\s*([Ⓐ-Ⓩⓐ-ⓩ①-⑳])\s*(?:[\.)\]:\/\-]\s*)?(?:\[([xX ])\]\s*)?(.*)$/u;
const FINAL_ANSWER_RE = /^\s*(\d+)\s*[-.:]\s*([A-Z](?:\s*[,;/+]\s*[A-Z])*)\s*$/iu;
const ESSAY_START_RE = /^(?:(?:hãy|please)\s+)?(?:describe|discuss|explain|analyse|analyze|present|trình\s+bày|phân\s+tích|nêu|giải\s+thích|so\s+sánh|chứng\s+minh)\b/iu;

export function normalizeQuestionImportText(raw: string) {
  return raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .split("\n").map((line) => line.replace(/[\t ]+/g, " ").trim()).join("\n")
    .replace(/\n{4,}/g, "\n\n\n").trim();
}

export function normalizeQuestionIdentity(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi")
    .replace(/[^a-z0-9\u00c0-\u1ef9]+/gi, " ").replace(/\s+/g, " ").trim();
}

function answerIds(value: string, options: ParsedOption[]) {
  const validIds = new Set(options.map((option) => option.id));
  const tokens = value.toUpperCase().match(/[A-Z]|\d+/g) || [];
  return [...new Set(tokens.map((token) => {
    if (/^\d+$/.test(token)) return options[Number(token) - 1]?.id || "";
    return validIds.has(token) ? token : "";
  }).filter(Boolean))];
}

function circledOptionId(marker: string) {
  const code = marker.codePointAt(0) || 0;
  if (code >= 0x24b6 && code <= 0x24cf) return String.fromCharCode(65 + code - 0x24b6);
  if (code >= 0x24d0 && code <= 0x24e9) return String.fromCharCode(65 + code - 0x24d0);
  if (code >= 0x2460 && code <= 0x2473) return String.fromCharCode(65 + code - 0x2460);
  return "";
}

function validate(question: ParsedQuestion) {
  const issues: ImportIssueCode[] = [];
  if (question.question.replace(/[^\p{L}\p{N}]/gu, "").trim().length < 2) issues.push("MISSING_QUESTION");
  if (question.type === "unknown") issues.push("UNKNOWN_TYPE");
  if (question.type === "multiple_choice" || question.type === "true_false") {
    if (question.options.length < 2) issues.push("MISSING_OPTIONS");
    if (question.options.some((option) => !option.text.trim())) issues.push("EMPTY_OPTION");
    if (!question.options.some((option) => option.isCorrect)) issues.push("MISSING_CORRECT_ANSWER");
  }
  if ((question.question.match(/\?+/g) || []).length >= 3) issues.push("POSSIBLE_MERGED_QUESTIONS");
  if (/\b(?:câu|question|q)?\s*\d+\s*[.)\]:-]\s*[^\n]{2,}\?\s+[A-Z]\s*[.)\]:\/-]\s*/iu.test(question.question)) issues.push("POSSIBLE_MERGED_QUESTIONS");
  return issues;
}

function similarity(left: string, right: string) {
  const a = new Set(normalizeQuestionIdentity(left).split(" ").filter(Boolean));
  const b = new Set(normalizeQuestionIdentity(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  let common = 0; for (const token of a) if (b.has(token)) common += 1;
  return (2 * common) / (a.size + b.size);
}

export function revalidateParsedQuestion(question: ParsedQuestion): ParsedQuestion {
  const structuralIssues = validate(question);
  const preserved = question.issues.filter((issue) => issue === "POSSIBLE_DUPLICATE" || issue === "CONFLICTING_ANSWERS" || issue === "INVALID_CORRECT_ANSWER" || issue === "DUPLICATE_OPTION_MARKER" || issue === "DUPLICATE_STABLE_ID" || issue === "POSSIBLE_MERGED_QUESTIONS");
  const issues = [...new Set([...structuralIssues, ...preserved])];
  const severe = issues.includes("MISSING_QUESTION") || issues.includes("MISSING_OPTIONS") || issues.includes("EMPTY_OPTION");
  const structurallyValid = !severe && question.type !== "unknown";
  const parseIssues = issues.filter((issue) => issue === "POSSIBLE_MERGED_QUESTIONS" || issue === "DUPLICATE_OPTION_MARKER" || issue === "UNKNOWN_TYPE");
  const confidence = Math.max(0.05, Math.min(1, 1 - parseIssues.length * 0.14 - (question.sourceNumber ? 0 : 0.05) - (question.type === "unknown" ? 0.2 : 0)));
  return { ...question, issues, confidence, structurallyValid, status: severe ? "error" : structurallyValid && issues.length === 0 ? "ready" : "needs_review" };
}

export function parseQuestionImport(rawInput: string, config: ParseQuestionOptions = {}) {
  const normalized = normalizeQuestionImportText(rawInput);
  const lines = normalized ? normalized.split("\n") : [];
  const finalAnswers = new Map<string, string>();
  for (const line of lines) { const match = line.match(FINAL_ANSWER_RE); if (match) finalAnswers.set(match[1], match[2]); }
  const results: ParsedQuestion[] = [];
  let current: ParsedQuestion | null = null;
  let target: "question" | "option" | "answer" | "explanation" = "question";
  let currentOption = -1;
  let speakingPart: ParsedQuestion["speakingPart"] = "";
  let topic = "";
  let pendingNumber: string | null = null;
  const customRegex = (pattern?: string) => { if (!pattern) return null; try { return new RegExp(pattern, "iu"); } catch { return null; } };
  const customQuestion = customRegex(config.profile?.questionPattern);
  const customOption = customRegex(config.profile?.optionPattern);
  const customAnswer = customRegex(config.profile?.answerPattern);
  const customExplanation = customRegex(config.profile?.explanationPattern);

  function create(lineIndex: number, number: string | null, text: string) {
    return { clientId: `q-${lineIndex}-${results.length}`, sourceNumber: number, sourceStart: lineIndex, sourceEnd: lineIndex, raw: "", question: text.trim(), type: config.profile?.defaultType || (speakingPart ? "speaking" : "unknown"), options: [], answer: "", explanation: "", difficulty: "", tags: [], speakingPart, topic, confidence: 0, structurallyValid: false, status: "needs_review", issues: [] } satisfies ParsedQuestion;
  }
  function finish(end: number) {
    if (!current) return;
    current.sourceEnd = Math.max(current.sourceStart, end);
    current.raw = lines.slice(current.sourceStart, current.sourceEnd + 1).join("\n");
    if (current.options.length >= 1) {
      const trueFalse = current.options.length === 2 && current.options.every((option) => /^(true|false|đúng|sai)$/iu.test(option.text));
      current.type = trueFalse ? "true_false" : "multiple_choice";
    } else if (current.answer) current.type = current.type === "speaking" ? "speaking" : "essay";
    else if (current.type === "unknown" && (/\?\s*$/.test(current.question) || ESSAY_START_RE.test(current.question))) current.type = speakingPart ? "speaking" : "essay";
    const listed = current.sourceNumber ? finalAnswers.get(current.sourceNumber) : undefined;
    if (listed) {
      const ids = answerIds(listed, current.options);
      if (!ids.length && current.options.length) current.issues.push("INVALID_CORRECT_ANSWER");
      current.options = current.options.map((option) => ({ ...option, isCorrect: ids.includes(option.id) }));
      if (ids.length) current.detectedAnswer = ids.join(",");
    }
    results.push(revalidateParsedQuestion(current)); current = null; currentOption = -1; target = "question";
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]; if (!line) continue;
    if (/^(?:page|trang)\s+\d+(?:\s+(?:of|\/|trên)\s*\d+)?$|^-{3,}$|^_{3,}$/iu.test(line)) continue;
    const part = line.match(/^part\s*([123])\b/iu); if (part) { finish(index - 1); speakingPart = `part_${part[1]}` as ParsedQuestion["speakingPart"]; continue; }
    const topicMatch = line.match(/^topic\s*[:\-]\s*(.+)$/iu); if (topicMatch) { topic = topicMatch[1].trim(); continue; }
    const nextNonEmpty = lines.slice(index + 1).find((candidate) => candidate.trim()) || "";
    const outlineHeading = line.match(/^([A-Z]|[IVXLCDM]+)[.)]\s+\S+/u); const expectedOptionId = current ? String.fromCharCode(65 + current.options.length) : "";
    const sectionHeading = /^(?:chương|phần|bài)\s+(?:\d+|[ivxlcdm]+)\b|^\d+\.\d+(?:\.\d+)*\s+/iu.test(line)
      || (!!outlineHeading && (!current || (current.options.length >= 2 && !!nextNonEmpty.match(QUESTION_RE) && outlineHeading[1] !== expectedOptionId)));
    if (sectionHeading) { finish(index - 1); continue; }
    if (/^answer\s*key(?:\s*[:\-])?$/iu.test(line) || (/^đáp\s*án(?:\s*[:\-])?$/iu.test(line) && FINAL_ANSWER_RE.test(nextNonEmpty))) { continue; }
    if (FINAL_ANSWER_RE.test(line)) continue;
    const explicit = line.match(EXPLICIT_QUESTION_RE);
    const customQuestionMatch = customQuestion ? line.match(customQuestion) : null;
    const generic = line.match(QUESTION_RE);
    if (generic && !generic[2] && !current) { pendingNumber = generic[1]; continue; }
    if (pendingNumber && !current) { current = create(index, pendingNumber, line); pendingNumber = null; continue; }
    const numericCouldBeOption = !!current && !!generic && !explicit && !speakingPart && Number(generic[1]) <= 26 && !/\?\s*$/.test(generic[2] || "") && ((current.options.length === 0 && /\?$/.test(current.question)) || (current.options.length > 0 && Number(generic[1]) === current.options.length + 1 && !current.options.some((option) => option.isCorrect)));
    if (explicit || customQuestionMatch || (generic && !numericCouldBeOption && generic[2])) {
      const match = explicit || customQuestionMatch || generic!; const groups = match.groups || {}; const customText = customQuestionMatch ? (groups.text || match.at(-1) || "") : match[2] || ""; const customNumber = customQuestionMatch ? (groups.number || null) : match[1] || null;
      finish(index - 1); current = create(index, customNumber, customText); continue;
    }
    if (current && /\?$/.test(line) && (current.options.length >= 2 || !!current.answer)) { finish(index - 1); current = create(index, null, line); continue; }
    if (!current && (/\?$/.test(line) || ESSAY_START_RE.test(line))) current = create(index, null, line);
    if (!current) continue;
    const builtInLetterOption = line.match(LETTER_OPTION_RE);
    const customOptionMatch = !builtInLetterOption && customOption ? line.match(customOption) : null;
    const letterOption = builtInLetterOption;
    const circledOption = !letterOption ? line.match(CIRCLED_OPTION_RE) : null;
    const bareLetterOption = !letterOption && !circledOption && current.options.length === 0
      ? line.match(BARE_LETTER_OPTION_RE) : !letterOption && !circledOption && line.match(BARE_LETTER_OPTION_RE)?.[2]?.toUpperCase() === String.fromCharCode(65 + current.options.length)
        ? line.match(BARE_LETTER_OPTION_RE) : null;
    const numberOption = !letterOption && !circledOption && !bareLetterOption ? line.match(NUMBER_OPTION_RE) : null;
    const optionMatch = letterOption || circledOption || bareLetterOption || numberOption || customOptionMatch;
    if (optionMatch) {
      const groups = optionMatch.groups || {}; const rawId = customOptionMatch ? (groups.id || optionMatch[1]) : optionMatch[2]; const id = circledOption ? circledOptionId(String(rawId)) : /^[A-Z]$/iu.test(String(rawId)) ? String(rawId).toUpperCase() : String.fromCharCode(64 + Number(rawId));
      const inlineCorrect = customOptionMatch ? /^(?:x|true|1|yes)$/iu.test(groups.correct || "") : optionMatch[1] === "*" || String(optionMatch[3] || "").toLowerCase() === "x";
      const optionText = customOptionMatch ? (groups.text || optionMatch[2] || optionMatch.at(-1) || "") : optionMatch[4] || "";
      if (current.options.some((option) => option.id === id)) current.issues.push("DUPLICATE_OPTION_MARKER");
      current.options.push({ id, text: String(optionText).trim(), isCorrect: inlineCorrect }); currentOption = current.options.length - 1; target = "option"; continue;
    }
    const answer = line.match(ANSWER_RE) || (customAnswer ? line.match(customAnswer) : null);
    if (answer) {
      const value = String(answer[1] || "").trim();
      if (current.options.length && value) {
        const ids = answerIds(value, current.options);
        const inlineIds = current.options.filter((option) => option.isCorrect).map((option) => option.id);
        if (inlineIds.length && ids.length && inlineIds.some((id) => !ids.includes(id))) current.issues.push("CONFLICTING_ANSWERS");
        if (!ids.length) current.issues.push("INVALID_CORRECT_ANSWER");
        current.options = current.options.map((option) => ({ ...option, isCorrect: ids.includes(option.id) || option.isCorrect }));
        if (ids.length) current.detectedAnswer = ids.join(",");
      } else if (!current.options.length) current.answer = value;
      target = "answer"; continue;
    }
    const explanation = line.match(EXPLANATION_RE) || (customExplanation ? line.match(customExplanation) : null);
    if (explanation) { current.explanation = String(explanation[1] || "").trim(); target = "explanation"; continue; }
    if (/^(?:you should say|bạn nên nói)\s*:?$/iu.test(line)) { current.question += "\nYou should say:"; target = "question"; continue; }
    const continuation = line.replace(/^[•▪◦*]\s*/, "").trim();
    if (target === "option" && currentOption >= 0) current.options[currentOption].text += ` ${continuation}`;
    else if (target === "answer" && current.options.length) { const ids = answerIds(continuation, current.options); if (ids.length) current.options = current.options.map((option) => ({ ...option, isCorrect: ids.includes(option.id) })); else current.issues.push("INVALID_CORRECT_ANSWER"); }
    else if (target === "answer") current.answer += `${current.answer ? " " : ""}${continuation}`;
    else if (target === "explanation") current.explanation += `${current.explanation ? " " : ""}${continuation}`;
    else current.question += `${current.question ? " " : ""}${continuation}`;
  }
  finish(lines.length - 1);

  const seen = new Map<string, ParsedQuestion>();
  const existing = config.existingQuestions || [];
  const existingExact = new Map(existing.map((candidate) => [normalizeQuestionIdentity(candidate.question), candidate]));
  const existingBuckets = new Map<string, Array<{ id?: number; question: string }>>();
  for (const candidate of existing) { const key = normalizeQuestionIdentity(candidate.question).split(" ").slice(0, 2).join(" "); existingBuckets.set(key, [...(existingBuckets.get(key) || []), candidate]); }
  return results.map((item) => {
    const identity = normalizeQuestionIdentity(item.question); const prior = seen.get(identity);
    const exact = existingExact.get(identity);
    let duplicate = exact ? { ...exact, similarity: 1 } : prior ? { question: prior.question, similarity: 1 } : undefined;
    if (!duplicate && item.question.length >= 20) {
      const bucket = existingBuckets.get(identity.split(" ").slice(0, 2).join(" ")) || [];
      const near = bucket.find((candidate) => similarity(candidate.question, item.question) >= 0.92);
      if (near) duplicate = { ...near, similarity: similarity(near.question, item.question) };
    }
    seen.set(identity, item);
    if (!duplicate) return item;
    return revalidateParsedQuestion({ ...item, duplicateOf: duplicate, issues: [...item.issues, "POSSIBLE_DUPLICATE"] });
  });
}

export function summarizeParsedQuestions(items: ParsedQuestion[]) {
  const count = (predicate: (item: ParsedQuestion) => boolean) => items.filter(predicate).length;
  return { total: items.length, ready: count((item) => item.status === "ready"), review: count((item) => item.status === "needs_review"), errors: count((item) => item.status === "error"), structurallyValid: count((item) => item.structurallyValid), duplicates: count((item) => !!item.duplicateOf), reasons: { missingCorrectAnswer: count((item) => item.issues.includes("MISSING_CORRECT_ANSWER")), conflictingAnswers: count((item) => item.issues.includes("CONFLICTING_ANSWERS")), invalidAnswers: count((item) => item.issues.includes("INVALID_CORRECT_ANSWER")), invalidOptions: count((item) => item.issues.includes("MISSING_OPTIONS") || item.issues.includes("EMPTY_OPTION") || item.issues.includes("DUPLICATE_OPTION_MARKER")), ambiguousStructure: count((item) => item.issues.includes("POSSIBLE_MERGED_QUESTIONS") || item.issues.includes("UNKNOWN_TYPE")) }, byType: { multipleChoice: count((item) => item.type === "multiple_choice"), trueFalse: count((item) => item.type === "true_false"), essay: count((item) => item.type === "essay"), speaking: count((item) => item.type === "speaking"), unknown: count((item) => item.type === "unknown") } };
}

export function partitionImportCandidates(items: ParsedQuestion[], readyOnly: boolean) {
  const candidates = items.filter((item) => item.status !== "error" && (!readyOnly || item.status === "ready"));
  const candidateIds = new Set(candidates.map((item) => item.clientId));
  return { candidates, remaining: readyOnly ? items.filter((item) => !candidateIds.has(item.clientId)) : [] };
}

export type AnswerKeyEntry = { questionNumber: string | null; answers: string[] };

export function parseAnswerKeyInput(raw: string): AnswerKeyEntry[] {
  const normalized = normalizeQuestionImportText(raw).toUpperCase();
  const numbered = [...normalized.matchAll(/(?:^|\s)(\d+)\s*(?:[-.:)]\s*)?([A-Z](?:\s*[,;/+]\s*[A-Z])*)(?=\s|$)/gu)];
  if (numbered.length) return numbered.map((match) => ({ questionNumber: match[1], answers: [...new Set(match[2].match(/[A-Z]/g) || [])] }));
  return (normalized.match(/[A-Z]/g) || []).map((answer) => ({ questionNumber: null, answers: [answer] }));
}

export function applyAnswerKey(items: ParsedQuestion[], rawKey: string) {
  const entries = parseAnswerKeyInput(rawKey); const explicit = entries.some((entry) => entry.questionNumber !== null);
  let applied = 0; let conflicts = 0; let invalid = 0; let unmatched = 0;
  const entryByNumber = new Map(entries.filter((entry) => entry.questionNumber).map((entry) => [entry.questionNumber!, entry]));
  const next = items.map((item, index) => {
    const entry = explicit ? (item.sourceNumber ? entryByNumber.get(item.sourceNumber) : undefined) : entries[index];
    if (!entry) return item;
    const validIds = new Set(item.options.map((option) => option.id));
    if (!entry.answers.length || entry.answers.some((id) => !validIds.has(id))) { invalid += 1; return revalidateParsedQuestion({ ...item, issues: [...item.issues, "INVALID_CORRECT_ANSWER"] }); }
    const answer = entry.answers.join(","); const existing = item.options.filter((option) => option.isCorrect).map((option) => option.id).join(",");
    if (existing && existing !== answer) {
      conflicts += 1;
      return revalidateParsedQuestion({ ...item, detectedAnswer: item.detectedAnswer || existing, answerKeyAnswer: answer, issues: [...item.issues, "CONFLICTING_ANSWERS"] });
    }
    applied += 1;
    return revalidateParsedQuestion({ ...item, answerKeyAnswer: answer, options: item.options.map((option) => ({ ...option, isCorrect: entry.answers.includes(option.id) })), issues: item.issues.filter((issue) => issue !== "INVALID_CORRECT_ANSWER" && issue !== "CONFLICTING_ANSWERS") });
  });
  if (explicit) for (const entry of entries) if (!items.some((item) => item.sourceNumber === entry.questionNumber)) unmatched += 1;
  else unmatched = Math.max(0, entries.length - items.length);
  return { items: next, applied, conflicts, invalid, unmatched };
}
