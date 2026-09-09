import "dotenv/config";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString || !/^postgres(ql)?:\/\//i.test(connectionString)) {
  throw new Error("DATABASE_URL phải là PostgreSQL URL hợp lệ.");
}

const sqlText = await readFile(new URL("../drizzle/0028_word_positions.sql", import.meta.url), "utf8");
const client = postgres(connectionString, { max: 1 });
try {
  await client.begin((transaction) => transaction.unsafe(sqlText));
  const [integrity] = await client.unsafe(`
    SELECT
      COUNT(*) FILTER (WHERE position IS NULL OR position < 1)::integer AS invalid_positions,
      COUNT(*)::integer AS word_count
    FROM words
  `);
  const [duplicates] = await client.unsafe(`
    SELECT COUNT(*)::integer AS duplicate_groups
    FROM (SELECT set_id, position FROM words GROUP BY set_id, position HAVING COUNT(*) > 1) duplicate_positions
  `);
  const [gaps] = await client.unsafe(`
    SELECT COUNT(*)::integer AS non_contiguous_sets
    FROM (SELECT set_id FROM words GROUP BY set_id HAVING MIN(position) <> 1 OR MAX(position) <> COUNT(*)) invalid_sets
  `);
  if (integrity.invalid_positions || duplicates.duplicate_groups || gaps.non_contiguous_sets) {
    throw new Error("Word position integrity check failed after migration.");
  }
  console.log(`Applied additive word position migration successfully (${integrity.word_count} words, no gaps or duplicates).`);
} finally {
  await client.end();
}
