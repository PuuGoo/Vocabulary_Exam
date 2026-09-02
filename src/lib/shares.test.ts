import assert from "node:assert/strict";
import test from "node:test";
import { buildShareUrl, defaultShareModes, modesForSetType, QUESTION_SHARE_MODES } from "./shareConfig";
import { hashShareToken } from "./shareToken";

test("share tokens are one-way hashed and URLs use the capability token", () => {
  const token = "AbCdEf1234567890-token";
  assert.notEqual(hashShareToken(token), token);
  assert.equal(hashShareToken(token), hashShareToken(token));
  assert.equal(buildShareUrl(token, "https://example.test"), `https://example.test/s/${encodeURIComponent(token)}`);
});

test("share modes are constrained by resource type", () => {
  assert.ok(modesForSetType("ielts_vocab").includes("fill"));
  assert.ok(!modesForSetType("irregular_verb").includes("pronunciation"));
  assert.deepEqual(defaultShareModes("question_collection"), [...QUESTION_SHARE_MODES]);
});
