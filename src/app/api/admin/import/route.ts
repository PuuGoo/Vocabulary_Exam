import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { db } from "@/db";
import {
  topics, vocabCategories, vocabSets, wordCollocations, wordFamilies, wordFamilyMembers, wordPatterns,
  wordTopics, words,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { formatCategorySetName, nextCategoryOrder } from "@/lib/categorySequence";
import { dedupeImportRows, importWordKey } from "@/lib/importDedup";
import { normalizeText } from "@/lib/text";
import { parseIeltsSkills, parseUsageContext, stringifyListColumn } from "@/lib/vocabularyMeta";
import {
  detectSheetKind, indexByTerm, indexByWordKey, parseAdvancedWordMeta, parseCollocationRows,
  parseFamilyRows, parsePatternRows, parseTopicRows, readTerm, readWordKey, resolveLinkedWordId,
  splitMultiValueCell, type LinkedSheetKind,
} from "@/lib/vocabImport";

export const runtime = "nodejs";

type Row = Record<string, string>;

function normalizeRow(raw: Record<string, unknown>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k.trim().toLowerCase()] = normalizeText(String(v ?? "").trim());
  }
  return out;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const target = String(form.get("target") || "");
  const newSetName = String(form.get("newSetName") || "").trim();
  const category = normalizeText(String(form.get("category") || "").trim()) || null;
  const classIdRaw = form.get("classId");
  const classId = classIdRaw && String(classIdRaw).trim() !== "" ? Number(classIdRaw) : null;

  if (!file) return NextResponse.json({ error: "Vui lòng chọn file để nhập." }, { status: 400 });

  const filename = file.name.toLowerCase();
  let rows: Row[] = [];
  // Optional linked sheets (Collocations / Patterns / WordFamilies / Topics).
  const linked = new Map<LinkedSheetKind, Row[]>();

  try {
    if (filename.endsWith(".csv")) {
      const text = await file.text();
      const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
      rows = parsed.data.map(normalizeRow);
    } else if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        if (!sheet) continue;
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        const parsed = raw.map(normalizeRow);
        const kind = detectSheetKind(sheetName);
        // The first non-linked sheet stays the Words sheet, so existing
        // single-sheet workbooks behave exactly as before.
        if (kind && kind !== "words") linked.set(kind, [...(linked.get(kind) || []), ...parsed]);
        else if (!rows.length) rows = parsed;
      }
    } else {
      return NextResponse.json({ error: "Chỉ hỗ trợ file .csv, .xlsx, .xls" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Không đọc được nội dung file. Vui lòng kiểm tra định dạng." }, { status: 400 });
  }

  rows = rows.filter((r) => Object.values(r).some((v) => v !== ""));
  if (rows.length === 0) {
    return NextResponse.json({ error: "File không có dữ liệu hợp lệ." }, { status: 400 });
  }

  let setId: number;
  let setType: string;

  if (target === "__new_vocab" || target === "__new_verb") {
    setType = target === "__new_verb" ? "irregular_verb" : "ielts_vocab";
    const rawName = normalizeText(newSetName) || (setType === "irregular_verb" ? "Bộ động từ mới" : "Bộ từ vựng mới");
    if (category) {
      await db.insert(vocabCategories).values({ name: category, createdBy: session.userId }).onConflictDoNothing({ target: vocabCategories.name });
    }
    const name = category ? formatCategorySetName(await nextCategoryOrder(db, category), rawName) : rawName;
    const [set] = await db.insert(vocabSets).values({ name, category, type: setType, classId, createdBy: session.userId }).returning();
    setId = set.id;
  } else {
    const setIdNum = Number(target);
    const set = await db.query.vocabSets.findFirst({ where: eq(vocabSets.id, setIdNum) });
    if (!set) return NextResponse.json({ error: "Bộ từ vựng đích không tồn tại." }, { status: 400 });
    setId = set.id;
    setType = set.type;
  }

  const existingWords = await db
    .select({ term: words.term, v1: words.v1, v2: words.v2, v3: words.v3 })
    .from(words)
    .where(eq(words.setId, setId));
  const existingKeys = existingWords.map((row) => importWordKey(row, setType));

  let added = 0;
  let invalidCount = 0;
  const toInsert: (typeof words.$inferInsert)[] = [];
  const validRows: Row[] = [];
  for (const r of rows) {
    if (setType === "irregular_verb") {
      if (r.meaning && r.v1 && r.v2 && r.v3) {
        validRows.push(r);
      } else {
        invalidCount++;
      }
    } else {
      if (r.term && r.meaning) {
        validRows.push(r);
      } else {
        invalidCount++;
      }
    }
  }
  const deduped = dedupeImportRows(validRows, setType, existingKeys);
  for (const r of deduped.rows) {
    if (setType === "irregular_verb") {
      toInsert.push({
        setId,
        meaning: r.meaning,
        v1: r.v1,
        v2: r.v2,
        v3: r.v3,
        ipaV1: r.ipa_v1 || r.ipav1 || null,
        ipaV2: r.ipa_v2 || r.ipav2 || null,
        ipaV3: r.ipa_v3 || r.ipav3 || null,
      });
    } else {
      const meta = parseAdvancedWordMeta(r);
      toInsert.push({
        setId,
        meaning: r.meaning,
        term: r.term,
        example: r.example || "",
        wtype: r.wtype || r.type || "",
        ipa: r.ipa || null,
        contentKind: meta.contentKind ?? "word",
        contentStatus: meta.contentStatus ?? "approved",
        register: meta.register ?? null,
        cefrLevel: meta.cefrLevel ?? null,
        frequency: meta.frequency ?? null,
        ieltsRelevant: meta.ieltsRelevant ?? false,
        ieltsBandRelevance: meta.ieltsBandRelevance ?? null,
        ieltsSkills: stringifyListColumn(parseIeltsSkills(meta.ieltsSkills ? JSON.stringify(meta.ieltsSkills) : null)),
        usageContext: stringifyListColumn(parseUsageContext(meta.usageContext ? JSON.stringify(meta.usageContext) : null)),
        notes: meta.notes ?? null,
      });
    }
  }
  added = toInsert.length;
  let insertedIds: Array<{ id: number; term: string | null }> = [];
  if (toInsert.length > 0) {
    insertedIds = await db.insert(words).values(toInsert).returning({ id: words.id, term: words.term });
  }

  const depth = await saveLinkedContent({
    setId,
    setType,
    linked,
    inlineRows: deduped.rows,
    insertedIds,
    userId: session.userId,
  });

  return NextResponse.json({
    setId,
    added,
    total: rows.length,
    skippedDuplicates: deduped.duplicateCount,
    skippedInvalid: invalidCount,
    ...depth,
  });
}

/**
 * Writes collocations / patterns / topics / word families for the words just
 * imported (and for words already in the set, matched by term). Linked rows
 * come from dedicated sheets or from inline multi-value columns on the Words
 * sheet, separated by "|" or ";".
 */
async function saveLinkedContent(input: {
  setId: number;
  setType: string;
  linked: Map<LinkedSheetKind, Row[]>;
  inlineRows: Row[];
  insertedIds: Array<{ id: number; term: string | null }>;
  userId: number;
}) {
  if (input.setType === "irregular_verb") return { collocations: 0, patterns: 0, topics: 0, families: 0 };

  const setWords = await db.select({ id: words.id, term: words.term }).from(words).where(eq(words.setId, input.setId));
  const byTerm = indexByTerm(setWords);
  const byWordKey = indexByWordKey(input.inlineRows, input.insertedIds.map((row) => row.id));

  const collocationRows = parseCollocationRows(input.linked.get("collocations") || []);
  const patternRows = parsePatternRows(input.linked.get("patterns") || []);
  const topicRows = parseTopicRows(input.linked.get("topics") || []);
  const familyRows = parseFamilyRows(input.linked.get("wordfamilies") || []);

  // Inline columns on the Words sheet, e.g. collocation = "make a decision | reach a decision".
  for (const row of input.inlineRows) {
    const wordKey = readWordKey(row);
    const term = readTerm(row);
    for (const phrase of splitMultiValueCell(row.collocation || row.collocations)) {
      collocationRows.push({ wordKey, term, phrase, meaning: null, example: null, register: null, contentStatus: "approved" });
    }
    for (const pattern of splitMultiValueCell(row.pattern || row.patterns)) {
      patternRows.push({ wordKey, term, pattern, meaning: null, example: null, contentStatus: "approved" });
    }
    for (const topic of splitMultiValueCell(row.topic || row.topics)) {
      topicRows.push({ wordKey, term, topic });
    }
    for (const family of splitMultiValueCell(row.wordfamily || row.family || row.wordfamilies)) {
      familyRows.push({ wordKey, term, family, relation: row.familyrole || row.relation || null });
    }
  }

  const counts = { collocations: 0, patterns: 0, topics: 0, families: 0 };

  for (const row of collocationRows) {
    const wordId = resolveLinkedWordId(row, byWordKey, byTerm);
    if (!wordId) continue;
    const [inserted] = await db.insert(wordCollocations).values({
      wordId, phrase: normalizeText(row.phrase), meaning: row.meaning ? normalizeText(row.meaning) : null,
      example: row.example ? normalizeText(row.example) : null, register: row.register, contentStatus: row.contentStatus,
    }).onConflictDoNothing({ target: [wordCollocations.wordId, wordCollocations.phrase] }).returning({ id: wordCollocations.id });
    if (inserted) counts.collocations += 1;
  }

  for (const row of patternRows) {
    const wordId = resolveLinkedWordId(row, byWordKey, byTerm);
    if (!wordId) continue;
    const [inserted] = await db.insert(wordPatterns).values({
      wordId, pattern: normalizeText(row.pattern), meaning: row.meaning ? normalizeText(row.meaning) : null,
      example: row.example ? normalizeText(row.example) : null, contentStatus: row.contentStatus,
    }).onConflictDoNothing({ target: [wordPatterns.wordId, wordPatterns.pattern] }).returning({ id: wordPatterns.id });
    if (inserted) counts.patterns += 1;
  }

  const topicNames = [...new Set(topicRows.map((row) => row.topic.trim()).filter(Boolean))];
  if (topicNames.length) {
    await db.insert(topics).values(topicNames.map((name) => ({ name: normalizeText(name), createdBy: input.userId })))
      .onConflictDoNothing({ target: topics.name });
  }
  const topicIds = new Map((await db.select({ id: topics.id, name: topics.name }).from(topics)).map((row) => [row.name.toLowerCase(), row.id]));
  for (const row of topicRows) {
    const wordId = resolveLinkedWordId(row, byWordKey, byTerm);
    const topicId = topicIds.get(row.topic.trim().toLowerCase());
    if (!wordId || !topicId) continue;
    const [inserted] = await db.insert(wordTopics).values({ wordId, topicId })
      .onConflictDoNothing({ target: [wordTopics.wordId, wordTopics.topicId] }).returning({ id: wordTopics.id });
    if (inserted) counts.topics += 1;
  }

  const familyLabels = [...new Set(familyRows.map((row) => row.family.trim()).filter(Boolean))];
  for (const label of familyLabels) {
    await db.insert(wordFamilies).values({ label: normalizeText(label), createdBy: input.userId })
      .onConflictDoNothing({ target: wordFamilies.label });
  }
  const familyIds = new Map((await db.select({ id: wordFamilies.id, label: wordFamilies.label }).from(wordFamilies)).map((row) => [row.label.toLowerCase(), row.id]));
  for (const row of familyRows) {
    const wordId = resolveLinkedWordId(row, byWordKey, byTerm);
    const familyId = familyIds.get(row.family.trim().toLowerCase());
    if (!wordId || !familyId) continue;
    const [inserted] = await db.insert(wordFamilyMembers).values({ familyId, wordId, relation: row.relation })
      .onConflictDoNothing({ target: [wordFamilyMembers.familyId, wordFamilyMembers.wordId] }).returning({ id: wordFamilyMembers.id });
    if (inserted) counts.families += 1;
  }

  return counts;
}
