import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("My Words uses production APIs and the legacy vault has no starter data", () => {
  const page = readFileSync("src/app/(student)/my-words/page.tsx", "utf8");
  const legacy = readFileSync("src/app/(student)/vocabulary-vault/page.tsx", "utf8");
  for (const endpoint of ["/api/dictionary", "/api/bookmarks", "/api/mistakes"]) assert.equal(page.includes(endpoint), true, endpoint);
  for (const fake of ["starterWords", "meal", "deal", "cheap"]) {
    assert.equal(page.includes(fake), false, fake);
    assert.equal(legacy.includes(fake), false, fake);
  }
});

test("large student set selectors share the hierarchical picker", () => {
  for (const path of ["mixed-practice", "feynman", "print-sets"]) {
    const source = readFileSync(`src/app/(student)/${path}/page.tsx`, "utf8");
    assert.equal(source.includes("@/components/SetPicker"), true, path);
  }
  assert.equal(readFileSync("src/app/(student)/mixed-practice/page.tsx", "utf8").includes("eligible.slice(0, 3)"), false);
});

test("admin list workspaces expose production filters and responsive views", () => {
  const users = readFileSync("src/app/admin/users/page.tsx", "utf8");
  const results = readFileSync("src/app/admin/results/page.tsx", "utf8");
  for (const marker of ["roleFilter", "md:hidden", "ConfirmDialog"]) assert.equal(users.includes(marker), true, marker);
  for (const marker of ["studentFilter", "modeFilter", "dateFrom", "PAGE_SIZE", "md:hidden"]) assert.equal(results.includes(marker), true, marker);
});

test("Study exposes a user-scoped unknown-fill action and disables zero counts", () => {
  const page = readFileSync("src/app/(student)/study/page.tsx", "utf8");
  const api = readFileSync("src/app/api/sets/route.ts", "utf8");
  assert.match(page, /scope=unknown/);
  assert.match(page, /set\.unknownCount === 0/);
  assert.match(page, /Điền từ chưa nhớ/);
  assert.match(api, /unknownCount/);
  assert.match(api, /wordProgress\.userId, session\.userId/);
});

test("Learn unknown review links to fill scope without exposing it to shared guests", () => {
  const source = readFileSync("src/components/learning/LearnExperience.tsx", "utf8");
  assert.match(source, /mode === "unknown" && unknown > 0 && authenticatedSetId/);
  assert.match(source, /mode=fill&scope=unknown/);
});

test("unknown fill uses flashcard progress and never rewrites self-rating", () => {
  const source = readFileSync("src/app/(student)/quiz/[setId]/page.tsx", "utf8");
  assert.match(source, /filterWordsByFillScope\(loadedSet\.words, data\.progress/);
  assert.doesNotMatch(source, /wordProgress/);
  assert.doesNotMatch(source, /\/api\/progress/);
});
