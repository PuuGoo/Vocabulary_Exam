import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const directory = "src/lib/googleSheets";
const files = readdirSync(directory).filter(name => name.endsWith(".test.ts")).sort().map(name => `${directory}/${name}`);
const environment = { ...process.env, DOTENV_CONFIG_PATH: ".env.test-isolated-nonexistent", GOOGLE_SHEETS_TEST_DB: "0", DATABASE_URL: "postgres://unused:unused@127.0.0.1:1/unused", GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY: "" };
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", "--test-force-exit", ...files], { env: environment, stdio: "inherit" });
process.exit(result.status ?? 1);
