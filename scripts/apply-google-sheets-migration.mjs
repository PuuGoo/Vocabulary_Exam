import "dotenv/config";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString || !/^postgres(ql)?:\/\//i.test(connectionString)) {
  throw new Error("DATABASE_URL phải là PostgreSQL URL hợp lệ.");
}

const client = postgres(connectionString, { max: 1 });
try {
  const sqlText = await readFile(new URL("../drizzle/0033_google_sheets_sync.sql", import.meta.url), "utf8");
  await client.begin((transaction) => transaction.unsafe(sqlText));
  console.log("Applied 0033_google_sheets_sync.sql");

  const channelTokenSql = await readFile(new URL("../drizzle/0034_google_sheets_channel_token.sql", import.meta.url), "utf8");
  await client.begin((transaction) => transaction.unsafe(channelTokenSql));
  console.log("Applied 0034_google_sheets_channel_token.sql");

  const [integrity] = await client.unsafe(`
    SELECT
      (SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN (
        'google_sheet_connections','google_sheet_sync_channels','google_sheet_row_mappings',
        'google_sheet_sync_runs','google_sheet_sync_locks','google_sheet_sync_pending','google_sheet_oauth_tokens'
      ))::integer AS table_count,
      (SELECT COUNT(*) FROM google_sheet_row_mappings WHERE source_id IS NULL OR source_id = '')::integer AS invalid_mappings,
      (SELECT COUNT(*) FROM google_sheet_connections WHERE delete_behavior NOT IN ('archive','delete','ignore'))::integer AS invalid_delete_behavior,
      (SELECT COUNT(*) FROM vocab_sets)::integer AS set_count,
      (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'google_sheet_sync_channels' AND column_name = 'channel_token_hash')::integer AS channel_token_hash_columns,
      (SELECT COUNT(*) FROM google_sheet_sync_channels WHERE channel_token_hash IS NOT NULL)::integer AS channels_with_token_hash,
      (SELECT COUNT(*) FROM google_sheet_sync_channels WHERE channel_token_hash IS NULL)::integer AS legacy_channels
  `);
  if (integrity.table_count !== 7) throw new Error(`Google Sheets tables missing (${integrity.table_count}/7).`);
  if (integrity.channel_token_hash_columns !== 1) throw new Error("google_sheet_sync_channels.channel_token_hash missing.");
  if (integrity.invalid_mappings || integrity.invalid_delete_behavior) throw new Error("Google Sheets integrity check failed.");
  console.log(JSON.stringify(integrity));
} finally {
  await client.end();
}
