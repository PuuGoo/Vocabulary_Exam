import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { classMembers, mistakes, userWordSkillProgress, vocabSets, wordProgress, words } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getAdminAccess } from "@/lib/adminAuthorization";
import { getVisibleFolderIds } from "@/lib/folderAuthorization";
import { weakestEligibleSkill } from "@/lib/skillMastery";
import { SKILL_RECOMMENDED_MODE, type LearningSkill } from "@/lib/learningSkills";
import { buildToneExercise } from "@/lib/toneTrainer";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestedCount = Number(req.nextUrl.searchParams.get("count"));
  const count = [5, 10, 20].includes(requestedCount) ? requestedCount : 10;
  const now = Date.now();

  let classFilter;
  if (session.role !== "admin") {
    const memberships = await db
      .select({ classId: classMembers.classId })
      .from(classMembers)
      .where(eq(classMembers.userId, session.userId));
    const classIds = memberships.map((item) => item.classId);
    const audience = classIds.length
      ? or(isNull(vocabSets.classId), inArray(vocabSets.classId, classIds))
      : isNull(vocabSets.classId);
    classFilter = and(eq(vocabSets.publicationStatus, "published"), audience);
  } else {
    const access = await getAdminAccess(session); const ids = access?.can("vocab.view") ? await getVisibleFolderIds(access) : [];
    classFilter = ids.length ? inArray(vocabSets.folderId, ids) : eq(vocabSets.id, -1);
  }

  const query = db
    .select({
      id: words.id,
      setId: words.setId,
      setName: vocabSets.name,
      setType: vocabSets.type,
      languageCode: vocabSets.languageCode,
      languageSettings: vocabSets.languageSettings,
      meaning: words.meaning,
      v1: words.v1,
      v2: words.v2,
      v3: words.v3,
      ipaV1: words.ipaV1,
      ipaV2: words.ipaV2,
      ipaV3: words.ipaV3,
      term: words.term,
      alternateTerm: words.alternateTerm,
      pronunciation: words.pronunciation,
      example: words.example,
      wtype: words.wtype,
      ipa: words.ipa,
      level: words.level,
      classifier: words.classifier,
      known: wordProgress.known,
      reviewedAt: wordProgress.updatedAt,
      nextReviewAt: wordProgress.nextReviewAt,
      intervalDays: wordProgress.intervalDays,
      reviewStreak: wordProgress.reviewStreak,
      timesWrong: mistakes.timesWrong,
    })
    .from(words)
    .innerJoin(vocabSets, eq(vocabSets.id, words.setId))
    .leftJoin(wordProgress, and(eq(wordProgress.wordId, words.id), eq(wordProgress.userId, session.userId)))
    .leftJoin(mistakes, and(eq(mistakes.wordId, words.id), eq(mistakes.userId, session.userId)));

  const filteredQuery = classFilter ? query.where(classFilter) : query;
  const candidates = await filteredQuery.orderBy(sql`case when ${wordProgress.nextReviewAt} <= ${new Date(now)} then 0 when ${mistakes.timesWrong} > 0 then 1 when ${wordProgress.known}=false then 2 when (select min(p.mastery_score) from user_word_skill_progress p where p.user_id=${session.userId} and p.word_id=${words.id}) < 70 then 3 else 4 end`, words.id).limit(Math.max(200,count*20));
  if (candidates.length === 0) {
    return NextResponse.json({ words: [], summary: { total: 0, due: 0, difficult: 0, forgotten: 0, stale: 0, new: 0, weak_skill:0 } });
  }

  const masteryRows = await db.select().from(userWordSkillProgress).where(and(eq(userWordSkillProgress.userId,session.userId),inArray(userWordSkillProgress.wordId,candidates.map(word=>word.id))));
  const masteryByWord=new Map<number,typeof masteryRows>();for(const row of masteryRows)masteryByWord.set(row.wordId,[...(masteryByWord.get(row.wordId)||[]),row]);
  const ranked = candidates.map((word) => {
    const ageDays = word.reviewedAt ? Math.max(0, Math.floor((now - word.reviewedAt.getTime()) / DAY_MS)) : null;
    const due = Boolean(word.nextReviewAt && word.nextReviewAt.getTime() <= now);
    let reason: "difficult" | "forgotten" | "stale" | "new" | "weak_skill";
    let priority: number;
    if ((word.timesWrong || 0) > 0) {
      reason = "difficult";
      priority = (due ? 600 : 400) + (word.timesWrong || 0) * 20 + (ageDays || 0);
    } else if (word.known === false) {
      reason = "forgotten";
      priority = (due ? 550 : 300) + (ageDays || 0);
    } else if (word.known === true) {
      reason = "stale";
      priority = due ? 500 + (ageDays || 0) : 25;
    } else {
      reason = "new";
      priority = 50;
    }
    const eligible:LearningSkill[]=word.languageCode==="zh-CN"?["meaning_recognition","orthography_production","pronunciation_recall",...(buildToneExercise(word.pronunciation).eligible?["tone_accuracy" as const]:[]),"listening_recognition"]:["meaning_recognition","orthography_production","listening_recognition"];
    const weakSkill=weakestEligibleSkill((masteryByWord.get(word.id)||[]) as Array<{skill:LearningSkill;masteryScore:number;practiceCount:number}>,eligible);const weakRow=(masteryByWord.get(word.id)||[]).find(row=>row.skill===weakSkill);
    if(weakSkill&&weakRow&&weakRow.masteryScore<70){priority+=Math.max(0,70-weakRow.masteryScore)*9;if(!due&&(word.timesWrong||0)===0&&word.known!==false)reason="weak_skill";}
    return { ...word, ageDays, due, reason, priority, weakSkill, weakSkillScore:weakRow?.masteryScore??null,recommendedMode:weakSkill?SKILL_RECOMMENDED_MODE[weakSkill]:null, random: Math.random() };
  }).filter((word) => word.due || word.nextReviewAt === null || (word.timesWrong || 0) > 0 || word.known === false || (word.weakSkillScore != null && word.weakSkillScore < 70));

  ranked.sort((a, b) => b.priority - a.priority || a.random - b.random);
  const selected = ranked.slice(0, count).map(({ priority: _priority, random: _random, ...word }) => word);
  const summary = selected.reduce(
    (result, word) => ({ ...result, [word.reason]: result[word.reason] + 1 }),
    { total: selected.length, due: selected.filter((word) => word.due).length, difficult: 0, forgotten: 0, stale: 0, new: 0, weak_skill:0 }
  );

  return NextResponse.json({ words: selected, summary });
}
