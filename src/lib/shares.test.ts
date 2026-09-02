import assert from "node:assert/strict";
import test from "node:test";
import { buildShareUrl, CATEGORY_SHARE_MODES, defaultShareModes, modesForSetType } from "./shareConfig";
import { hashShareToken } from "./shareToken";
import { questionCollectionForType, questionTypesForCollections } from "./questionCollections";

test("share tokens are one-way hashed and URLs use the capability token", () => {
  const token = "AbCdEf1234567890-token";
  assert.notEqual(hashShareToken(token), token);
  assert.equal(hashShareToken(token), hashShareToken(token));
  assert.equal(buildShareUrl(token, "https://example.test"), `https://example.test/s/${encodeURIComponent(token)}`);
});

test("share modes are constrained by resource type", () => {
  assert.ok(modesForSetType("ielts_vocab").includes("fill"));
  assert.ok(!modesForSetType("irregular_verb").includes("pronunciation"));
  assert.deepEqual(defaultShareModes("question_collection"), [...CATEGORY_SHARE_MODES]);
});

test("category questions form stable virtual collections", () => {
  assert.equal(questionCollectionForType("multiple_choice"), "quiz");
  assert.equal(questionCollectionForType("true_false"), "quiz");
  assert.equal(questionCollectionForType("essay"), "essay");
  assert.equal(questionCollectionForType("speaking"), "speaking");
  assert.equal(questionCollectionForType("unknown"), null);
  assert.deepEqual(questionTypesForCollections(["quiz", "speaking"]), ["multiple_choice", "true_false", "speaking"]);
});
