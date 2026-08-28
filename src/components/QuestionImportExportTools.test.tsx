import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QuestionNavigation, SourcePreview } from "./QuestionImportExportTools";
import { parseQuestionImport } from "../lib/questionImportParser";

function questions(count: number) {
  return parseQuestionImport(Array.from({ length: count }, (_, index) => `${index + 1}. Question ${index + 1}?\nA. Yes\nB. No\nAnswer: A`).join("\n"));
}

test("review navigation keeps stable accessible buttons for the selected question", () => {
  const items = questions(5);
  const html = renderToStaticMarkup(createElement(QuestionNavigation, { items, selectedId: items[2].clientId, startIndex: 0, page: 0, pageCount: 1, onSelect: () => undefined, onPageChange: () => undefined }));
  assert.match(html, /aria-label="Danh sách câu hỏi"/u);
  assert.match(html, /aria-current="true" aria-label="Câu 3"/u);
  assert.equal((html.match(/<button/g) || []).length, 5);
});

test("review navigation renders only the current 100-question page", () => {
  const items = questions(1000).slice(400, 500);
  const html = renderToStaticMarkup(createElement(QuestionNavigation, { items, selectedId: items[46].clientId, startIndex: 400, page: 4, pageCount: 10, onSelect: () => undefined, onPageChange: () => undefined }));
  assert.equal((html.match(/aria-label="Câu \d+"/g) || []).length, 100);
  assert.match(html, /aria-current="true" aria-label="Câu 447"/u);
  assert.match(html, /Trang 5\/10/u);
});

test("raw source preview highlights only the selected block with constant DOM segments", () => {
  const raw = Array.from({ length: 500 }, (_, index) => `${index + 1}. Question ${index + 1}?\nA. Yes\nB. No\nAnswer: A`).join("\n");
  const selected = parseQuestionImport(raw)[46];
  const html = renderToStaticMarkup(createElement(SourcePreview, { raw, selected }));
  assert.equal((html.match(/<mark/g) || []).length, 1);
  assert.equal((html.match(/<span/g) || []).length, 2);
  assert.match(html, /<mark[^>]*>47\. Question 47\?/u);
  assert.doesNotMatch(html.match(/<mark[^>]*>(.*?)<\/mark>/u)?.[1] || "", /Question (?:46|48)\?/u);
});
