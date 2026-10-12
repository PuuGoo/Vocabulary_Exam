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
  // Phase 3 (0043): full normalized planner model. Additive + idempotent;
  // backfills study_planner_connections from legacy study_planners without
  // touching the legacy rows.
  const plannerSync = await readFile(new URL("../drizzle/0043_study_planner_sync.sql", import.meta.url), "utf8");
  await client.begin(async transaction => {
    await transaction.unsafe("SET LOCAL lock_timeout = '10s'");
    await transaction.unsafe(plannerSync);
  });
  console.log("Applied 0043_study_planner_sync.sql");
  const plannerTemplate = await readFile(new URL("../drizzle/0044_study_planner_template_registry.sql", import.meta.url), "utf8");
  await client.begin(async transaction => {
    await transaction.unsafe("SET LOCAL lock_timeout = '10s'");
    await transaction.unsafe(plannerTemplate);
  });
  console.log("Applied 0044_study_planner_template_registry.sql");
} finally { await client.end(); }
