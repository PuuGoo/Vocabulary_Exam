import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QuestionEditor, QuestionNavigation, SourcePreview } from "./QuestionImportExportTools";
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
  assert.match(html, />5\/10</u);
});

test("review navigation stays on one compact horizontally scrollable row", () => {
  const items = questions(69);
  const html = renderToStaticMarkup(createElement(QuestionNavigation, { items, selectedId: items[68].clientId, startIndex: 0, page: 0, pageCount: 1, onSelect: () => undefined, onPageChange: () => undefined }));
  assert.match(html, /data-question-navigation="true"/u);
  assert.match(html, /overflow-x-auto/u);
  assert.match(html, /whitespace-nowrap/u);
  assert.doesNotMatch(html, /flex-wrap/u);
  assert.match(html, /aria-current="true" aria-label="Câu 69"/u);
});

test("normal four-option MCQ uses the compact desktop editor layout", () => {
  const item = parseQuestionImport("1. Information Security là gì?\nA. Bảo vệ thông tin trái phép\nB. Chỉ bảo vệ phần cứng\nC. Chỉ mã hóa dữ liệu\nD. Chỉ sao lưu\nĐáp án: A")[0];
  const html = renderToStaticMarkup(createElement(QuestionEditor, { item, autoNext: true, onAutoNext: () => undefined, onChange: () => undefined, importAnyway: false, onImportAnyway: () => undefined }));
  assert.match(html, /data-question-editor="true"/u);
  assert.match(html, /data-options-grid="true"/u);
  assert.match(html, /md:grid-cols-2/u);
  assert.equal((html.match(/data-option-row="true"/g) || []).length, 4);
  assert.match(html, /aria-label="Nội dung lựa chọn A"/u);
  assert.match(html, /aria-label="Nội dung lựa chọn D"/u);
  assert.match(html, /data-editor-bottom="true"/u);
  assert.match(html, /aria-label="Giải thích"/u);
  assert.match(html, /aria-label="Độ khó"/u);
  assert.match(html, /aria-label="Tags"/u);
});

test("long editor fields use bounded internal scrolling", () => {
  const item = parseQuestionImport(`1. ${"Câu hỏi dài ".repeat(80)}?\nA. ${"Nội dung A ".repeat(80)}\nB. B\nC. C\nD. D\nĐáp án: A`)[0];
  item.explanation = "Giải thích dài ".repeat(200);
  const html = renderToStaticMarkup(createElement(QuestionEditor, { item, autoNext: false, onAutoNext: () => undefined, onChange: () => undefined, importAnyway: false, onImportAnyway: () => undefined }));
  assert.match(html, /h-14 max-h-24 resize-none overflow-y-auto/u);
  assert.match(html, /h-8 max-h-16[^"]*overflow-y-auto/);
  assert.match(html, /h-16 max-h-20 resize-none overflow-y-auto/u);
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
