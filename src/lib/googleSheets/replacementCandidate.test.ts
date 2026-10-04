import assert from "node:assert/strict";
import test from "node:test";
import { createFakeGoogleWorkspaceApi } from "./api";
import { prepareReplacementCandidate } from "./replacementCandidate";
import { getGoogleSheetTemplate } from "./template";
import { valuesForExport } from "./spreadsheet";

const template = getGoogleSheetTemplate({ type: "ielts_vocab", languageCode: "en" });
const rows = [{ sourceId: "v_12345678", values: { term: "hello", meaning: "xin chào" } }];
test("candidate records the new resource before writes and its watch before activation", async () => {
  const events: string[] = [];
  const api = createFakeGoogleWorkspaceApi({
    writeValues: async () => { events.push("write"); },
    readValues: async () => valuesForExport(template, rows),
    createWatchChannel: async () => { events.push("watch"); return { channelId: "new-channel", resourceId: "new-resource", resourceUri: "", channelToken: "test-token", expirationAt: new Date(Date.now() + 60000) }; },
  });
  const result = await prepareReplacementCandidate({ api, template, title: "replacement", rows, aiEnrich: false,
    recordCreated: async () => { events.push("record_created"); }, recordWatch: async () => { events.push("record_watch"); },
  });
  assert.equal(events[0], "record_created");
  assert.equal(events.at(-1), "record_watch");
  assert.equal(result.verification.verifiedRows, 1);
});

test("candidate with incorrect exported content never starts a watch", async () => {
  let watched = false;
  const api = createFakeGoogleWorkspaceApi({
    writeValues: async () => {},
    readValues: async () => valuesForExport(template, []),
    createWatchChannel: async () => { watched = true; throw new Error("unexpected"); },
  });
  await assert.rejects(prepareReplacementCandidate({ api, template, title: "replacement", rows, aiEnrich: false, recordCreated: async () => {}, recordWatch: async () => {} }));
  assert.equal(watched, false);
});
