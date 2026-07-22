import { spawnSync } from "node:child_process";

const serverUrl = process.argv[2];

if (!serverUrl) {
  console.error("Thiếu URL máy chủ. Ví dụ: npm run android:sync:production -- https://app.lexora.vn");
  process.exit(1);
}

let parsedUrl;
try {
  parsedUrl = new URL(serverUrl);
} catch {
  console.error("URL máy chủ không hợp lệ.");
  process.exit(1);
}

if (parsedUrl.protocol !== "https:") {
  console.error("Bản Android phát hành bắt buộc dùng URL HTTPS.");
  process.exit(1);
}

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(executable, ["cap", "sync", "android"], {
  stdio: "inherit",
  env: { ...process.env, CAPACITOR_SERVER_URL: parsedUrl.origin },
});

process.exit(result.status ?? 1);
