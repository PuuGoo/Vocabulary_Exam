import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("list responses are filtered by visible folders even without set filters", () => {
  const source = readFileSync("src/app/api/admin/google-sheets/connections/route.ts", "utf8");
  assert.match(source, /getVisibleFolderIds\(access\)/);
  assert.match(source, /folderId != null && visibleFolders.has\(folderId\)/);
  assert.match(source, /const items = visibleConnections.map/);
});

test("connection detail uses an explicit safe channel projection", () => {
  const source = readFileSync("src/app/api/admin/google-sheets/connections/[id]/route.ts", "utf8");
  const response = source.slice(source.indexOf("return NextResponse.json({\n"), source.indexOf("export async function PATCH"));
  assert.match(response, /channel: channel \? \{/);
  assert.doesNotMatch(response, /channelTokenHash|\.\.\.channel/);
});
