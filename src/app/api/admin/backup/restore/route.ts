import { db } from "@/db";
import {
  assignmentExtensions, assignments, assignmentSubmissions, attempts, classes, classMembers,
  dailyActivities, learningGoals, mistakes, studySessions, teachBackNotes, users, vocabSets,
  wordBookmarks, wordProgress, words,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { BACKUP_COLLECTIONS, BackupCollection, BackupRow, getBackupCounts, parseBackupDocument } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONFIRMATION = "KHOI PHUC";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function text(row: BackupRow, key: string, fallback = "") { return typeof row[key] === "string" ? row[key] as string : fallback; }
function nullableText(row: BackupRow, key: string) { return typeof row[key] === "string" ? row[key] as string : null; }
function number(row: BackupRow, key: string, fallback = 0) { return typeof row[key] === "number" && Number.isFinite(row[key]) ? Math.trunc(row[key] as number) : fallback; }
function nullableNumber(row: BackupRow, key: string) { return typeof row[key] === "number" && Number.isFinite(row[key]) ? Math.trunc(row[key] as number) : null; }
function bool(row: BackupRow, key: string, fallback = false) { return typeof row[key] === "boolean" ? row[key] as boolean : fallback; }
function date(row: BackupRow, key: string, fallback = new Date()) { const value = row[key]; const parsed = typeof value === "string" || value instanceof Date ? new Date(value) : fallback; return Number.isNaN(parsed.getTime()) ? fallback : parsed; }
function nullableDate(row: BackupRow, key: string) { const value = row[key]; if (value == null) return null; const parsed = new Date(value as string); return Number.isNaN(parsed.getTime()) ? null : parsed; }
function oldId(row: BackupRow) { const value = number(row, "id", -1); return value >= 0 ? value : null; }
function pair(a: number, b: number) { return `${a}:${b}`; }
function setKey(name: string, type: string, classId: number | null) { return `${classId ?? "public"}\u0000${type}\u0000${name.trim().toLocaleLowerCase("vi")}`; }
function wordKey(setId: number, row: BackupRow) { return [setId, "meaning", "v1", "v2", "v3", "term", "example", "wtype", "ipa"].map((value) => typeof value === "number" ? value : text(row, value)).join("\u0000"); }
function assignmentKey(classId: number, setId: number, title: string, dueAt: Date | null) { return `${classId}:${setId}:${title.trim().toLocaleLowerCase("vi")}:${dueAt?.toISOString() ?? ""}`; }
function attemptKey(row: { userId: number; setName: string; mode: string; score: number; total: number; timed: boolean; createdAt: Date }) { return `${row.userId}\u0000${row.setName}\u0000${row.mode}\u0000${row.score}\u0000${row.total}\u0000${row.timed}\u0000${row.createdAt.toISOString()}`; }

type Report = { added: Record<BackupCollection, number>; skipped: Record<BackupCollection, number>; warnings: string[] };
function createReport(): Report {
  return {
    added: Object.fromEntries(BACKUP_COLLECTIONS.map((name) => [name, 0])) as Record<BackupCollection, number>,
    skipped: Object.fromEntries(BACKUP_COLLECTIONS.map((name) => [name, 0])) as Record<BackupCollection, number>,
    warnings: [],
  };
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return Response.json({ error: "Bạn không có quyền khôi phục dữ liệu." }, { status: 403 });

  try {
    const body = await request.json();
    const backup = parseBackupDocument(body.backup);
    const existingUsers = await db.select({ id: users.id, username: users.username }).from(users);
    const existingNames = new Set(existingUsers.map((user) => user.username.toLocaleLowerCase("vi")));
    const unknownUsers = backup.data.users.map((row) => text(row, "username")).filter((name) => name && !existingNames.has(name.toLocaleLowerCase("vi")));

    if (body.action === "preview") {
      return Response.json({ createdAt: backup.createdAt, counts: getBackupCounts(backup), unknownUsers, strategy: "merge-only" });
    }
    if (body.action !== "restore" || body.confirmation !== CONFIRMATION) {
      return Response.json({ error: `Nhập chính xác “${CONFIRMATION}” để xác nhận.` }, { status: 400 });
    }

    const report = createReport();
    await db.transaction(async (tx) => {
      const userMap = new Map<number, number>();
      const usersByName = new Map(existingUsers.map((user) => [user.username.toLocaleLowerCase("vi"), user.id]));
      for (const row of backup.data.users) {
        const id = oldId(row); const mapped = usersByName.get(text(row, "username").toLocaleLowerCase("vi"));
        if (id != null && mapped != null) userMap.set(id, mapped);
        report.skipped.users++;
      }
      if (unknownUsers.length) report.warnings.push(`${unknownUsers.length} tài khoản chưa tồn tại đã được bỏ qua: ${unknownUsers.slice(0, 5).join(", ")}${unknownUsers.length > 5 ? "…" : ""}.`);

      const classMap = new Map<number, number>();
      const existingClasses = await tx.select().from(classes);
      const classByName = new Map(existingClasses.map((item) => [item.name.trim().toLocaleLowerCase("vi"), item.id]));
      for (const row of backup.data.classes) {
        const id = oldId(row); const name = text(row, "name").trim();
        if (id == null || !name) { report.skipped.classes++; continue; }
        let mapped = classByName.get(name.toLocaleLowerCase("vi"));
        if (mapped == null) {
          const [created] = await tx.insert(classes).values({ name, createdBy: userMap.get(nullableNumber(row, "createdBy") ?? -1) ?? null, createdAt: date(row, "createdAt") }).returning({ id: classes.id });
          mapped = created.id; classByName.set(name.toLocaleLowerCase("vi"), mapped); report.added.classes++;
        } else report.skipped.classes++;
        classMap.set(id, mapped);
      }

      const setMap = new Map<number, number>();
      const existingSets = await tx.select().from(vocabSets);
      const setsByKey = new Map(existingSets.map((item) => [setKey(item.name, item.type, item.classId), item.id]));
      for (const row of backup.data.vocabSets) {
        const id = oldId(row); const name = text(row, "name").trim(); const type = text(row, "type");
        const oldClassId = nullableNumber(row, "classId"); const classId = oldClassId == null ? null : classMap.get(oldClassId);
        if (id == null || !name || !type || (oldClassId != null && classId == null)) { report.skipped.vocabSets++; continue; }
        const key = setKey(name, type, classId ?? null); let mapped = setsByKey.get(key);
        if (mapped == null) {
          const [created] = await tx.insert(vocabSets).values({ name, type, classId: classId ?? null, createdBy: userMap.get(nullableNumber(row, "createdBy") ?? -1) ?? null, createdAt: date(row, "createdAt") }).returning({ id: vocabSets.id });
          mapped = created.id; setsByKey.set(key, mapped); report.added.vocabSets++;
        } else report.skipped.vocabSets++;
        setMap.set(id, mapped);
      }

      const wordMap = new Map<number, number>();
      const existingWords = await tx.select().from(words);
      const wordsByKey = new Map(existingWords.map((item) => [wordKey(item.setId, item as unknown as BackupRow), item.id]));
      for (const row of backup.data.words) {
        const id = oldId(row); const setId = setMap.get(number(row, "setId", -1)); const meaning = text(row, "meaning");
        if (id == null || setId == null || !meaning) { report.skipped.words++; continue; }
        const key = wordKey(setId, row); let mapped = wordsByKey.get(key);
        if (mapped == null) {
          const [created] = await tx.insert(words).values({ setId, meaning, v1: nullableText(row, "v1"), v2: nullableText(row, "v2"), v3: nullableText(row, "v3"), term: nullableText(row, "term"), example: nullableText(row, "example"), wtype: nullableText(row, "wtype"), ipa: nullableText(row, "ipa"), createdAt: date(row, "createdAt") }).returning({ id: words.id });
          mapped = created.id; wordsByKey.set(key, mapped); report.added.words++;
        } else report.skipped.words++;
        wordMap.set(id, mapped);
      }

      const members = await tx.select().from(classMembers); const memberKeys = new Set(members.map((item) => pair(item.classId, item.userId)));
      for (const row of backup.data.classMembers) {
        const classId = classMap.get(number(row, "classId", -1)); const userId = userMap.get(number(row, "userId", -1));
        if (classId == null || userId == null || memberKeys.has(pair(classId, userId))) { report.skipped.classMembers++; continue; }
        await tx.insert(classMembers).values({ classId, userId, createdAt: date(row, "createdAt") }); memberKeys.add(pair(classId, userId)); report.added.classMembers++;
      }

      const assignmentMap = new Map<number, number>();
      const existingAssignments = await tx.select().from(assignments);
      const assignmentsByKey = new Map(existingAssignments.map((item) => [assignmentKey(item.classId, item.setId, item.title, item.dueAt), item.id]));
      for (const row of backup.data.assignments) {
        const id = oldId(row); const classId = classMap.get(number(row, "classId", -1)); const setId = setMap.get(number(row, "setId", -1)); const title = text(row, "title").trim(); const dueAt = nullableDate(row, "dueAt");
        if (id == null || classId == null || setId == null || !title) { report.skipped.assignments++; continue; }
        const key = assignmentKey(classId, setId, title, dueAt); let mapped = assignmentsByKey.get(key);
        if (mapped == null) {
          const [created] = await tx.insert(assignments).values({ classId, setId, title, instructions: text(row, "instructions"), mode: text(row, "mode", "mixed"), minScore: number(row, "minScore", 70), dueAt, timeLimitMinutes: nullableNumber(row, "timeLimitMinutes"), archived: bool(row, "archived"), createdBy: userMap.get(nullableNumber(row, "createdBy") ?? -1) ?? null, createdAt: date(row, "createdAt"), updatedAt: date(row, "updatedAt") }).returning({ id: assignments.id });
          mapped = created.id; assignmentsByKey.set(key, mapped); report.added.assignments++;
        } else report.skipped.assignments++;
        assignmentMap.set(id, mapped);
      }

      const existingAttempts = await tx.select().from(attempts); const attemptKeys = new Set(existingAttempts.map(attemptKey));
      for (const row of backup.data.attempts) {
        const userId = userMap.get(number(row, "userId", -1)); const createdAt = date(row, "createdAt");
        const value = { userId: userId ?? -1, setId: setMap.get(nullableNumber(row, "setId") ?? -1) ?? null, setName: text(row, "setName"), mode: text(row, "mode"), score: number(row, "score"), total: number(row, "total"), durationSeconds: nullableNumber(row, "durationSeconds"), timed: bool(row, "timed"), createdAt };
        const key = attemptKey(value); if (userId == null || !value.setName || !value.mode || attemptKeys.has(key)) { report.skipped.attempts++; continue; }
        value.userId = userId; await tx.insert(attempts).values(value); attemptKeys.add(key); report.added.attempts++;
      }

      const extensionRows = await tx.select().from(assignmentExtensions); const extensionKeys = new Set(extensionRows.map((item) => pair(item.assignmentId, item.userId)));
      for (const row of backup.data.assignmentExtensions) {
        const assignmentId = assignmentMap.get(number(row, "assignmentId", -1)); const userId = userMap.get(number(row, "userId", -1)); const key = pair(assignmentId ?? -1, userId ?? -1);
        if (assignmentId == null || userId == null || extensionKeys.has(key)) { report.skipped.assignmentExtensions++; continue; }
        await tx.insert(assignmentExtensions).values({ assignmentId, userId, dueAt: nullableDate(row, "dueAt"), excused: bool(row, "excused"), createdBy: userMap.get(nullableNumber(row, "createdBy") ?? -1) ?? null, createdAt: date(row, "createdAt"), updatedAt: date(row, "updatedAt") }); extensionKeys.add(key); report.added.assignmentExtensions++;
      }

      const submissionRows = await tx.select().from(assignmentSubmissions); const submissionKeys = new Set(submissionRows.map((item) => pair(item.assignmentId, item.userId)));
      for (const row of backup.data.assignmentSubmissions) {
        const assignmentId = assignmentMap.get(number(row, "assignmentId", -1)); const userId = userMap.get(number(row, "userId", -1)); const key = pair(assignmentId ?? -1, userId ?? -1);
        if (assignmentId == null || userId == null || submissionKeys.has(key)) { report.skipped.assignmentSubmissions++; continue; }
        const base64 = nullableText(row, "fileDataBase64"); let fileData: Buffer | null = null;
        if (base64) { fileData = Buffer.from(base64, "base64"); if (fileData.byteLength > MAX_FILE_BYTES) { report.warnings.push(`File nộp ${text(row, "fileName", "không tên")} quá lớn nên không được khôi phục.`); fileData = null; } }
        await tx.insert(assignmentSubmissions).values({ assignmentId, userId, textContent: nullableText(row, "textContent"), fileName: fileData ? nullableText(row, "fileName") : null, fileType: fileData ? nullableText(row, "fileType") : null, fileSize: fileData ? nullableNumber(row, "fileSize") : null, fileData, submittedAt: date(row, "submittedAt"), updatedAt: date(row, "updatedAt") }); submissionKeys.add(key); report.added.assignmentSubmissions++;
      }

      const teachRows = await tx.select().from(teachBackNotes); const teachKeys = new Set(teachRows.map((item) => pair(item.userId, item.wordId)));
      for (const row of backup.data.teachBackNotes) {
        const userId = userMap.get(number(row, "userId", -1)); const wordId = wordMap.get(number(row, "wordId", -1)); const key = pair(userId ?? -1, wordId ?? -1);
        if (userId == null || wordId == null || teachKeys.has(key) || !text(row, "simpleExplanation")) { report.skipped.teachBackNotes++; continue; }
        await tx.insert(teachBackNotes).values({ userId, wordId, simpleExplanation: text(row, "simpleExplanation"), ownExample: nullableText(row, "ownExample"), confidence: number(row, "confidence", 1), reviewCount: number(row, "reviewCount"), nextReviewAt: date(row, "nextReviewAt"), createdAt: date(row, "createdAt"), updatedAt: date(row, "updatedAt") }); teachKeys.add(key); report.added.teachBackNotes++;
      }

      const mistakeRows = await tx.select().from(mistakes); const mistakeKeys = new Set(mistakeRows.map((item) => pair(item.userId, item.wordId)));
      for (const row of backup.data.mistakes) {
        const userId = userMap.get(number(row, "userId", -1)); const wordId = wordMap.get(number(row, "wordId", -1)); const setId = setMap.get(number(row, "setId", -1)); const key = pair(userId ?? -1, wordId ?? -1);
        if (userId == null || wordId == null || setId == null || mistakeKeys.has(key)) { report.skipped.mistakes++; continue; }
        await tx.insert(mistakes).values({ userId, wordId, setId, timesWrong: number(row, "timesWrong", 1), lastWrongAt: date(row, "lastWrongAt") }); mistakeKeys.add(key); report.added.mistakes++;
      }

      const progressRows = await tx.select().from(wordProgress); const progressKeys = new Set(progressRows.map((item) => pair(item.userId, item.wordId)));
      for (const row of backup.data.wordProgress) {
        const userId = userMap.get(number(row, "userId", -1)); const wordId = wordMap.get(number(row, "wordId", -1)); const key = pair(userId ?? -1, wordId ?? -1);
        if (userId == null || wordId == null || progressKeys.has(key)) { report.skipped.wordProgress++; continue; }
        await tx.insert(wordProgress).values({ userId, wordId, known: bool(row, "known"), intervalDays: number(row, "intervalDays"), reviewStreak: number(row, "reviewStreak"), correctCount: number(row, "correctCount"), wrongCount: number(row, "wrongCount"), lastMode: nullableText(row, "lastMode"), lastReviewedAt: nullableDate(row, "lastReviewedAt"), nextReviewAt: nullableDate(row, "nextReviewAt"), updatedAt: date(row, "updatedAt") }); progressKeys.add(key); report.added.wordProgress++;
      }

      const bookmarkRows = await tx.select().from(wordBookmarks); const bookmarkKeys = new Set(bookmarkRows.map((item) => pair(item.userId, item.wordId)));
      for (const row of backup.data.wordBookmarks) {
        const userId = userMap.get(number(row, "userId", -1)); const wordId = wordMap.get(number(row, "wordId", -1)); const key = pair(userId ?? -1, wordId ?? -1);
        if (userId == null || wordId == null || bookmarkKeys.has(key)) { report.skipped.wordBookmarks++; continue; }
        await tx.insert(wordBookmarks).values({ userId, wordId, note: text(row, "note"), createdAt: date(row, "createdAt"), updatedAt: date(row, "updatedAt") }); bookmarkKeys.add(key); report.added.wordBookmarks++;
      }

      const studyRows = await tx.select().from(studySessions); const studyKeys = new Set(studyRows.map((item) => pair(item.userId, item.setId)));
      for (const row of backup.data.studySessions) {
        const userId = userMap.get(number(row, "userId", -1)); const setId = setMap.get(number(row, "setId", -1)); const wordId = wordMap.get(number(row, "wordId", -1)); const key = pair(userId ?? -1, setId ?? -1);
        if (userId == null || setId == null || wordId == null || studyKeys.has(key)) { report.skipped.studySessions++; continue; }
        await tx.insert(studySessions).values({ userId, setId, wordId, position: number(row, "position"), updatedAt: date(row, "updatedAt") }); studyKeys.add(key); report.added.studySessions++;
      }

      const goalRows = await tx.select().from(learningGoals); const goalUsers = new Set(goalRows.map((item) => item.userId));
      for (const row of backup.data.learningGoals) {
        const userId = userMap.get(number(row, "userId", -1)); if (userId == null || goalUsers.has(userId)) { report.skipped.learningGoals++; continue; }
        await tx.insert(learningGoals).values({ userId, dailyWords: number(row, "dailyWords", 10), updatedAt: date(row, "updatedAt") }); goalUsers.add(userId); report.added.learningGoals++;
      }

      const activityRows = await tx.select().from(dailyActivities); const activityKeys = new Set(activityRows.map((item) => `${item.userId}:${item.activityDate}`));
      for (const row of backup.data.dailyActivities) {
        const userId = userMap.get(number(row, "userId", -1)); const activityDate = text(row, "activityDate"); const key = `${userId}:${activityDate}`;
        if (userId == null || !/^\d{4}-\d{2}-\d{2}$/.test(activityDate) || activityKeys.has(key)) { report.skipped.dailyActivities++; continue; }
        await tx.insert(dailyActivities).values({ userId, activityDate, wordsReviewed: number(row, "wordsReviewed"), quizzesCompleted: number(row, "quizzesCompleted"), updatedAt: date(row, "updatedAt") }); activityKeys.add(key); report.added.dailyActivities++;
      }
    });

    return Response.json({ ok: true, report });
  } catch (error) {
    console.error("Backup restore failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Không thể khôi phục dữ liệu. Mọi thay đổi đã được hoàn tác." }, { status: 400 });
  }
}
