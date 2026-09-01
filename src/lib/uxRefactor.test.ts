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
