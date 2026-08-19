import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { quizProgress } from "@/db/schema";
import { getSession } from "@/lib/auth";

const schema = z.object({
  setId: z.number().int().nullable().optional(),
  mode: z.enum(["fill", "mc", "dictation", "match", "pronunciation", "sentence", "writing", "mixed"]),
  timed: z.boolean().optional(),
  timedMinutes: z.number().int().min(1).max(120).nullable().optional(),
  retest: z.boolean().optional(),
  rangeFrom: z.number().int().min(1).nullable().optional(),
  rangeTo: z.number().int().min(1).nullable().optional(),
  groupIndex: z.number().int().min(0),
  answers: z.record(z.record(z.string())).optional(),
  mcOptions: z.record(z.array(z.string())).optional(),
  checkedGroups: z.record(z.object({ score: z.number().int(), total: z.number().int() })).optional(),
  retryWordIdsByGroup: z.record(z.array(z.number().int())).optional(),
  hintIds: z.array(z.number().int()).optional(),
  wordIds: z.array(z.number().int()).optional(),
  elapsed: z.number().int().min(0).optional(),
  timedEndsAt: z.number().int().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "D? li?u không h?p l?.", issues: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const values = {
    userId: session.userId,
    setId: d.setId ?? null,
    mode: d.mode,
    timed: !!d.timed,
    timedMinutes: d.timedMinutes ?? null,
    retest: !!d.retest,
    rangeFrom: d.rangeFrom ?? null,
    rangeTo: d.rangeTo ?? null,
    groupIndex: d.groupIndex,
    answers: JSON.stringify(d.answers ?? {}),
    mcOptions: JSON.stringify(d.mcOptions ?? {}),
    checkedGroups: JSON.stringify(d.checkedGroups ?? {}),
    retryWordIdsByGroup: JSON.stringify(d.retryWordIdsByGroup ?? {}),
    hintIds: JSON.stringify(d.hintIds ?? []),
    wordIds: JSON.stringify(d.wordIds ?? []),
    elapsed: d.elapsed ?? 0,
    timedEndsAt: d.timedEndsAt ?? null,
    updatedAt: new Date(),
  };

  await db
    .insert(quizProgress)
    .values(values)
    .onConflictDoUpdate({
      target: [
        quizProgress.userId,
        quizProgress.setId,
        quizProgress.mode,
        quizProgress.timed,
        quizProgress.timedMinutes,
        quizProgress.retest,
        quizProgress.rangeFrom,
        quizProgress.rangeTo,
      ],
      set: {
        groupIndex: values.groupIndex,
        answers: values.answers,
        mcOptions: values.mcOptions,
        checkedGroups: values.checkedGroups,
        retryWordIdsByGroup: values.retryWordIdsByGroup,
        hintIds: values.hintIds,
        wordIds: values.wordIds,
        elapsed: values.elapsed,
        timedEndsAt: values.timedEndsAt,
        updatedAt: values.updatedAt,
      },
    });

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode");
  const setId = url.searchParams.get("setId");
  const timed = url.searchParams.get("timed");
  const retest = url.searchParams.get("retest");
  const rangeFrom = url.searchParams.get("rangeFrom");
  const rangeTo = url.searchParams.get("rangeTo");

  const where = [eq(quizProgress.userId, session.userId)];
  if (mode) where.push(eq(quizProgress.mode, mode));
  if (setId) where.push(eq(quizProgress.setId, Number(setId)));
  if (timed) where.push(eq(quizProgress.timed, timed === "1"));
  if (retest) where.push(eq(quizProgress.retest, retest === "1"));
  if (rangeFrom) where.push(eq(quizProgress.rangeFrom, Number(rangeFrom)));
  if (rangeTo) where.push(eq(quizProgress.rangeTo, Number(rangeTo)));

  const rows = await db
    .select()
    .from(quizProgress)
    .where(and(...where))
    .orderBy(quizProgress.updatedAt);

  const decoded = rows.map((row) => ({
    ...row,
    answers: safeParse(row.answers, {} as Record<number, Record<string, string>>),
    mcOptions: safeParse(row.mcOptions, {} as Record<number, string[]>),
    checkedGroups: safeParse(row.checkedGroups, {} as Record<number, { score: number; total: number }>),
    retryWordIdsByGroup: safeParse(row.retryWordIdsByGroup, {} as Record<number, number[]>),
    hintIds: safeParse(row.hintIds, [] as number[]),
    wordIds: safeParse(row.wordIds, [] as number[]),
  }));

  return NextResponse.json({ progress: decoded });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode");
  const setId = url.searchParams.get("setId");
  const timed = url.searchParams.get("timed");
  const retest = url.searchParams.get("retest");
  const rangeFrom = url.searchParams.get("rangeFrom");
  const rangeTo = url.searchParams.get("rangeTo");

  const where = [eq(quizProgress.userId, session.userId)];
  if (mode) where.push(eq(quizProgress.mode, mode));
  if (setId) where.push(eq(quizProgress.setId, Number(setId)));
  if (timed) where.push(eq(quizProgress.timed, timed === "1"));
  if (retest) where.push(eq(quizProgress.retest, retest === "1"));
  if (rangeFrom) where.push(eq(quizProgress.rangeFrom, Number(rangeFrom)));
  if (rangeTo) where.push(eq(quizProgress.rangeTo, Number(rangeTo)));

  await db.delete(quizProgress).where(and(...where));
  return NextResponse.json({ ok: true });
}

function safeParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
