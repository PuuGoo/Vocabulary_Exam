import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attempts, mistakes, vocabSets, words } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { dateInVietnam, recordDailyActivity } from "@/lib/activity";
import { recordWordOutcomes } from "@/lib/spacedProgress";

type Candidate = { id: number; setId: number; setName: string; meaning: string; term: string; ipa: string | null; example: string | null };

function seedFrom(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFrom(seed: number) {
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], seed: string) {
  const result = [...items];
  const random = randomFrom(seedFrom(seed));
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

function isCorrect(value: string, expected: string) {
  const answer = normalize(value);
  return expected.split("/").some((option) => normalize(option) === answer);
}

async function challengeFor(date: string) {
  const rows = await db
    .select({ id: words.id, setId: words.setId, setName: vocabSets.name, meaning: words.meaning, term: words.term, ipa: words.ipa, example: words.example })
    .from(words)
    .innerJoin(vocabSets, eq(vocabSets.id, words.setId))
    .where(and(eq(vocabSets.type, "ielts_vocab"), isNull(vocabSets.classId)))
    .orderBy(words.id);
  const unique = new Map<string, Candidate>();
  for (const row of rows) {
    if (!row.term?.trim()) continue;
    const key = normalize(row.term);
    if (!unique.has(key)) unique.set(key, { ...row, term: row.term });
  }
  const candidates = [...unique.values()];
  if (candidates.length < 4) return [];
  const selected = shuffle(candidates, `${date}:questions`).slice(0, Math.min(10, candidates.length));
  return selected.map((word) => {
    const distractors = shuffle(candidates.filter((item) => normalize(item.term) !== normalize(word.term)), `${date}:${word.id}:choices`).slice(0, 3);
    return { ...word, choices: shuffle([word.term, ...distractors.map((item) => item.term)], `${date}:${word.id}:order`) };
  });
}

function attemptName(date: string) {
  return `Thử thách ngày ${date}`;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const date = dateInVietnam();
  const [challenge, completed] = await Promise.all([
    challengeFor(date),
    db.query.attempts.findFirst({ where: and(eq(attempts.userId, session.userId), eq(attempts.mode, "daily"), eq(attempts.setName, attemptName(date))) }),
  ]);
  if (challenge.length === 0) return NextResponse.json({ error: "Chưa đủ từ công khai để tạo thử thách." }, { status: 404 });
  return NextResponse.json({
    date,
    challenge: challenge.map(({ term: _term, example: _example, ...question }) => question),
    completed: completed ? { score: completed.score, total: completed.total, createdAt: completed.createdAt } : null,
  });
}

const submitSchema = z.object({
  answers: z.array(z.object({ wordId: z.number().int().positive(), answer: z.string().max(256) })).min(1).max(10),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = submitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });

  const date = dateInVietnam();
  const existing = await db.query.attempts.findFirst({ where: and(eq(attempts.userId, session.userId), eq(attempts.mode, "daily"), eq(attempts.setName, attemptName(date))) });
  if (existing) return NextResponse.json({ error: "Bạn đã hoàn thành thử thách hôm nay.", completed: { score: existing.score, total: existing.total } }, { status: 409 });

  const challenge = await challengeFor(date);
  if (challenge.length === 0) return NextResponse.json({ error: "Chưa thể tạo thử thách." }, { status: 404 });
  const submitted = new Map(parsed.data.answers.map((item) => [item.wordId, item.answer]));
  if (challenge.some((word) => !submitted.has(word.id))) return NextResponse.json({ error: "Hãy trả lời đủ tất cả câu hỏi." }, { status: 400 });

  const corrections = challenge.map((word) => {
    const answer = submitted.get(word.id) || "";
    return { wordId: word.id, setId: word.setId, answer, correctAnswer: word.term, correct: isCorrect(answer, word.term), example: word.example };
  });
  const score = corrections.filter((item) => item.correct).length;

  await db.insert(attempts).values({ userId: session.userId, setId: null, setName: attemptName(date), mode: "daily", score, total: challenge.length, timed: false });
  for (const item of corrections.filter((correction) => !correction.correct)) {
    await db.insert(mistakes).values({ userId: session.userId, wordId: item.wordId, setId: item.setId, timesWrong: 1, lastWrongAt: new Date() }).onConflictDoUpdate({ target: [mistakes.userId, mistakes.wordId], set: { timesWrong: sql`${mistakes.timesWrong} + 1`, lastWrongAt: new Date() } });
  }
  await recordWordOutcomes(session.userId, corrections.map((item) => ({
    wordId: item.wordId,
    setId: item.setId,
    correct: item.correct,
  })), "daily");
  await recordDailyActivity(session.userId, { wordsReviewed: challenge.length, quizzesCompleted: 1 });
  return NextResponse.json({ date, score, total: challenge.length, corrections });
}
