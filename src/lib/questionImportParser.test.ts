import test from "node:test";
import assert from "node:assert/strict";
import { normalizeQuestionIdentity, normalizeQuestionImportText, parseQuestionImport, partitionImportCandidates, revalidateParsedQuestion, summarizeParsedQuestions } from "./questionImportParser";

const mc = (markers = ["A.", "B.", "C.", "D."]) => `Câu 1. Tính toàn vẹn đảm bảo điều gì?\n${markers[0]} Chỉ người có quyền được sửa\n${markers[1]} Mọi người được sửa\n${markers[2]} Luôn trực tuyến\n${markers[3]} Chỉ sao lưu\nĐáp án: A`;
test("parses standard A/B/C/D", () => { const [q] = parseQuestionImport(mc()); assert.equal(q.type, "multiple_choice"); assert.equal(q.options.length, 4); assert.equal(q.options[0].isCorrect, true); });
test("parses A) B) C) D)", () => assert.equal(parseQuestionImport(mc(["A)", "B)", "C)", "D)"]))[0].options.length, 4));
test("parses lowercase options", () => assert.equal(parseQuestionImport(mc(["a.", "b.", "c.", "d."]))[0].options[0].id, "A"));
test("parses numbered options", () => { const [q] = parseQuestionImport("1. Chọn màu?\n1) Đỏ\n2) Xanh\n3) Vàng\nĐáp án: 2"); assert.equal(q.options.length, 3); assert.equal(q.options[1].isCorrect, true); });
test("detects Vietnamese Câu 1", () => assert.equal(parseQuestionImport(mc())[0].sourceNumber, "1"));
test("detects English Question 1", () => assert.equal(parseQuestionImport(mc().replace("Câu 1.", "Question 1:"))[0].sourceNumber, "1"));
test("detects Vietnamese answer", () => assert.equal(parseQuestionImport(mc())[0].options[0].isCorrect, true));
test("detects English answer", () => assert.equal(parseQuestionImport(mc().replace("Đáp án: A", "Answer: B"))[0].options[1].isCorrect, true));
test("applies final answer list", () => { const items = parseQuestionImport("1. Một cộng một?\nA. 1\nB. 2\n\n2. Hai cộng hai?\nA. 3\nB. 4\n\nĐáp án\n1-B\n2-B"); assert.equal(items.length, 2); assert.equal(items[1].options[1].isCorrect, true); });
test("missing answer is review without guessing", () => { const [q] = parseQuestionImport(mc().replace("\nĐáp án: A", "")); assert.ok(q.issues.includes("MISSING_CORRECT_ANSWER")); assert.equal(q.options.some((option) => option.isCorrect), false); });
test("supports multiple correct answers", () => { const [q] = parseQuestionImport(mc().replace("Đáp án: A", "Correct: A,C")); assert.deepEqual(q.options.filter((o) => o.isCorrect).map((o) => o.id), ["A", "C"]); });
test("recovers PDF wrapped lines", () => { const [q] = parseQuestionImport("33. Tính toàn vẹn\n(Integrity) đảm bảo\nđiều gì?\nA. Thông tin chỉ\ncó thể sửa bởi\nngười có quyền\nB. Mọi người đều\ncó thể sửa\nĐáp án: A"); assert.match(q.question, /Integrity.*điều gì/u); assert.match(q.options[0].text, /sửa bởi người/u); });
test("normalizes extra blank lines", () => assert.equal(parseQuestionImport(mc().replace(/\n/g, "\n\n\n"))[0].options.length, 4));
test("works without blank lines", () => assert.equal(parseQuestionImport(mc())[0].options.length, 4));
test("parses mixed MCQ and essay", () => { const items = parseQuestionImport(`${mc()}\n2. Trình bày CIA.\nTrả lời: Bí mật, toàn vẹn, sẵn dùng.`); assert.deepEqual(items.map((q) => q.type), ["multiple_choice", "essay"]); });
test("detects duplicate questions", () => { const items = parseQuestionImport(`${mc()}\n2. Tính toàn vẹn đảm bảo điều gì?\nA. X\nB. Y\nĐáp án: A`); assert.ok(items[1].issues.includes("POSSIBLE_DUPLICATE")); });
test("detects empty option after edit", () => { const [q] = parseQuestionImport(mc()); const changed = revalidateParsedQuestion({ ...q, options: q.options.map((o, i) => i ? o : { ...o, text: "" }) }); assert.ok(changed.issues.includes("EMPTY_OPTION")); });
test("detects conflicting answers", () => { const [q] = parseQuestionImport(mc().replace("A. Chỉ", "*A. Chỉ").replace("Đáp án: A", "Đáp án: B")); assert.ok(q.issues.includes("CONFLICTING_ANSWERS")); });
test("parses two-option True/False", () => { const [q] = parseQuestionImport("1. Trái đất tròn?\nA. Đúng\nB. Sai\nĐáp án: A"); assert.equal(q.type, "true_false"); });
test("supports 5+ options", () => { const [q] = parseQuestionImport("1. Chọn?\nA. a\nB. b\nC. c\nD. d\nE. e\nF. f\nAnswer: F"); assert.equal(q.options.length, 6); assert.equal(q.options[5].isCorrect, true); });
test("malformed question becomes error or review", () => { const [q] = parseQuestionImport("1. ?\nA. only"); assert.notEqual(q.status, "ready"); });
test("handles large input", () => { const raw = Array.from({ length: 1500 }, (_, i) => `${i + 1}. Câu hỏi số ${i + 1}?\nA. Đúng\nB. Sai\nĐáp án: A`).join("\n"); const started = Date.now(); const items = parseQuestionImport(raw); assert.equal(items.length, 1500); assert.ok(Date.now() - started < 4000); });
test("normalizes Unicode, whitespace and line endings", () => assert.equal(normalizeQuestionImportText("  Câu\u00a01\r\n\tA.  Test  "), "Câu 1\nA. Test"));
test("parses IELTS Speaking parts", () => { const items = parseQuestionImport("PART 1\nTopic: Hometown\n1. Where is your hometown?\n2. What do you like about it?\nPART 2\nDescribe your hometown.\nYou should say:\n* where it is\n* why you like it"); assert.equal(items[0].type, "speaking"); assert.equal(items.at(-1)?.speakingPart, "part_2"); });
test("supports standalone question numbers", () => { const [q] = parseQuestionImport("1.\nNội dung câu hỏi?\nA. Một\nB. Hai\nĐáp án:\nB"); assert.equal(q.sourceNumber, "1"); assert.equal(q.options[1].isCorrect, true); });
test("supports Q1 marker", () => assert.equal(parseQuestionImport("Q1: Which one?\nA - One\nB - Two\nCorrect option = 1")[0].options[0].isCorrect, true));
test("custom profile applies safe patterns", () => { const [q] = parseQuestionImport("Question No: Custom?\nChoice 1: First\nChoice 2: Second\nSolution: B", { profile: { name: "Custom", questionPattern: "^Question No:\\s*(.*)$", optionPattern: "^Choice\\s*(\\d+)[:.-]\\s*(.*)$", answerPattern: "^Solution:\\s*(.*)$", defaultType: "multiple_choice" } }); assert.equal(q.type, "multiple_choice"); });

test("supports Q marker without punctuation", () => {
  const [q] = parseQuestionImport("Q36 Tính sẵn dùng đảm bảo điều gì\nA Người dùng hợp pháp truy cập khi cần\nB Chỉ quản trị viên\nC Không bao giờ sửa\nD Mọi dữ liệu công khai\nCorrect answer: A");
  assert.equal(q.sourceNumber, "36"); assert.equal(q.options.length, 4); assert.equal(q.options[0].isCorrect, true);
});
test("supports mixed option separators including slash and bare letter", () => {
  const [q] = parseQuestionImport("Câu 35:\nThông tin toàn vẹn khi?\na) Không bị thay đổi\nb) Hợp lệ\nc- Chính xác\nd/ Tất cả ý trên\nĐA A");
  assert.deepEqual(q.options.map((o) => o.id), ["A", "B", "C", "D"]); assert.equal(q.options[0].isCorrect, true);
});
test("supports colon option markers", () => assert.equal(parseQuestionImport("1. Chọn?\nA: Một\nB: Hai\nAnswer: B")[0].options.length, 2));
test("supports circled Unicode option markers", () => {
  const [q] = parseQuestionImport("1. Chọn?\nⒶ Một\nⒷ Hai\nⒸ Ba\nAnswer: C");
  assert.equal(q.options.length, 3); assert.equal(q.options[2].isCorrect, true);
});
test("supports A through Z options", () => {
  const body = Array.from({ length: 26 }, (_, i) => `${String.fromCharCode(65 + i)}. Option ${i + 1}`).join("\n");
  const [q] = parseQuestionImport(`1. Chọn?\n${body}\nAnswer: Z`);
  assert.equal(q.options.length, 26); assert.equal(q.options[25].isCorrect, true);
});
test("standard Vietnamese sample yields two ready questions", () => {
  const items = parseQuestionImport("1. Tính bí mật đảm bảo điều gì?\nA. Chỉ người được phép mới truy cập thông tin\nB. Mọi người có thể sửa dữ liệu\nC. Hệ thống luôn hoạt động\nD. Dữ liệu luôn được sao lưu\nĐáp án: A\n\n2. Tính toàn vẹn đảm bảo điều gì?\nA. Dữ liệu không bị sửa đổi trái phép\nB. Dữ liệu luôn công khai\nC. Mọi người đều được truy cập\nD. Không cần xác thực\nĐáp án: A");
  assert.deepEqual(summarizeParsedQuestions(items), { total: 2, ready: 2, review: 0, errors: 0, duplicates: 0, byType: { multipleChoice: 2, trueFalse: 0, essay: 0, speaking: 0, unknown: 0 } });
});
test("missing answers never guesses a likely answer", () => {
  const items = parseQuestionImport("33. Tính toàn vẹn đảm bảo điều gì?\nA. Chỉ người có thẩm quyền sửa\nB. Mọi người xem\nC. Luôn trực tuyến\nD. Sao lưu\n34. Tính sẵn dùng đảm bảo điều gì?\nA. Người hợp pháp truy nhập khi cần\nB. Chỉ admin\nC. Không thay đổi\nD. Công khai");
  assert.equal(items.length, 2); assert.ok(items.every((q) => q.status === "needs_review" && q.issues.includes("MISSING_CORRECT_ANSWER") && !q.options.some((o) => o.isCorrect)));
});
test("does not need blank lines between questions", () => {
  const raw = ["A", "B", "C"].map((answer, i) => `${i + 1}. ${answer.repeat(3)}?\nA. aa\nB. bb\nC. cc\nD. dd\nĐáp án: ${answer}`).join("\n");
  assert.equal(parseQuestionImport(raw).length, 3);
});
test("preserves wrapped PDF question and option text", () => {
  const [q] = parseQuestionImport("37. Tính bí mật\n(Confidentiality) đảm bảo\nthông tin chỉ được truy cập\nbởi ai?\n\nA. Những người\nđược cấp quyền\ntruy cập\n\nB. Tất cả\nngười dùng\n\nC. Người dùng\nẩn danh\n\nD. Không ai");
  assert.equal(q.question, "Tính bí mật (Confidentiality) đảm bảo thông tin chỉ được truy cập bởi ai?");
  assert.equal(q.options[0].text, "Những người được cấp quyền truy cập");
});
test("parses two essays with sample answer markers", () => {
  const items = parseQuestionImport("1. Trình bày khái niệm tính toàn vẹn.\n\nĐáp án:\nTính toàn vẹn đảm bảo thông tin không bị thay đổi trái phép.\n\n2. Trình bày tính sẵn dùng.\n\nTrả lời:\nTính sẵn dùng đảm bảo người dùng hợp pháp truy cập khi cần.");
  assert.equal(items.length, 2); assert.ok(items.every((q) => q.type === "essay")); assert.match(items[1].answer, /người dùng hợp pháp/u);
});
test("parses essays without sample answers as valid", () => {
  const items = parseQuestionImport("1. Trình bày mô hình Defence in Depth.\n\n2. Phân tích vai trò của lớp chính sách trong Defence in Depth.");
  assert.equal(items.length, 2); assert.ok(items.every((q) => q.type === "essay" && q.status === "ready"));
});
test("classifies mixed MCQ essay and IELTS document", () => {
  const raw = "1. Integrity là gì?\nA. Tính toàn vẹn\nB. Tính bí mật\nC. Tính sẵn dùng\nD. Xác thực\nAnswer: A\n\n2. Trình bày khái niệm Availability.\nĐáp án:\nAvailability đảm bảo dịch vụ sẵn sàng.\n\nPART 1\nTopic: Hometown\n1. Where is your hometown?\n2. What do you like about your hometown?\n\nPART 2\nDescribe a place you like visiting.\nYou should say:\n- where it is\n- when you go there\n- what you do there\n- and explain why you like it";
  const items = parseQuestionImport(raw); const summary = summarizeParsedQuestions(items);
  assert.equal(summary.byType.multipleChoice, 1); assert.equal(summary.byType.essay, 1); assert.equal(summary.byType.speaking, 3); assert.equal(summary.byType.unknown, 0);
});
test("IELTS Part 1 creates separate speaking questions, not numeric options", () => {
  const items = parseQuestionImport("PART 1\nTopic: Home\n1. Do you live in a house or an apartment?\n2. What is your favourite room?\n3. Would you like to move in the future?");
  assert.equal(items.length, 3); assert.ok(items.every((q) => q.type === "speaking" && q.speakingPart === "part_1" && q.topic === "Home" && q.options.length === 0));
});
test("IELTS Part 2 keeps cue-card bullets in one item", () => {
  const items = parseQuestionImport("PART 2\nDescribe a person who helped you.\nYou should say:\n- who the person is\n- when they helped you\n- how they helped you\n- and explain how you felt");
  assert.equal(items.length, 1); assert.equal(items[0].speakingPart, "part_2"); assert.match(items[0].question, /who the person is[\s\S]*how you felt/u);
});
test("IELTS Part 3 creates separate discussion questions", () => {
  const items = parseQuestionImport("PART 3\n1. Why do people help others?\n2. Should schools teach children to help others?\n3. Is helping more common today?");
  assert.equal(items.length, 3); assert.ok(items.every((q) => q.speakingPart === "part_3"));
});
test("empty parsed option is an error", () => {
  const [q] = parseQuestionImport("1. CIA bao gồm?\nA. Confidentiality\nB. Integrity\nC.\nD. Availability\nAnswer: A");
  assert.ok(q.issues.includes("EMPTY_OPTION")); assert.equal(q.status, "error");
});
test("duplicate option marker needs review", () => {
  const [q] = parseQuestionImport("1. Test?\nA. One\nA. Two\nB. Three\nC. Four\nAnswer: A");
  assert.ok(q.issues.includes("DUPLICATE_OPTION_MARKER")); assert.equal(q.status, "needs_review");
});
test("inline second question is split or explicitly flagged", () => {
  const items = parseQuestionImport("1. What is Integrity?\nA. One\nB. Two\nC. Three\nD. Four\n2. What is Availability? A. One B. Two C. Three D. Four");
  assert.ok(items.length === 2 || items[0].issues.includes("POSSIBLE_MERGED_QUESTIONS"));
});
test("invalid final answer list entry does not assign adjacent answer", () => {
  const items = parseQuestionImport("1. AAA?\nA. aa\nB. bb\n2. BBB?\nA. aa\nB. bb\n3. CCC?\nA. aa\nB. bb\nĐÁP ÁN\n1-A\n3-B");
  assert.equal(items[0].options[0].isCorrect, true); assert.ok(items[1].issues.includes("MISSING_CORRECT_ANSWER")); assert.equal(items[2].options[1].isCorrect, true);
});
test("non-contiguous question numbers are metadata only", () => {
  const items = parseQuestionImport("98. First?\nA. Yes\nB. No\nAnswer: A\n99. Second?\nA. Yes\nB. No\nAnswer: A\n101. Third?\nA. Yes\nB. No\nAnswer: A");
  assert.deepEqual(items.map((q) => q.sourceNumber), ["98", "99", "101"]); assert.ok(items.every((q) => q.status === "ready"));
});
test("preserves Vietnamese Unicode and normalizes identity only for comparison", () => {
  const value = "Tính bí mật, Tính toàn vẹn, Xác thực, ủy quyền, mã hóa, dữ liệu";
  assert.equal(normalizeQuestionImportText(value), value); assert.match(normalizeQuestionIdentity(value), /tinh bi mat.*ma hoa.*du lieu/u);
});
test("normalizes Word punctuation and non-breaking spaces without losing Vietnamese", () => {
  assert.equal(normalizeQuestionImportText("“Tính\u00a0toàn vẹn” — đúng\tkhông? •"), '"Tính toàn vẹn" - đúng không? •');
});
test("HTML and scripts remain inert plain text", () => {
  const [q] = parseQuestionImport("1. Test <script>alert('x')</script>?\nA. <b>one</b>\nB. two\nAnswer: A");
  assert.match(q.question, /<script>/u); assert.equal(q.options[0].text, "<b>one</b>");
});
test("does not treat inline ABCD words or versions as options", () => {
  const items = parseQuestionImport('1. Hãy giải thích mô hình ABCD trong bảo mật.\nMô hình gồm A, B, C và D.\n2. Phiên bản A.1 được thay bằng phiên bản B.2.');
  assert.equal(items.length, 2); assert.ok(items.every((q) => q.options.length === 0 && q.type !== "multiple_choice"));
});
test("does not split decimals IP addresses or URLs", () => {
  const [q] = parseQuestionImport("1. Trang nào đúng?\nA. Version 1.2.3 được dùng.\nB. Địa chỉ 192.168.1.1.\nC. https://example.com/a\nD. Giá trị 3.14.\nAnswer: C");
  assert.equal(q.options.length, 4); assert.equal(q.options[1].text, "Địa chỉ 192.168.1.1."); assert.equal(q.options[2].isCorrect, true);
});
test("keeps code lines inside the question", () => {
  const [q] = parseQuestionImport("1. Kết quả đoạn code là gì?\nif (a > b) {\n return a;\n}\nA. a\nB. b\nC. null\nD. error\nAnswer: A");
  assert.match(q.question, /if \(a > b\)[\s\S]*return a;/u); assert.equal(q.options.length, 4);
});
test("quoted option-like phrase inside question is not a marker", () => {
  const [q] = parseQuestionImport('1. Chuỗi "A. Confidentiality" xuất hiện ở đâu?\nA. Trong tài liệu\nB. Trong database\nC. Trong log\nD. Không đâu\nAnswer: A');
  assert.match(q.question, /A\. Confidentiality/u); assert.equal(q.options.length, 4);
});
test("near duplicate ignores case whitespace punctuation and accents", () => {
  const [q] = parseQuestionImport("1.  TÍNH TOÀN VẸN đảm bảo dữ liệu không bị thay đổi trái phép ?\nA. Đúng\nB. Sai", { existingQuestions: [{ id: 42, question: "Tính toàn vẹn đảm bảo dữ liệu không bị thay đổi trái phép." }] });
  assert.equal(q.duplicateOf?.id, 42); assert.ok(q.issues.includes("POSSIBLE_DUPLICATE"));
});
test("supports all documented answer marker variants", () => {
  for (const marker of ["Đáp án A", "ĐA: A", "DA: A", "Answer: A", "Correct: A", "Correct answer: A", "Correct option: A"]) {
    const [q] = parseQuestionImport(`1. Chọn?\nA. Một\nB. Hai\n${marker}`);
    assert.equal(q.options[0].isCorrect, true, marker);
  }
});
test("supports numeric correct option, starred option and checked option", () => {
  const [numeric] = parseQuestionImport("1. Chọn?\nA. Một\nB. Hai\nCorrect option = 2");
  const [starred] = parseQuestionImport("1. Chọn?\n*A. Một\nB. Hai");
  const [checked] = parseQuestionImport("1. Chọn?\nA. [x] Một\nB. [ ] Hai");
  assert.equal(numeric.options[1].isCorrect, true); assert.equal(starred.options[0].isCorrect, true); assert.equal(checked.options[0].isCorrect, true);
});
test("invalid and conflicting answers need review", () => {
  const [invalid] = parseQuestionImport("1. Chọn?\nA. Một\nB. Hai\nAnswer: E");
  const [conflicting] = parseQuestionImport("1. Chọn?\nA. Một\nB. Hai\nĐáp án: A\nAnswer: B");
  assert.ok(invalid.issues.includes("INVALID_CORRECT_ANSWER")); assert.equal(invalid.status, "needs_review");
  assert.ok(conflicting.issues.includes("CONFLICTING_ANSWERS")); assert.equal(conflicting.status, "needs_review");
});
test("option with only one choice is not ready", () => {
  const [q] = parseQuestionImport("1. Integrity nghĩa là gì?\nA. Tính toàn vẹn");
  assert.ok(q.issues.includes("MISSING_OPTIONS")); assert.equal(q.status, "error");
});
test("five thousand questions parse without crashing", () => {
  const raw = Array.from({ length: 5000 }, (_, index) => `${index + 1}. Câu ${index + 1}?\nA. Đúng\nB. Sai\nAnswer: A`).join("\n");
  const started = performance.now(); const items = parseQuestionImport(raw);
  assert.equal(items.length, 5000); assert.ok(performance.now() - started < 5000);
});
test("Import Ready keeps review and error items available", () => {
  const items = parseQuestionImport("1. Ready?\nA. Một\nB. Hai\nAnswer: A\n2. Review?\nA. Một\nB. Hai\n3. Broken?\nA. only");
  const { candidates, remaining } = partitionImportCandidates(items, true);
  assert.equal(candidates.length, 1); assert.equal(remaining.length, 2); assert.ok(remaining.every((item) => item.status !== "ready"));
});
test("source ranges isolate the selected question block", () => {
  const raw = Array.from({ length: 100 }, (_, index) => `${index + 1}. Question ${index + 1}?\nA. Yes\nB. No\nAnswer: A`).join("\n");
  const item = parseQuestionImport(raw)[46]; const lines = normalizeQuestionImportText(raw).split("\n"); const highlighted = lines.slice(item.sourceStart, item.sourceEnd + 1).join("\n");
  assert.match(highlighted, /^47\. Question 47\?/u); assert.doesNotMatch(highlighted, /Question (?:46|48)\?/u);
});
