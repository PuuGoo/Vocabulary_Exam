import { db } from "@/db";
import {
  appSettings, assignmentExtensions, assignments, assignmentSubmissions, attempts, categoryDocuments,
  classes, classMembers, dailyActivities, learningGoals, mistakes, studySessions, teachBackNotes, users,
  vocabCategories, vocabSets, wordBookmarks, wordProgress, words,
} from "@/db/schema";
import {
  BACKUP_FORMAT, BACKUP_VERSION, backupFilename, sanitizeBackupUsers, serializeCategoryDocuments,
  serializeSubmissionFiles,
} from "@/lib/backup";
import { createBackupChecksum } from "@/lib/backupIntegrity";

export async function createBackupExport(createdBy?: { id: number; username: string }) {
  const [
    userRows, classRows, memberRows, categoryRows, documentRows, setRows, wordRows, attemptRows,
    assignmentRows, extensionRows, submissionRows, teachBackRows, mistakeRows, progressRows,
    bookmarkRows, sessionRows, goalRows, activityRows, settingRows,
  ] = await db.transaction(
    async (tx) => Promise.all([
      tx.select().from(users), tx.select().from(classes), tx.select().from(classMembers),
      tx.select().from(vocabCategories), tx.select().from(categoryDocuments), tx.select().from(vocabSets),
      tx.select().from(words), tx.select().from(attempts), tx.select().from(assignments),
      tx.select().from(assignmentExtensions), tx.select().from(assignmentSubmissions),
      tx.select().from(teachBackNotes), tx.select().from(mistakes), tx.select().from(wordProgress),
      tx.select().from(wordBookmarks), tx.select().from(studySessions), tx.select().from(learningGoals),
      tx.select().from(dailyActivities), tx.select().from(appSettings),
    ]),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );

  const data = {
    users: sanitizeBackupUsers(userRows), classes: classRows, classMembers: memberRows,
    vocabCategories: categoryRows, categoryDocuments: serializeCategoryDocuments(documentRows),
    vocabSets: setRows, words: wordRows, attempts: attemptRows, assignments: assignmentRows,
    assignmentExtensions: extensionRows, assignmentSubmissions: serializeSubmissionFiles(submissionRows),
    teachBackNotes: teachBackRows, mistakes: mistakeRows, wordProgress: progressRows,
    wordBookmarks: bookmarkRows, studySessions: sessionRows, learningGoals: goalRows,
    dailyActivities: activityRows, appSettings: settingRows,
  };
  const counts = Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.length]));
  const now = new Date();
  const body = JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    createdBy: createdBy ?? { id: null, username: "scheduled-backup" },
    privacy: { passwordHashesIncluded: false, passwordResetTokensIncluded: false },
    counts,
    integrity: { algorithm: "SHA-256", checksum: createBackupChecksum(data) },
    data,
  });

  return { body, counts, createdAt: now, filename: backupFilename(now), byteLength: Buffer.byteLength(body, "utf8") };
}
