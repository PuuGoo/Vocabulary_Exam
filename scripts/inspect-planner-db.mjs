import "dotenv/config";
import postgres from "postgres";

// Read-only helper: lists the Study Planner tables and their row counts so a
// migration can be verified without printing any user content.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const tables = await client.unsafe(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'study_planner%' ORDER BY table_name",
  );
  for (const row of tables) {
    const name = row.table_name;
    const counted = await client.unsafe('SELECT count(*)::int AS count FROM "' + name + '"');
    console.log(name + ": " + counted[0].count);
  }
  const legacy = await client.unsafe("SELECT count(*)::int AS count FROM study_planners");
  console.log("legacy study_planners rows preserved: " + legacy[0].count);
} finally {
  await client.end();
}
