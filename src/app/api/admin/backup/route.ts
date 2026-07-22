import { db } from "@/db";
import {
  assignmentExtensions,
  assignments,
  assignmentSubmissions,
  attempts,
  classes,
  classMembers,
  dailyActivities,
  learningGoals,
  mistakes,
  studySessions,
  teachBackNotes,
  users,
  vocabSets,
  wordBookmarks,
  wordProgress,
  words,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { BACKUP_FORMAT, BACKUP_VERSION, backupFilename, sanitizeBackupUsers, serializeSubmissionFiles } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Bạn không có quyền sao lưu dữ liệu." }, { status: 403 });
  }

  const [
    userRows,
    classRows,
    memberRows,
    setRows,
    wordRows,
    attemptRows,
    assignmentRows,
    extensionRows,
    submissionRows,
    teachBackRows,
    mistakeRows,
    progressRows,
    bookmarkRows,
    sessionRows,
    goalRows,
    activityRows,
  ] = await Promise.all([
    db.select().from(users),
    db.select().from(classes),
    db.select().from(classMembers),
    db.select().from(vocabSets),
    db.select().from(words),
    db.select().from(attempts),
    db.select().from(assignments),
    db.select().from(assignmentExtensions),
    db.select().from(assignmentSubmissions),
    db.select().from(teachBackNotes),
    db.select().from(mistakes),
    db.select().from(wordProgress),
    db.select().from(wordBookmarks),
    db.select().from(studySessions),
    db.select().from(learningGoals),
    db.select().from(dailyActivities),
  ]);

  const data = {
    users: sanitizeBackupUsers(userRows),
    classes: classRows,
    classMembers: memberRows,
    vocabSets: setRows,
    words: wordRows,
    attempts: attemptRows,
    assignments: assignmentRows,
    assignmentExtensions: extensionRows,
    assignmentSubmissions: serializeSubmissionFiles(submissionRows),
    teachBackNotes: teachBackRows,
    mistakes: mistakeRows,
    wordProgress: progressRows,
    wordBookmarks: bookmarkRows,
    studySessions: sessionRows,
    learningGoals: goalRows,
    dailyActivities: activityRows,
  };
  const counts = Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.length]));
  const now = new Date();
  const body = JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    createdBy: { id: session.userId, username: session.username },
    privacy: { passwordHashesIncluded: false, passwordResetTokensIncluded: false },
    counts,
    data,
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${backupFilename(now)}"`,
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
