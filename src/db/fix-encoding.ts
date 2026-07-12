import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { vocabSets, words, users, classes } from "./schema";
import { normalizeText } from "../lib/text";

async function main() {
  console.log("Normalizing existing text data to Unicode NFC...");

  const allSets = await db.select().from(vocabSets);
  for (const s of allSets) {
    const name = normalizeText(s.name);
    if (name !== s.name) {
      await db.update(vocabSets).set({ name }).where(eq(vocabSets.id, s.id));
    }
  }

  const allWords = await db.select().from(words);
  for (const w of allWords) {
    const patch: Record<string, string> = {};
    if (w.meaning && normalizeText(w.meaning) !== w.meaning) patch.meaning = normalizeText(w.meaning);
    if (w.v1 && normalizeText(w.v1) !== w.v1) patch.v1 = normalizeText(w.v1);
    if (w.v2 && normalizeText(w.v2) !== w.v2) patch.v2 = normalizeText(w.v2);
    if (w.v3 && normalizeText(w.v3) !== w.v3) patch.v3 = normalizeText(w.v3);
    if (w.term && normalizeText(w.term) !== w.term) patch.term = normalizeText(w.term);
    if (w.example && normalizeText(w.example) !== w.example) patch.example = normalizeText(w.example);
    if (w.wtype && normalizeText(w.wtype) !== w.wtype) patch.wtype = normalizeText(w.wtype);
    if (Object.keys(patch).length > 0) {
      await db.update(words).set(patch).where(eq(words.id, w.id));
    }
  }

  const allUsers = await db.select().from(users);
  for (const u of allUsers) {
    const displayName = normalizeText(u.displayName);
    if (displayName !== u.displayName) {
      await db.update(users).set({ displayName }).where(eq(users.id, u.id));
    }
  }

  const allClasses = await db.select().from(classes);
  for (const c of allClasses) {
    const name = normalizeText(c.name);
    if (name !== c.name) {
      await db.update(classes).set({ name }).where(eq(classes.id, c.id));
    }
  }

  console.log("Done normalizing.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
