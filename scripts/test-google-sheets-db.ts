import { randomBytes } from "node:crypto";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { spawn, execFileSync } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../src/db/schema";

async function main() {
  const keepAlive = setInterval(() => {}, 1000);
  const directory = mkdtempSync(join(tmpdir(), "lexora-sheets-test-"));
  const password = randomBytes(24).toString("hex");
  const port = await new Promise<number>((resolve, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      if (!address || typeof address === "string") { socket.close(); reject(new Error("No isolated PostgreSQL port")); return; }
      socket.close(error => error ? reject(error) : resolve(address.port));
    });
  });
  const server = new EmbeddedPostgres({ databaseDir: join(directory, "data"), port, user: "postgres", password, persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"], onLog: () => {}, onError: message => console.error(String(message)) });
  let client: ReturnType<typeof postgres> | undefined;
  const windowsControl = process.platform === "win32" ? join(process.cwd(), "node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe") : null;
  let started = false;
  try {
    console.log("Initializing isolated PostgreSQL cluster.");
    await server.initialise();
    console.log("Starting isolated PostgreSQL cluster.");
    if (windowsControl) execFileSync(windowsControl, ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"], { windowsHide: true, stdio: "ignore", timeout: 60000 });
    else await server.start();
    started = true;
    console.log("Creating isolated database.");
    const bootstrap = postgres(`postgres://postgres:${password}@127.0.0.1:${port}/postgres`, { max: 1 });
    try { await bootstrap.unsafe("CREATE DATABASE lexora_sheets_test"); } finally { await bootstrap.end(); }
    const url = `postgres://postgres:${password}@127.0.0.1:${port}/lexora_sheets_test`;
    client = postgres(url, { max: 1 });
    const database = drizzle(client, { schema });
    console.log("Generating isolated database schema.");
    const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));
    console.log(`Applying ${statements.length} schema statements.`);
    for (const statement of statements) await client.unsafe(statement);
    await database.insert(schema.users).values({ username: "admin", passwordHash: "test-only", displayName: "Test administrator", role: "admin", adminProfile: "super_admin" });
    console.log("Dedicated loopback PostgreSQL initialized; no production configuration loaded.");
    const files = readdirSync("src/lib/googleSheets").filter(name => name.endsWith(".test.ts")).map(name => `src/lib/googleSheets/${name}`);
    const child = spawn(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", "--test-force-exit", ...files], { stdio: "inherit", env: { ...process.env, DOTENV_CONFIG_PATH: join(directory, "no-dotenv"), DATABASE_URL: url, GOOGLE_SHEETS_TEST_DB: "1", GOOGLE_SHEETS_TEST_DB_SSL: "0", GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("hex"), GOOGLE_CLIENT_ID: "local-test", GOOGLE_CLIENT_SECRET: "local-test", GOOGLE_REDIRECT_URI: "http://127.0.0.1/callback", GOOGLE_WEBHOOK_BASE_URL: "https://example.invalid" } });
    process.exitCode = await new Promise<number>((resolve, reject) => { child.on("error", reject); child.on("exit", code => resolve(code ?? 1)); });
  } finally {
    await client?.end();
    if (started && windowsControl) execFileSync(windowsControl, ["-D", join(directory, "data"), "-m", "fast", "-w", "stop"], { windowsHide: true, stdio: "pipe", timeout: 30000 });
    else if (started) await server.stop();
    clearInterval(keepAlive);
    console.log(`Stopped dedicated PostgreSQL. Test data retained at ${directory}`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
