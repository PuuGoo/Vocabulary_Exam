import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "./index";
import { users, vocabSets, words } from "./schema";
import { eq } from "drizzle-orm";
import { IRREGULAR_VERBS_SEED, IELTS_VOCAB_SEED } from "./seed-data";

async function main() {
  console.log("Seeding database...");

  // --- Users ---
  const existingAdmin = await db.query.users.findFirst({ where: eq(users.username, "admin") });
  if (!existingAdmin) {
    await db.insert(users).values([
      {
        username: "admin",
        passwordHash: await bcrypt.hash("admin123", 10),
        displayName: "Quản trị viên",
        role: "admin",
      },
      {
        username: "hocsinh",
        passwordHash: await bcrypt.hash("123456", 10),
        displayName: "Học sinh demo",
        role: "student",
      },
    ]);
    console.log("Created default admin + demo student accounts.");
  } else {
    console.log("Users already seeded, skipping.");
  }

  // --- Vocab sets ---
  const existingVerbSet = await db.query.vocabSets.findFirst({
    where: eq(vocabSets.name, "157 Động từ bất quy tắc"),
  });
  if (!existingVerbSet) {
    const [verbSet] = await db
      .insert(vocabSets)
      .values({ name: "157 Động từ bất quy tắc", type: "irregular_verb" })
      .returning();
    await db.insert(words).values(
      IRREGULAR_VERBS_SEED.map((v) => ({
        setId: verbSet.id,
        meaning: v.m,
        v1: v.v1,
        v2: v.v2,
        v3: v.v3,
      }))
    );

    const [vocabSet] = await db
      .insert(vocabSets)
      .values({ name: "IELTS Vocabulary — Band 6.5+ (mẫu)", type: "ielts_vocab" })
      .returning();
    await db.insert(words).values(
      IELTS_VOCAB_SEED.map((v) => ({
        setId: vocabSet.id,
        meaning: v.meaning,
        term: v.term,
        example: v.example,
        wtype: v.type,
      }))
    );
    console.log("Seeded vocab sets.");
  } else {
    console.log("Vocab sets already seeded, skipping.");
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
