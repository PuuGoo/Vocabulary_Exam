import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  varchar,
  boolean,
  uniqueIndex,
  index,
  customType,
  date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const roleEnum = ["admin", "student"] as const;
export const setTypeEnum = ["irregular_verb", "ielts_vocab"] as const;
export const modeEnum = ["fill", "mc", "match", "dictation", "pronunciation", "sentence", "mixed", "daily"] as const;
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 64 }).notNull(),
    email: varchar("email", { length: 256 }),
    passwordHash: text("password_hash").notNull(),
    displayName: varchar("display_name", { length: 128 }).notNull(),
    role: varchar("role", { length: 16 }).notNull().default("student"), // 'admin' | 'student'
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    usernameIdx: uniqueIndex("users_username_idx").on(table.username),
  })
);

export const classes = pgTable("classes", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const classMembers = pgTable(
  "class_members",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqPair: uniqueIndex("class_members_class_user_idx").on(table.classId, table.userId),
  })
);

export const vocabSets = pgTable("vocab_sets", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  type: varchar("type", { length: 32 }).notNull(), // 'irregular_verb' | 'ielts_vocab'
  classId: integer("class_id").references(() => classes.id, { onDelete: "set null" }), // null = public, visible to all students
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const words = pgTable("words", {
  id: serial("id").primaryKey(),
  setId: integer("set_id")
    .notNull()
    .references(() => vocabSets.id, { onDelete: "cascade" }),
  // irregular_verb fields
  meaning: text("meaning").notNull(),
  v1: text("v1"),
  v2: text("v2"),
  v3: text("v3"),
  // ielts_vocab fields
  term: text("term"),
  example: text("example"),
  wtype: varchar("wtype", { length: 32 }),
  ipa: varchar("ipa", { length: 128 }), // phonetic transcription, e.g. /wɜːrd/
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const attempts = pgTable("attempts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  setId: integer("set_id").references(() => vocabSets.id, { onDelete: "set null" }),
  setName: varchar("set_name", { length: 256 }).notNull(),
  mode: varchar("mode", { length: 16 }).notNull(), // fill | mc | match | dictation | pronunciation | sentence | mixed | daily
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  durationSeconds: integer("duration_seconds"),
  timed: boolean("timed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const assignments = pgTable(
  "assignments",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    setId: integer("set_id")
      .notNull()
      .references(() => vocabSets.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 256 }).notNull(),
    instructions: text("instructions").notNull().default(""),
    mode: varchar("mode", { length: 24 }).notNull(),
    minScore: integer("min_score").notNull().default(70),
    dueAt: timestamp("due_at", { withTimezone: true }),
    timeLimitMinutes: integer("time_limit_minutes"),
    archived: boolean("archived").notNull().default(false),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    classIdx: index("assignments_class_idx").on(table.classId),
    setIdx: index("assignments_set_idx").on(table.setId),
  })
);

export const assignmentExtensions = pgTable(
  "assignment_extensions",
  {
    id: serial("id").primaryKey(),
    assignmentId: integer("assignment_id").notNull().references(() => assignments.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    excused: boolean("excused").notNull().default(false),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    assignmentUserIdx: uniqueIndex("assignment_extensions_assignment_user_idx").on(table.assignmentId, table.userId),
    userIdx: index("assignment_extensions_user_idx").on(table.userId),
  })
);

export const assignmentSubmissions = pgTable(
  "assignment_submissions",
  {
    id: serial("id").primaryKey(),
    assignmentId: integer("assignment_id").notNull().references(() => assignments.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    textContent: text("text_content"),
    fileName: varchar("file_name", { length: 256 }),
    fileType: varchar("file_type", { length: 128 }),
    fileSize: integer("file_size"),
    fileData: bytea("file_data"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    assignmentUserIdx: uniqueIndex("assignment_submissions_assignment_user_idx").on(table.assignmentId, table.userId),
    userIdx: index("assignment_submissions_user_idx").on(table.userId),
  })
);

export const teachBackNotes = pgTable(
  "teach_back_notes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    wordId: integer("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
    simpleExplanation: text("simple_explanation").notNull(),
    ownExample: text("own_example"),
    confidence: integer("confidence").notNull().default(1),
    reviewCount: integer("review_count").notNull().default(0),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userWordIdx: uniqueIndex("teach_back_notes_user_word_idx").on(table.userId, table.wordId),
    dueIdx: index("teach_back_notes_user_due_idx").on(table.userId, table.nextReviewAt),
  })
);

export const mistakes = pgTable(
  "mistakes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wordId: integer("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    setId: integer("set_id")
      .notNull()
      .references(() => vocabSets.id, { onDelete: "cascade" }),
    timesWrong: integer("times_wrong").notNull().default(1),
    lastWrongAt: timestamp("last_wrong_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqPair: uniqueIndex("mistakes_user_word_idx").on(table.userId, table.wordId),
  })
);

export const wordProgress = pgTable(
  "word_progress",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wordId: integer("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    known: boolean("known").notNull(),
    intervalDays: integer("interval_days").notNull().default(0),
    reviewStreak: integer("review_streak").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    wrongCount: integer("wrong_count").notNull().default(0),
    lastMode: varchar("last_mode", { length: 24 }),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqPair: uniqueIndex("word_progress_user_word_idx").on(table.userId, table.wordId),
    dueIdx: index("word_progress_user_due_idx").on(table.userId, table.nextReviewAt),
  })
);

export const wordBookmarks = pgTable(
  "word_bookmarks",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wordId: integer("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqPair: uniqueIndex("word_bookmarks_user_word_idx").on(table.userId, table.wordId),
  })
);

export const studySessions = pgTable(
  "study_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    setId: integer("set_id")
      .notNull()
      .references(() => vocabSets.id, { onDelete: "cascade" }),
    wordId: integer("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqPair: uniqueIndex("study_sessions_user_set_idx").on(table.userId, table.setId),
  })
);

export const learningGoals = pgTable(
  "learning_goals",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dailyWords: integer("daily_words").notNull().default(10),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: uniqueIndex("learning_goals_user_idx").on(table.userId),
  })
);

export const dailyActivities = pgTable(
  "daily_activities",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityDate: date("activity_date").notNull(),
    wordsReviewed: integer("words_reviewed").notNull().default(0),
    quizzesCompleted: integer("quizzes_completed").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userDateIdx: uniqueIndex("daily_activities_user_date_idx").on(table.userId, table.activityDate),
  })
);

export const passwordResets = pgTable("password_resets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 128 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  attempts: many(attempts),
  sets: many(vocabSets),
  classMemberships: many(classMembers),
}));

export const classesRelations = relations(classes, ({ many }) => ({
  members: many(classMembers),
  sets: many(vocabSets),
}));

export const classMembersRelations = relations(classMembers, ({ one }) => ({
  class: one(classes, { fields: [classMembers.classId], references: [classes.id] }),
  user: one(users, { fields: [classMembers.userId], references: [users.id] }),
}));

export const vocabSetsRelations = relations(vocabSets, ({ many, one }) => ({
  words: many(words),
  creator: one(users, { fields: [vocabSets.createdBy], references: [users.id] }),
  class: one(classes, { fields: [vocabSets.classId], references: [classes.id] }),
}));

export const wordsRelations = relations(words, ({ one }) => ({
  set: one(vocabSets, { fields: [words.setId], references: [vocabSets.id] }),
}));

export const attemptsRelations = relations(attempts, ({ one }) => ({
  user: one(users, { fields: [attempts.userId], references: [users.id] }),
  set: one(vocabSets, { fields: [attempts.setId], references: [vocabSets.id] }),
}));

export const mistakesRelations = relations(mistakes, ({ one }) => ({
  user: one(users, { fields: [mistakes.userId], references: [users.id] }),
  word: one(words, { fields: [mistakes.wordId], references: [words.id] }),
  set: one(vocabSets, { fields: [mistakes.setId], references: [vocabSets.id] }),
}));

export type User = typeof users.$inferSelect;
export type VocabSet = typeof vocabSets.$inferSelect;
export type Word = typeof words.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type AssignmentExtension = typeof assignmentExtensions.$inferSelect;
export type AssignmentSubmission = typeof assignmentSubmissions.$inferSelect;
export type TeachBackNote = typeof teachBackNotes.$inferSelect;
export type ClassRow = typeof classes.$inferSelect;
export type Mistake = typeof mistakes.$inferSelect;
export type WordProgress = typeof wordProgress.$inferSelect;
export type WordBookmark = typeof wordBookmarks.$inferSelect;
export type StudySession = typeof studySessions.$inferSelect;
export type LearningGoal = typeof learningGoals.$inferSelect;
export type DailyActivity = typeof dailyActivities.$inferSelect;
