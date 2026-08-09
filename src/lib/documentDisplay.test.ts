import assert from "node:assert/strict";
import test from "node:test";
import { formatAggregatedDocumentName, removeDocumentDisplayPrefix } from "./documentDisplay";

test("parent document view replaces child-local prefixes with one continuous sequence", () => {
  assert.equal(formatAggregatedDocumentName(1, "01_Sức khỏe.pdf"), "01_Sức khỏe.pdf");
  assert.equal(formatAggregatedDocumentName(4, "01_Thời gian.pdf"), "04_Thời gian.pdf");
  assert.equal(formatAggregatedDocumentName(12, "03-Cuộc sống.pdf"), "12_Cuộc sống.pdf");
});

test("aggregate numbering works for titles and leaves their useful label intact", () => {
  assert.equal(formatAggregatedDocumentName(2, "01.exam"), "02_exam");
  assert.equal(removeDocumentDisplayPrefix("  07_ Lý thuyết "), "Lý thuyết");
});
