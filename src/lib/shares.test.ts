import assert from "node:assert/strict";
import test from "node:test";
import { buildShareUrl, CATEGORY_SHARE_MODES, defaultShareModes, getPublicShareUrl, modesForSetType } from "./shareConfig";
import { hashShareToken } from "./shareToken";
import { questionCollectionForType, questionTypesForCollections } from "./questionCollections";
import { normalizeShareSlug, RESERVED_SHARE_SLUGS, validateShareSlug } from "./shareSlug";

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

test("Vietnamese share aliases normalize to safe stable slugs", () => {
  assert.equal(normalizeShareSlug("Nhà cửa"), "nha-cua");
  assert.equal(normalizeShareSlug("02_An toàn---thông tin"), "02-an-toan-thong-tin");
  assert.equal(normalizeShareSlug("IELTS Vocabulary – Sức khỏe"), "ielts-vocabulary-suc-khoe");
  assert.equal(normalizeShareSlug("a/b?c#d%20"), "a-b-c-d-20");
});

test("share aliases enforce length and reserved names", () => {
  assert.equal(validateShareSlug("abc").valid, false);
  assert.equal(validateShareSlug("a".repeat(65)).valid, false);
  assert.equal(validateShareSlug("nha-cua").valid, true);
  assert.ok(RESERVED_SHARE_SLUGS.has("admin"));
  assert.deepEqual(validateShareSlug("ADMIN"), { valid: false, slug: "admin", reason: "reserved" });
});

test("public URL prefers a custom alias without replacing the secure token", () => {
  assert.equal(getPublicShareUrl({ customSlug: "nha-cua", rawToken: "secure-token" }, "https://example.test"), "https://example.test/s/nha-cua");
  assert.equal(getPublicShareUrl({ rawToken: "secure-token" }, "https://example.test"), "https://example.test/s/secure-token");
});
