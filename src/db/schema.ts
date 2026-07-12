import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  varchar,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const roleEnum = ["admin", "student"] as const;
export const setTypeEnum = ["irregular_verb", "ielts_vocab"] as const;
export const modeEnum = ["fill", "mc"] as const;

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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const attempts = pgTable("attempts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  setId: integer("set_id").references(() => vocabSets.id, { onDelete: "set null" }),
  setName: varchar("set_name", { length: 256 }).notNull(),
  mode: varchar("mode", { length: 16 }).notNull(), // 'fill' | 'mc'
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  durationSeconds: integer("duration_seconds"),
  timed: boolean("timed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
export type ClassRow = typeof classes.$inferSelect;
export type Mistake = typeof mistakes.$inferSelect;
