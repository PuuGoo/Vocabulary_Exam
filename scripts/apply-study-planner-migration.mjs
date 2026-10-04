import "dotenv/config";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const migration = await readFile(new URL("../drizzle/0041_study_planners.sql", import.meta.url), "utf8");
  await client.begin(async transaction => {
    await transaction.unsafe("SET LOCAL lock_timeout = '5s'");
    await transaction.unsafe(migration);
  });
  console.log("Applied 0041_study_planners.sql");
} finally { await client.end(); }
