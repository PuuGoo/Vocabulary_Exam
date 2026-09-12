import assert from "node:assert/strict";
import test from "node:test";
import {
  categoryBreadcrumbs,
  categoryPathsWithAncestors,
  countDescendantDueSets,
  listChildCategoryFolders,
  parentCategoryPath,
  searchCategorizedItems,
  setsDirectlyInFolder,
  splitCategoryPath,
  UNCATEGORIZED_PATH,
} from "./categoryPath";

const sets = [
  { name: "Grammar basics", category: "Grammar" },
  { name: "Countries", category: "Vocabulary / 01_Mở Đầu Từ Vựng" },
  { name: "Numbers", category: "Vocabulary / 01_Mở Đầu Từ Vựng" },
  { name: "Nature", category: "Vocabulary / 02_Thế Giới Tự Nhiên" },
  { name: "Deep unit", category: "Vocabulary / IELTS / Unit 01" },
  { name: "Loose set", category: null },
];

test("category paths support root, two levels and arbitrary depth", () => {
  assert.deepEqual(splitCategoryPath(" Grammar "), ["Grammar"]);
  assert.deepEqual(splitCategoryPath("Vocabulary / 01_Mở Đầu Từ Vựng"), ["Vocabulary", "01_Mở Đầu Từ Vựng"]);
  assert.deepEqual(splitCategoryPath(" Vocabulary// IELTS / Unit 01 "), ["Vocabulary", "IELTS", "Unit 01"]);
});

test("parent folder counts include every descendant set", () => {
  const root = listChildCategoryFolders("", [], sets);
  assert.equal(root.find((folder) => folder.path === "Vocabulary")?.count, 4);
  assert.equal(root.find((folder) => folder.path === "Grammar")?.count, 1);
});

test("root and nested folders expose only their direct children", () => {
  assert.deepEqual(listChildCategoryFolders("", [], sets).filter((folder) => folder.path !== UNCATEGORIZED_PATH).map((folder) => folder.path), ["Grammar", "Vocabulary"]);
  assert.deepEqual(listChildCategoryFolders("Vocabulary", [], sets).map((folder) => folder.name), ["01_Mở Đầu Từ Vựng", "02_Thế Giới Tự Nhiên", "IELTS"]);
});

test("nested folder returns only directly assigned sets", () => {
  assert.deepEqual(setsDirectlyInFolder("Vocabulary / 01_Mở Đầu Từ Vựng", sets).map((set) => set.name), ["Countries", "Numbers"]);
});

test("breadcrumbs and parent navigation preserve canonical path", () => {
  assert.deepEqual(categoryBreadcrumbs("Vocabulary / IELTS / Unit 01").map((item) => item.path), ["Vocabulary", "Vocabulary / IELTS", "Vocabulary / IELTS / Unit 01"]);
  assert.equal(parentCategoryPath("Vocabulary / IELTS / Unit 01"), "Vocabulary / IELTS");
});

test("uncategorized sets are available through a virtual folder", () => {
  assert.equal(listChildCategoryFolders("", [], sets).find((folder) => folder.path === UNCATEGORIZED_PATH)?.name, "Chưa phân loại");
  assert.deepEqual(setsDirectlyInFolder(UNCATEGORIZED_PATH, sets).map((set) => set.name), ["Loose set"]);
});

test("natural Vietnamese sorting keeps numeric prefixes in order", () => {
  const paths = ["Vocabulary / 10_Công Nghệ", "Vocabulary / 02_Thế Giới", "Vocabulary / 01_Mở Đầu", "Vocabulary / 03_Hoạt Động"];
  assert.deepEqual(listChildCategoryFolders("Vocabulary", paths, []).map((folder) => folder.name), ["01_Mở Đầu", "02_Thế Giới", "03_Hoạt Động", "10_Công Nghệ"]);
});

test("ancestor generation uses folder basenames without flattening hierarchy", () => {
  assert.deepEqual(categoryPathsWithAncestors(["Vocabulary / IELTS / Unit 01"]), ["Vocabulary", "Vocabulary / IELTS", "Vocabulary / IELTS / Unit 01"]);
});

test("global search finds a set in a nested folder from root", () => {
  assert.deepEqual(searchCategorizedItems("unit 01", sets).map((set) => set.name), ["Deep unit"]);
  assert.deepEqual(searchCategorizedItems("countries", sets).map((set) => set.name), ["Countries"]);
});

test("folder due aggregate includes descendants, arbitrary depth and uncategorized sets", () => {
  const progressSets = [
    { category: "Vocabulary / IELTS / Unit 01", reviewStatus: "due" },
    { category: "Vocabulary / IELTS / Unit 02", reviewStatus: "learning" },
    { category: "Vocabulary / General", reviewStatus: "due" },
    { category: null, reviewStatus: "due" },
  ];
  assert.equal(countDescendantDueSets("Vocabulary", progressSets), 2);
  assert.equal(countDescendantDueSets("Vocabulary / IELTS", progressSets), 1);
  assert.equal(countDescendantDueSets(UNCATEGORIZED_PATH, progressSets), 1);
});
