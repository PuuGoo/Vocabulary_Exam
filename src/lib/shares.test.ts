import assert from "node:assert/strict";
import test from "node:test";
import { buildShareUrl, CATEGORY_SHARE_MODES, defaultShareModes, getPublicShareUrl, modesForSetType } from "./shareConfig";
import { hashShareToken } from "./shareToken";
import { questionCollectionForType, questionTypesForCollections } from "./questionCollections";
import { normalizeShareSlug, RESERVED_SHARE_SLUGS, validateShareSlug } from "./shareSlug";
import { shareAccessMatches, validateSharePassword } from "./sharePasswordPolicy";
import { hashSharePassword, verifySharePassword } from "./sharePasswordHash";
import { clearShareUnlockFailures, recordShareUnlockFailure, SHARE_UNLOCK_LOCK_MS, SHARE_UNLOCK_MAX_FAILURES, shareUnlockRateStatus } from "./shareUnlockRateLimit";

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

test("share passwords are hashed, case-sensitive and support Unicode", async () => {
  const raw = "ATTT-Đề-2026";
  const hash = await hashSharePassword(raw);
  assert.notEqual(hash, raw);
  assert.equal(await verifySharePassword(raw, hash), true);
  assert.equal(await verifySharePassword("attt-Đề-2026", hash), false);
});

test("share password policy and access proof binding are deterministic", () => {
  assert.ok(validateSharePassword("12345"));
  assert.equal(validateSharePassword("123456"), null);
  assert.ok(validateSharePassword("x".repeat(129)));
  assert.equal(shareAccessMatches({ shareId: 1, passwordVersion: 2 }, { id: 1, passwordVersion: 2 }), true);
  assert.equal(shareAccessMatches({ shareId: 1, passwordVersion: 1 }, { id: 1, passwordVersion: 2 }), false);
  assert.equal(shareAccessMatches({ shareId: 2, passwordVersion: 2 }, { id: 1, passwordVersion: 2 }), false);
});

test("share unlock limiter blocks repeated failures and expires deterministically", () => {
  const key = "share-1:client"; const now = 1_000_000;
  clearShareUnlockFailures(key);
  for (let index = 0; index < SHARE_UNLOCK_MAX_FAILURES; index += 1) recordShareUnlockFailure(key, now + index);
  assert.equal(shareUnlockRateStatus(key, now + 10).limited, true);
  assert.equal(shareUnlockRateStatus(key, now + SHARE_UNLOCK_LOCK_MS + 10).limited, false);
  clearShareUnlockFailures(key);
});
