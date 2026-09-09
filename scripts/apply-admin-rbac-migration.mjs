import "dotenv/config";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
const connectionString = process.env.DATABASE_URL;
if (!connectionString || !/^postgres(ql)?:\/\//i.test(connectionString)) throw new Error("DATABASE_URL phải là PostgreSQL URL hợp lệ.");
const migration = await readFile(new URL("../drizzle/0029_admin_rbac.sql", import.meta.url), "utf8");
const client = postgres(connectionString, { max: 1 });
try {
  await client.begin((transaction) => transaction.unsafe(migration));
  const [integrity] = await client.unsafe(`select count(*) filter (where role = 'admin' and admin_profile = 'owner')::integer owner_count, count(*) filter (where role = 'admin' and admin_profile is null)::integer invalid_admins, count(*) filter (where role <> 'admin' and admin_profile is not null)::integer invalid_students from users`);
  if (integrity.owner_count < 1 || integrity.invalid_admins || integrity.invalid_students) throw new Error("Admin RBAC integrity check failed after migration.");
  console.log(`Applied additive admin RBAC migration successfully (${integrity.owner_count} Owner account(s)).`);
} finally { await client.end(); }
