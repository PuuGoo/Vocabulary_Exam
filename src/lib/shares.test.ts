import assert from "node:assert/strict";
import test from "node:test";
import { buildShareUrl, CATEGORY_SHARE_MODES, defaultShareModes, getPublicShareUrl, modesForSetType } from "./shareConfig";
import { hashShareToken } from "./shareToken";
import { questionCollectionForType, questionTypesForCollections } from "./questionCollections";
import { normalizeShareSlug, RESERVED_SHARE_SLUGS, validateShareSlug } from "./shareSlug";
import { shareAccessMatches, validateSharePassword } from "./sharePasswordPolicy";
import { hashSharePassword, verifySharePassword } from "./sharePasswordHash";
import { clearShareUnlockFailures, recordShareUnlockFailure, SHARE_UNLOCK_LOCK_MS, SHARE_UNLOCK_MAX_FAILURES, shareUnlockRateStatus } from "./shareUnlockRateLimit";
import { buildSharedFolderView } from "./shareCategoryTree";
import { buildCategoryDocumentResponse } from "./categoryDocumentResponse";
import { createQuestionAttempt, gradeStableOptions, resolveQuestionAttempt } from "./questionShuffle";

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

test("shared category browsing returns only direct folders and direct content", () => {
  const content = {
    sets: [{ id: 1, name: "Set A", category: "ROOT / 01_A" }],
    questions: Array.from({ length: 10 }, (_, index) => ({ id: index + 10, questionType: "multiple_choice", category: "ROOT / 02_C" })),
    documents: [{ id: 1, title: "Root.pdf", fileName: "Root.pdf", category: "ROOT" }, { id: 2, title: "B.pdf", fileName: "B.pdf", category: "ROOT / 01_A / 02_B" }],
  };
  const root = buildSharedFolderView("ROOT", "", content)!;
  assert.deepEqual(root.folders.map((item) => item.name), ["01_A", "02_C"]);
  assert.deepEqual(root.documents.map((item) => item.fileName), ["Root.pdf"]);
  assert.deepEqual(root.sets, []);
  assert.deepEqual(root.collections, []);
  const child = buildSharedFolderView("ROOT", "01_A", content)!;
  assert.deepEqual(child.folders.map((item) => item.name), ["02_B"]);
  assert.deepEqual(child.sets.map((item) => item.name), ["Set A"]);
  const nested = buildSharedFolderView("ROOT", "01_A / 02_B", content)!;
  assert.deepEqual(nested.documents.map((item) => item.fileName), ["B.pdf"]);
  assert.deepEqual(nested.currentFolder.breadcrumbs.map((item) => item.name), ["ROOT", "01_A", "02_B"]);
  assert.deepEqual(buildSharedFolderView("ROOT", "02_C", content)!.collections, [{ key: "quiz", count: 10 }]);
  assert.equal(buildSharedFolderView("ROOT", "Other Secret", content), null);
});

test("shared folders keep canonical natural numeric ordering", () => {
  const view = buildSharedFolderView("ROOT", "", { sets: ["10_Z", "03_C", "02_B"].map((name, id) => ({ id, name, category: `ROOT / ${name}` })), questions: [], documents: [] })!;
  assert.deepEqual(view.folders.map((item) => item.name), ["02_B", "03_C", "10_Z"]);
});

test("canonical document response preserves public PDF bytes and headers", async () => {
  const source = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const response = buildCategoryDocumentResponse({ fileName: "An toàn thông tin.pdf", fileType: "application/pdf", fileData: source }, "private, no-store");
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("content-length"), String(source.length));
  assert.match(response.headers.get("content-disposition") || "", /^inline;/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), source);
});

test("shared canonical MCQ grades the User domain option by stable identity", () => {
  const question = { id: 79, options: ["LAN domain", "User domain", "WAN domain", "Systems/Applications domain"], correctOption: "B", correctOptions: ["B"] };
  const attempt = createQuestionAttempt([question], { shuffleQuestions: false, shuffleOptions: true, shuffleMode: "random" }, () => 0.31);
  const resolved = resolveQuestionAttempt([question], attempt)[0];
  const userDomain = resolved.displayOptions.find((option) => option.text === "User domain")!;
  const lanDomain = resolved.displayOptions.find((option) => option.text === "LAN domain")!;
  assert.equal(gradeStableOptions(resolved.correctOptionIds, [userDomain.id]), true);
  assert.equal(gradeStableOptions(resolved.correctOptionIds, [lanDomain.id]), false);
});
