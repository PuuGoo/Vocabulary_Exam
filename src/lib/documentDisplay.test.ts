import assert from "node:assert/strict";
import test from "node:test";
import { compareDocumentsByFolderThenName, formatAggregatedDocumentName, removeDocumentDisplayPrefix } from "./documentDisplay";

test("parent document view replaces child-local prefixes with one continuous sequence", () => {
  assert.equal(formatAggregatedDocumentName(1, "01_Sức khỏe.pdf"), "01_Sức khỏe.pdf");
  assert.equal(formatAggregatedDocumentName(4, "01_Thời gian.pdf"), "04_Thời gian.pdf");
  assert.equal(formatAggregatedDocumentName(12, "03-Cuộc sống.pdf"), "12_Cuộc sống.pdf");
});

test("aggregate numbering works for titles and leaves their useful label intact", () => {
  assert.equal(formatAggregatedDocumentName(2, "01.exam"), "02_exam");
  assert.equal(removeDocumentDisplayPrefix("  07_ Lý thuyết "), "Lý thuyết");
});

test("parent view groups PDFs by child folder before ordering files inside it", () => {
  const documents = [
    { id: 4, category: "Vocabulary / 02_Giải trí", title: "01_Phần mở đầu" },
    { id: 3, category: "Vocabulary / 01_Sức khỏe", title: "02_Bài tập" },
    { id: 2, category: "Vocabulary / 02_Giải trí", title: "02_Bài tập" },
    { id: 1, category: "Vocabulary / 01_Sức khỏe", title: "01_Lý thuyết" },
  ].sort(compareDocumentsByFolderThenName);

  assert.deepEqual(documents.map((document) => document.id), [1, 3, 4, 2]);
});
