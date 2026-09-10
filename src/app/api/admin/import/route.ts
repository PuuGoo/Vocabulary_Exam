import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { db } from "@/db";
import { vocabCategories, vocabSets, words } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { normalizeText } from "@/lib/text";
import { formatCategorySetName, nextCategoryOrder } from "@/lib/categorySequence";
import { dedupeImportRows, importWordKey } from "@/lib/importDedup";
import { appendWords } from "@/lib/wordOrder.server";
import { canonicalizePinyinDisplay, hasExplicitPinyinTone } from "@/lib/pinyin";

export const runtime = "nodejs";

type Row = Record<string, string>;

const CHINESE_HEADERS = {
  term: ["term", "hanzi", "chữ hán", "chinese", "simplified", "简体"],
  alternateTerm: ["alternateterm", "alternate term", "traditional", "phồn thể", "繁體", "繁体"],
  pronunciation: ["pronunciation", "pinyin", "拼音"],
  meaning: ["meaning", "nghĩa"],
  wtype: ["wtype", "type", "word type", "loại từ"],
  classifier: ["classifier", "lượng từ"],
  level: ["level", "hsk"],
  example: ["example", "ví dụ"],
  examplePronunciation: ["examplepronunciation", "example pronunciation", "pinyin ví dụ"],
  exampleMeaning: ["examplemeaning", "example meaning", "nghĩa ví dụ"],
} as const;
function alias(row: Row, keys: readonly string[]) { for (const key of keys) if (row[key]) return row[key]; return ""; }
function canonicalChineseRow(row: Row): Row { return { ...row, term:alias(row,CHINESE_HEADERS.term), alternateTerm:alias(row,CHINESE_HEADERS.alternateTerm), pronunciation:alias(row,CHINESE_HEADERS.pronunciation), meaning:alias(row,CHINESE_HEADERS.meaning), wtype:alias(row,CHINESE_HEADERS.wtype), classifier:alias(row,CHINESE_HEADERS.classifier), level:alias(row,CHINESE_HEADERS.level), example:alias(row,CHINESE_HEADERS.example), examplePronunciation:alias(row,CHINESE_HEADERS.examplePronunciation), exampleMeaning:alias(row,CHINESE_HEADERS.exampleMeaning) }; }

function normalizeRow(raw: Record<string, unknown>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k.trim().toLowerCase()] = normalizeText(String(v ?? "").trim());
  }
  return out;
}

export async function POST(req: NextRequest) {
  const access = await requireAdminPermission("vocab.import");
  if (isAuthorizationError(access)) return access;
  const session = { userId: access.userId };

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const target = String(form.get("target") || "");
  const newSetName = String(form.get("newSetName") || "").trim();
  const category = normalizeText(String(form.get("category") || "").trim()) || null;
  const requestedLanguage = String(form.get("languageCode") || "en");
  const classIdRaw = form.get("classId");
  const classId = classIdRaw && String(classIdRaw).trim() !== "" ? Number(classIdRaw) : null;

  if (!file) return NextResponse.json({ error: "Vui lòng chọn file để nhập." }, { status: 400 });

  const filename = file.name.toLowerCase();
  let rows: Row[] = [];

  try {
    if (filename.endsWith(".csv")) {
      const text = await file.text();
      const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
      rows = parsed.data.map(normalizeRow);
    } else if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      rows = raw.map(normalizeRow);
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
  let languageCode = "en";

  if (target === "__new_vocab" || target === "__new_verb" || target === "__new_language") {
    setType = target === "__new_verb" ? "irregular_verb" : target === "__new_language" ? "language_vocab" : "ielts_vocab";
    languageCode = setType === "language_vocab" && requestedLanguage === "zh-CN" ? "zh-CN" : "en";
    const rawName = normalizeText(newSetName) || (setType === "irregular_verb" ? "Bộ động từ mới" : "Bộ từ vựng mới");
    if (category) {
      await db.insert(vocabCategories).values({ name: category, createdBy: session.userId }).onConflictDoNothing({ target: vocabCategories.name });
    }
    const name = category ? formatCategorySetName(await nextCategoryOrder(db, category), rawName) : rawName;
    const [set] = await db.insert(vocabSets).values({ name, category, type: setType, languageCode, translationLanguageCode:"vi", languageSettings:languageCode === "zh-CN" ? JSON.stringify({scriptVariant:"simplified",pronunciationScheme:"pinyin",pinyinTonePolicy:"strict"}) : "{}", classId, createdBy: session.userId }).returning();
    setId = set.id;
  } else {
    const setIdNum = Number(target);
    const set = await db.query.vocabSets.findFirst({ where: eq(vocabSets.id, setIdNum) });
    if (!set) return NextResponse.json({ error: "Bộ từ vựng đích không tồn tại." }, { status: 400 });
    setId = set.id;
    setType = set.type;
    languageCode = set.languageCode;
  }

  if (languageCode === "zh-CN") rows = rows.map(canonicalChineseRow);

  const existingWords = await db
    .select({ term: words.term, v1: words.v1, v2: words.v2, v3: words.v3 })
    .from(words)
    .where(eq(words.setId, setId));
  const existingKeys = existingWords.map((row) => importWordKey(row, setType));

  let added = 0;
  let invalidCount = 0;
  const toInsert: Omit<typeof words.$inferInsert, "position">[] = [];
  const pinyinWarningRows: number[] = [];
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
  for (const [dedupedIndex, r] of deduped.rows.entries()) {
    const pronunciation = languageCode === "zh-CN" && r.pronunciation ? canonicalizePinyinDisplay(r.pronunciation) : r.pronunciation;
    if (languageCode === "zh-CN" && pronunciation && !hasExplicitPinyinTone(pronunciation)) pinyinWarningRows.push(dedupedIndex + 2);
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
      toInsert.push({
        setId,
        meaning: r.meaning,
        term: r.term,
        example: r.example || "",
        wtype: r.wtype || r.type || "",
        ipa: r.ipa || null,
        alternateTerm: r.alternateTerm || null,
        pronunciation: pronunciation || null,
        classifier: r.classifier || null,
        level: r.level || null,
        examplePronunciation: languageCode === "zh-CN" && r.examplePronunciation ? canonicalizePinyinDisplay(r.examplePronunciation) : r.examplePronunciation || null,
        exampleMeaning: r.exampleMeaning || null,
      });
    }
  }
  added = toInsert.length;
  if (toInsert.length > 0) {
    await db.transaction((tx) => appendWords(tx, setId, toInsert));
  }

  return NextResponse.json({
    setId,
    added,
    total: rows.length,
    skippedDuplicates: deduped.duplicateCount,
    skippedInvalid: invalidCount,
    warnings: pinyinWarningRows.length ? [{ code:"PINYIN_TONE_MISSING", message:"Pinyin chưa có dấu thanh.", rows:pinyinWarningRows }] : [],
  });
}
