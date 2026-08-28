"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { toast } from "@/components/Toast";
import { cx } from "@/components/ui";
import { applyAnswerKey, normalizeQuestionImportText, parseQuestionImport, partitionImportCandidates, revalidateParsedQuestion, summarizeParsedQuestions, type ParsedQuestion, type ParsingProfile } from "@/lib/questionImportParser";
import { parseQuestionSpreadsheetRows, safeSpreadsheetCell, spreadsheetOptionId } from "@/lib/questionImportSpreadsheet";

type StoredQuestion = { id: number; question: string; answer?: string; explanation?: string; questionType?: string; options?: string; correctOption?: string | null; correctOptions?: string; difficulty?: string | null; tags?: string; speakingPart?: string | null; topic?: string | null };
type Batch = { id: number; sourceType: string; totalItems: number; successItems: number; reviewItems: number; failedItems: number; status: string; createdAt: string; undoneAt?: string | null };
type ImportMode = "choose" | "paste" | "xlsx" | "review" | "history" | "export";

const ISSUE_LABELS: Record<string, string> = { MISSING_QUESTION: "Thiếu nội dung câu hỏi", MISSING_OPTIONS: "Thiếu lựa chọn", EMPTY_OPTION: "Có lựa chọn trống", INVALID_CORRECT_ANSWER: "Đáp án không hợp lệ", CONFLICTING_ANSWERS: "Các marker đáp án mâu thuẫn", MISSING_CORRECT_ANSWER: "Chưa xác định đáp án đúng", POSSIBLE_DUPLICATE: "Có thể trùng câu hiện tại", POSSIBLE_MERGED_QUESTIONS: "Có thể bị gộp nhiều câu", DUPLICATE_OPTION_MARKER: "Marker lựa chọn bị trùng", DUPLICATE_STABLE_ID: "Stable ID bị trùng trong file", UNKNOWN_TYPE: "Chưa xác định dạng câu" };
const TYPE_LABELS: Record<string, string> = { multiple_choice: "Trắc nghiệm", true_false: "Đúng / Sai", essay: "Tự luận", speaking: "IELTS Speaking", unknown: "Chưa xác định" };

function jsonArray(value?: string) { try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } }
function optionId(index: number) { return spreadsheetOptionId(index); }

export default function QuestionImportExportTools({ category, questions, onChanged }: { category: string; questions: StoredQuestion[]; onChanged: () => Promise<void> | void }) {
  const [mode, setMode] = useState<ImportMode | null>(null);
  const [raw, setRaw] = useState(""); const [parsed, setParsed] = useState<ParsedQuestion[]>([]); const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<"clipboard" | "xlsx">("clipboard"); const [busy, setBusy] = useState(false); const [reviewOnly, setReviewOnly] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]); const [exportMode, setExportMode] = useState<"questions" | "answers" | "full" | "key">("full");
  const [profile, setProfile] = useState<ParsingProfile>({ name: "Default Smart Parser" }); const fileRef = useRef<HTMLInputElement>(null);
  const [importAnywayIds, setImportAnywayIds] = useState<Set<string>>(new Set());
  const [previewPage, setPreviewPage] = useState(0);
  const [answerKeyOpen, setAnswerKeyOpen] = useState(false); const [answerKeyRaw, setAnswerKeyRaw] = useState(""); const [autoNext, setAutoNext] = useState(true);
  const summary = useMemo(() => summarizeParsedQuestions(parsed), [parsed]);
  const shown = useMemo(() => reviewOnly ? parsed.filter((item) => item.status !== "ready") : parsed, [parsed, reviewOnly]);
  const previewPageSize = 100;
  const previewPageCount = Math.max(1, Math.ceil(shown.length / previewPageSize));
  const shownPage = useMemo(() => shown.slice(previewPage * previewPageSize, (previewPage + 1) * previewPageSize), [shown, previewPage]);
  const selected = shown.find((item) => item.clientId === selectedId) || shown[0] || null;
  const selectedShownIndex = selected ? shown.findIndex((item) => item.clientId === selected.clientId) : -1;

  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(shown.length / previewPageSize) - 1);
    if (previewPage > lastPage) setPreviewPage(lastPage);
    if (!shown.length) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!shown.some((item) => item.clientId === selectedId)) {
      const fallbackIndex = Math.min(previewPage * previewPageSize, shown.length - 1);
      setSelectedId(shown[fallbackIndex].clientId);
    }
  }, [previewPage, selectedId, shown]);

  function selectReviewQuestion(item: ParsedQuestion) {
    const index = shown.findIndex((candidate) => candidate.clientId === item.clientId);
    if (index < 0) return;
    setSelectedId(item.clientId);
    setPreviewPage(Math.floor(index / previewPageSize));
  }

  function close() { if (!busy) { setMode(null); setParsed([]); setSelectedId(null); setRaw(""); setPreviewPage(0); setAnswerKeyOpen(false); setAnswerKeyRaw(""); } }
  function runParser(text = raw) {
    if (!text.trim()) return toast("Hãy dán nội dung cần phân tích."); setBusy(true); setSourceType("clipboard");
    window.setTimeout(() => { try { const items = parseQuestionImport(text, { profile, existingQuestions: questions }); setParsed(items); setSelectedId(items[0]?.clientId || null); setPreviewPage(0); setMode("review"); if (!items.length) toast("Không nhận dạng được câu hỏi nào. Hãy kiểm tra nội dung hoặc parsing profile."); } finally { setBusy(false); } }, 20);
  }
  async function pasteClipboard() { try { const text = await navigator.clipboard.readText(); setRaw(text); toast("Đã dán nội dung từ clipboard."); } catch { toast("Trình duyệt không cho phép đọc clipboard. Bạn vẫn có thể nhấn Ctrl+V/Cmd+V trong ô nhập."); } }

  function parseWorkbook(file: File) {
    if (!/\.xlsx$/i.test(file.name) || file.size > 15 * 1024 * 1024) return toast("Chỉ nhận file .xlsx tối đa 15 MB.");
    setBusy(true); setSourceType("xlsx");
    void import("xlsx").then(async (XLSX) => {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" }); const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const finalItems = parseQuestionSpreadsheetRows(rows, questions);
      setParsed(finalItems); setSelectedId(finalItems[0]?.clientId || null); setPreviewPage(0); setMode("review");
    }).catch(() => toast("Không thể đọc file Excel.")).finally(() => setBusy(false));
  }

  function updateSelected(update: Partial<ParsedQuestion>) { if (!selected) return; setParsed((items) => items.map((item) => item.clientId === selected.clientId ? revalidateParsedQuestion({ ...item, ...update }) : item)); }
  useEffect(() => {
    if (mode !== "review" || !selected || (selected.type !== "multiple_choice" && selected.type !== "true_false")) return;
    function onAnswerShortcut(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, [contenteditable='true']")) return;
      const key = event.key.toUpperCase(); const option = /^\d$/.test(key) ? selected!.options[Number(key) - 1] : selected!.options.find((candidate) => candidate.id === key);
      if (!option) return;
      event.preventDefault();
      setParsed((items) => items.map((item) => item.clientId === selected!.clientId ? revalidateParsedQuestion({ ...item, detectedAnswer: option.id, answerKeyAnswer: undefined, issues: item.issues.filter((issue) => issue !== "CONFLICTING_ANSWERS" && issue !== "INVALID_CORRECT_ANSWER"), options: item.options.map((candidate) => ({ ...candidate, isCorrect: candidate.id === option.id })) }) : item));
      if (autoNext && !reviewOnly && selectedShownIndex >= 0 && selectedShownIndex < shown.length - 1) selectReviewQuestion(shown[selectedShownIndex + 1]);
    }
    window.addEventListener("keydown", onAnswerShortcut); return () => window.removeEventListener("keydown", onAnswerShortcut);
  }, [autoNext, mode, reviewOnly, selected, selectedShownIndex, shown]);
  function applyPastedAnswerKey() {
    if (!answerKeyRaw.trim()) return toast("Hãy nhập bảng đáp án.");
    const result = applyAnswerKey(parsed, answerKeyRaw); setParsed(result.items); setAnswerKeyOpen(false);
    const parts = [`Đã áp dụng ${result.applied} đáp án`]; if (result.conflicts) parts.push(`${result.conflicts} xung đột cần xử lý`); if (result.invalid) parts.push(`${result.invalid} đáp án không hợp lệ`); if (result.unmatched) parts.push(`${result.unmatched} số câu không khớp`); toast(`${parts.join("; ")}.`);
  }
  async function importReadyItems() {
    const { candidates, remaining } = partitionImportCandidates(parsed, true); if (!candidates.length) return toast("Chưa có câu READY để import.");
    const selectedCandidates = candidates.filter((item) => !item.issues.includes("POSSIBLE_DUPLICATE") || importAnywayIds.has(item.clientId));
    const skippedInPreview = candidates.length - selectedCandidates.length;
    if (!selectedCandidates.length) return toast("Các câu đã chọn đều đang được đặt là Skip vì có thể trùng.");
    setBusy(true); try {
      const response = await fetch("/api/admin/category-questions/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, sourceType, items: selectedCandidates.map((item) => ({ question: item.question, questionType: item.type, options: item.options.map((option) => option.text), correctOptions: item.options.filter((option) => option.isCorrect).map((option) => option.id), answer: item.answer, explanation: item.explanation, difficulty: item.difficulty || null, tags: item.tags, speakingPart: item.speakingPart || null, topic: item.topic || null, status: item.status, duplicateAction: "import" })) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Không thể import.");
      const skippedDuplicates = skippedInPreview + Number(data.skippedDuplicates || 0);
      toast(`Đã import ${data.imported} câu${skippedDuplicates ? `; bỏ qua ${skippedDuplicates} câu trùng` : ""}.`); await onChanged();
      if (remaining.length) { setParsed(remaining); setSelectedId(remaining[0]?.clientId || null); setReviewOnly(true); setPreviewPage(0); }
      else close();
    } catch (error) { toast(error instanceof Error ? error.message : "Không thể import câu hỏi."); } finally { setBusy(false); }
  }

  async function loadBatches() { setBusy(true); try { const response = await fetch(`/api/admin/category-questions/batches?category=${encodeURIComponent(category)}`); const data = await response.json(); if (!response.ok) throw new Error(); setBatches(data.batches || []); setMode("history"); } catch { toast("Không thể tải lịch sử import."); } finally { setBusy(false); } }
  async function undo(batch: Batch) { if (!confirm(`Hoàn tác toàn bộ import #IMP-${batch.id} (${batch.successItems} câu)? Chỉ câu thuộc batch này bị xóa.`)) return; setBusy(true); try { const response = await fetch(`/api/admin/category-questions/batches/${batch.id}`, { method: "DELETE" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); toast(`Đã hoàn tác ${data.deleted} câu.`); await Promise.all([onChanged(), loadBatches()]); } catch (error) { toast(error instanceof Error ? error.message : "Không thể hoàn tác import."); } finally { setBusy(false); } }

  function downloadTemplate() { void import("xlsx").then((XLSX) => { const sheet = XLSX.utils.json_to_sheet([{ question_number: 1, type: "multiple_choice", question: "Nội dung câu hỏi", option_a: "Lựa chọn A", option_b: "Lựa chọn B", option_c: "", option_d: "", option_e: "", correct_answer: "A", answer: "", explanation: "Giải thích", difficulty: "medium", tags: "tag1, tag2", speaking_part: "", topic: "" }]); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Questions"); XLSX.writeFile(book, "question-import-template.xlsx"); }); }
  function exportExcel(modeValue = exportMode) { void import("xlsx").then((XLSX) => { const rows = questions.map((question, index) => { const options = jsonArray(question.options); const correct = jsonArray(question.correctOptions); const base: Record<string, unknown> = { id: question.id, question_number: index + 1, type: question.questionType, question: safeSpreadsheetCell(question.question) }; options.forEach((option, i) => { base[`option_${optionId(i).toLowerCase()}`] = safeSpreadsheetCell(option); }); if (modeValue !== "questions") { base.correct_answer = correct.length ? correct.join(",") : question.correctOption || ""; base.answer = safeSpreadsheetCell(question.answer); } if (modeValue === "full") { base.explanation = safeSpreadsheetCell(question.explanation); base.difficulty = question.difficulty || ""; base.tags = safeSpreadsheetCell(jsonArray(question.tags).join(", ")); base.speaking_part = question.speakingPart || ""; base.topic = safeSpreadsheetCell(question.topic); } return base; }); const sheet = XLSX.utils.json_to_sheet(rows); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Questions"); XLSX.writeFile(book, `${category.replace(/[\\/:*?"<>|]/g, "-")}-questions.xlsx`); close(); }); }
  function exportPdf() { void Promise.all([import("pdfmake/build/pdfmake"), import("pdfmake/build/vfs_fonts")]).then(([{ default: pdfMake }, { default: pdfFonts }]) => { pdfMake.vfs = pdfFonts.pdfMake?.vfs || pdfFonts.vfs || pdfFonts; const content: any[] = [{ text: category, fontSize: 18, bold: true, margin: [0, 0, 0, 12] }]; questions.forEach((question, index) => { const opts = jsonArray(question.options); const correct = jsonArray(question.correctOptions); if (exportMode === "key") { content.push({ text: `${index + 1}. ${correct.join(", ") || question.correctOption || "—"}`, margin: [0, 0, 0, 4] }); return; } content.push({ text: `${index + 1}. ${question.question}`, bold: true, margin: [0, 6, 0, 3] }); if (question.questionType === "multiple_choice") opts.forEach((option, i) => content.push({ text: `   ${optionId(i)}. ${option}`, margin: [0, 0, 0, 2] })); if (exportMode !== "questions") content.push({ text: `Đáp án: ${correct.join(", ") || question.correctOption || question.answer || "—"}`, color: "#277A4B", margin: [0, 3, 0, 2] }); if (exportMode === "full" && question.explanation) content.push({ text: `Giải thích: ${question.explanation}`, italics: true, color: "#555", margin: [0, 0, 0, 3] }); }); pdfMake.createPdf({ pageSize: "A4", pageMargins: [38, 42, 38, 42], content, defaultStyle: { font: "Roboto", fontSize: 10 }, footer: (page: number, pages: number) => ({ text: `${page}/${pages}`, alignment: "center", fontSize: 8 }) }).download(`${category.replace(/[\\/:*?"<>|]/g, "-")}-questions.pdf`); close(); }); }

  return <>
    <div className="flex flex-wrap gap-2"><button className={`${cx.btn} ${cx.btnGold} !min-h-9 !px-3`} onClick={() => setMode("choose")}>Import</button><button className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3`} onClick={() => setMode("export")}>Export</button><button className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3`} onClick={() => void loadBatches()}>Lịch sử import</button></div>
    {mode && <Modal title={mode === "review" ? "Preview & Needs Review" : mode === "history" ? "Lịch sử import" : mode === "export" ? "Export câu hỏi" : "Smart Bulk Import"} onClose={close} wide closeOnBackdrop={false} fillViewport={mode === "review"} bodyClassName={mode === "review" ? "flex flex-col overflow-hidden" : "overflow-y-auto p-5"}>
      {mode === "choose" && <div className="grid gap-3 sm:grid-cols-2"><button className="rounded-xl border border-line p-5 text-left hover:border-[#7865EE]" onClick={() => setMode("paste")}><b>Smart Paste</b><span className="mt-1 block text-sm text-muted">Dán từ PDF, Word, website, OCR hoặc ChatGPT.</span></button><button className="rounded-xl border border-line p-5 text-left hover:border-[#7865EE]" onClick={() => setMode("xlsx")}><b>Import Excel</b><span className="mt-1 block text-sm text-muted">Upload .xlsx, sau đó preview và sửa trước khi import.</span></button></div>}
      {mode === "paste" && <div><div className="mb-3 flex flex-wrap gap-2"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => void pasteClipboard()}>Dán từ clipboard</button><details className="flex-1 rounded-lg border border-line p-2"><summary className="cursor-pointer text-xs font-bold">Parsing profile / Apply pattern</summary><div className="mt-2 grid gap-2 sm:grid-cols-2"><input className={`${cx.input} !mb-0`} placeholder="Tên profile" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /><select className={`${cx.input} !mb-0`} value={profile.defaultType || ""} onChange={(event) => setProfile({ ...profile, defaultType: (event.target.value || undefined) as ParsingProfile["defaultType"] })}><option value="">Tự nhận dạng type</option><option value="multiple_choice">Trắc nghiệm</option><option value="essay">Tự luận</option><option value="speaking">Speaking</option></select><input className={`${cx.input} !mb-0`} placeholder="Question regex (tùy chọn)" value={profile.questionPattern || ""} onChange={(event) => setProfile({ ...profile, questionPattern: event.target.value || undefined })} /><input className={`${cx.input} !mb-0`} placeholder="Option regex (tùy chọn)" value={profile.optionPattern || ""} onChange={(event) => setProfile({ ...profile, optionPattern: event.target.value || undefined })} /><button className={`${cx.btn} ${cx.btnGhost} sm:col-span-2`} onClick={() => void fetch("/api/admin/category-questions/profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: profile.name, config: profile }) }).then((response) => response.ok ? toast("Đã lưu parsing profile.") : toast("Không thể lưu profile."))}>Lưu profile này</button></div></details></div><textarea autoFocus spellCheck={false} className={`${cx.input} !mb-3 min-h-[360px] font-mono text-xs`} value={raw} onChange={(event) => setRaw(event.target.value)} placeholder="Dán nguyên văn nội dung vào đây. Không cần chỉnh về format cố định…" /><button disabled={busy || !raw.trim()} className={`${cx.btn} ${cx.btnGold} w-full`} onClick={() => runParser()}>{busy ? "Đang phân tích…" : "Phân tích và Preview"}</button></div>}
      {mode === "xlsx" && <div className="text-center"><input ref={fileRef} className="sr-only" type="file" accept=".xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) parseWorkbook(file); }} /><button className="w-full rounded-xl border-2 border-dashed border-[#CFC7FF] p-10 text-sm font-bold hover:bg-[#F8F7FF]" onClick={() => fileRef.current?.click()}>{busy ? "Đang đọc Excel…" : "Chọn file .xlsx (tối đa 15 MB)"}</button><button className="mt-3 text-xs font-bold text-[#6550DB] hover:underline" onClick={downloadTemplate}>Tải file Excel mẫu</button></div>}
      {mode === "review" && <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-line px-4 py-3 sm:px-5">
          <div className="grid grid-flow-col auto-cols-[minmax(6rem,1fr)] gap-2 overflow-x-auto sm:grid-flow-row sm:grid-cols-5"><Stat label="Detected" value={summary.total} /><Stat label="Ready" value={summary.ready} good /><Stat label="Needs review" value={summary.review} warn /><Stat label="Duplicates" value={summary.duplicates} /><Stat label="Errors" value={summary.errors} bad /></div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"><span>MCQ: {summary.byType.multipleChoice}</span><span>True/False: {summary.byType.trueFalse}</span><span>Essay: {summary.byType.essay}</span><span>Speaking: {summary.byType.speaking}</span><span>Unknown: {summary.byType.unknown}</span><span className="font-bold text-green-700">Cấu trúc hợp lệ: {summary.structurallyValid}</span><button type="button" className="font-bold text-[#6550DB] hover:underline" onClick={() => setAnswerKeyOpen(true)}>Nhập bảng đáp án</button><label className="ml-auto flex items-center gap-1"><input type="checkbox" checked={reviewOnly} onChange={(event) => { const enabled = event.target.checked; const nextShown = enabled ? parsed.filter((item) => item.status !== "ready") : parsed; setReviewOnly(enabled); setPreviewPage(0); setSelectedId(nextShown[0]?.clientId || null); }} /> Chỉ hiện Needs Review/Error</label></div>
          {summary.review > 0 && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-amber-50 px-2 py-1.5 text-[0.7rem] text-amber-900"><b>Lý do cần review:</b>{summary.reasons.missingCorrectAnswer > 0 && <span>Chưa có đáp án đúng: {summary.reasons.missingCorrectAnswer}</span>}{summary.reasons.conflictingAnswers > 0 && <span>Đáp án xung đột: {summary.reasons.conflictingAnswers}</span>}{summary.reasons.invalidAnswers > 0 && <span>Đáp án không hợp lệ: {summary.reasons.invalidAnswers}</span>}{summary.reasons.invalidOptions > 0 && <span>Options không hợp lệ: {summary.reasons.invalidOptions}</span>}{summary.reasons.ambiguousStructure > 0 && <span>Cấu trúc mơ hồ: {summary.reasons.ambiguousStructure}</span>}</div>}
        </div>
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 overflow-hidden p-3 sm:grid-cols-[0.8fr_1.2fr] sm:grid-rows-1 sm:p-4">
          <div data-source-scroll className="min-h-0 overflow-y-auto overscroll-contain rounded-xl border border-line bg-[#FBFAFE] p-3" aria-label="Nội dung nguồn"><SourcePreview raw={sourceType === "clipboard" ? raw : selected?.raw || ""} selected={selected} /></div>
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <QuestionNavigation items={shownPage} selectedId={selected?.clientId || null} startIndex={previewPage * previewPageSize} page={previewPage} pageCount={previewPageCount} onSelect={selectReviewQuestion} onPageChange={(page) => { setPreviewPage(page); setSelectedId(shown[page * previewPageSize]?.clientId || null); }} />
            <div className="mb-2 flex shrink-0 items-center justify-between gap-2 rounded-lg border border-line bg-white px-2 py-1.5" aria-label="Điều hướng câu hỏi">
              <button type="button" className={`${cx.btn} ${cx.btnGhost} !min-h-8 !px-2`} disabled={selectedShownIndex <= 0} onClick={() => selectReviewQuestion(shown[selectedShownIndex - 1])}>← Câu trước</button>
              <span className="text-xs font-bold">Câu {selectedShownIndex >= 0 ? selectedShownIndex + 1 : 0} / {shown.length}</span>
              <button type="button" className={`${cx.btn} ${cx.btnGhost} !min-h-8 !px-2`} disabled={selectedShownIndex < 0 || selectedShownIndex >= shown.length - 1} onClick={() => selectReviewQuestion(shown[selectedShownIndex + 1])}>Câu tiếp →</button>
            </div>
            <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 text-[0.7rem] text-muted"><span>Phím tắt đáp án: A–Z hoặc 1–9 (khi không nhập text)</span><label className="ml-auto flex items-center gap-1"><input type="checkbox" checked={autoNext} onChange={(event) => setAutoNext(event.target.checked)} /> Tự sang câu tiếp</label></div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" aria-label="Trình chỉnh sửa câu hỏi">{selected && <QuestionEditor item={selected} onChange={updateSelected} importAnyway={importAnywayIds.has(selected.clientId)} onImportAnyway={(enabled) => { setImportAnywayIds((current) => { const next = new Set(current); if (enabled) next.add(selected.clientId); else next.delete(selected.clientId); return next; }); setParsed((items) => items.map((item) => item.clientId === selected.clientId ? revalidateParsedQuestion({ ...item, issues: enabled ? item.issues.filter((issue) => issue !== "POSSIBLE_DUPLICATE") : [...item.issues, "POSSIBLE_DUPLICATE"] }) : item)); }} />}</div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-white px-4 py-3 sm:px-5"><button type="button" className={`${cx.btn} ${cx.btnGhost}`} onClick={close}>Hủy</button>{summary.review + summary.errors > 0 && <button type="button" className={`${cx.btn} ${cx.btnGhost}`} onClick={() => { const nextShown = parsed.filter((item) => item.status !== "ready"); setReviewOnly(true); setPreviewPage(0); setSelectedId(nextShown[0]?.clientId || null); }}>Giải quyết {summary.review + summary.errors} câu cần review</button>}<button disabled={busy || !summary.ready} className={`${cx.btn} ${cx.btnGold}`} onClick={() => void importReadyItems()}>Import Ready ({summary.ready})</button></div>
      </div>}
      {mode === "history" && <div className="space-y-2">{!batches.length ? <p className={cx.empty}>Chưa có batch import.</p> : batches.map((batch) => <div key={batch.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3"><div className="min-w-0 flex-1"><b className="text-sm">#IMP-{batch.id} · {batch.successItems} câu</b><p className="mt-1 text-xs text-muted">{batch.sourceType} · {new Date(batch.createdAt).toLocaleString("vi-VN")} · {batch.status}</p></div>{batch.status !== "undone" && <button disabled={busy} className={`${cx.btn} ${cx.btnDanger} !min-h-9 !px-3`} onClick={() => void undo(batch)}>Undo Import</button>}</div>)}</div>}
      {mode === "export" && <div><label className={cx.label}>Nội dung export</label><select className={cx.input} value={exportMode} onChange={(event) => setExportMode(event.target.value as typeof exportMode)}><option value="questions">Chỉ câu hỏi</option><option value="answers">Câu hỏi + đáp án</option><option value="full">Câu hỏi + đáp án + giải thích</option><option value="key">Answer key</option></select><div className="grid gap-3 sm:grid-cols-2"><button className={`${cx.btn} ${cx.btnGold}`} onClick={() => exportExcel()}>Xuất Excel</button><button className={`${cx.btn} ${cx.btnGhost}`} onClick={exportPdf}>Xuất PDF A4</button></div><p className="mt-3 text-xs text-muted">Excel bao gồm stable ID. PDF được tạo trực tiếp bằng pdfmake, không chụp màn hình.</p></div>}
    </Modal>}
    {answerKeyOpen && <Modal title="Nhập bảng đáp án" onClose={() => setAnswerKeyOpen(false)} closeOnBackdrop={false}><p className="mb-3 text-sm text-muted">Paste dạng <b>1-A, 2-B</b>, <b>1. A</b>, <b>1A 2B</b> hoặc danh sách tuần tự <b>A B C D</b>. Hệ thống chỉ map đáp án, không tự giải câu hỏi.</p><textarea autoFocus spellCheck={false} className={`${cx.input} !mb-3 min-h-48 font-mono`} value={answerKeyRaw} onChange={(event) => setAnswerKeyRaw(event.target.value)} placeholder={"1-A\n2-B\n3-C"} /><div className="flex justify-end gap-2"><button type="button" className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setAnswerKeyOpen(false)}>Hủy</button><button type="button" disabled={!answerKeyRaw.trim()} className={`${cx.btn} ${cx.btnGold}`} onClick={applyPastedAnswerKey}>Áp dụng bảng đáp án</button></div></Modal>}
  </>;
}

function Stat({ label, value, good, warn, bad }: { label: string; value: number; good?: boolean; warn?: boolean; bad?: boolean }) { return <div className={`rounded-lg border p-2 text-center ${good ? "border-green-200 bg-green-50" : warn ? "border-amber-200 bg-amber-50" : bad ? "border-red-200 bg-red-50" : "border-line bg-white"}`}><b className="block text-lg">{value}</b><span className="text-[0.65rem] text-muted">{label}</span></div>; }

export function QuestionNavigation({ items, selectedId, startIndex, page, pageCount, onSelect, onPageChange }: { items: ParsedQuestion[]; selectedId: string | null; startIndex: number; page: number; pageCount: number; onSelect: (item: ParsedQuestion) => void; onPageChange: (page: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (!selectedId) return;
    const container = containerRef.current; const button = itemRefs.current.get(selectedId);
    if (!container || !button) return;
    const containerRect = container.getBoundingClientRect(); const buttonRect = button.getBoundingClientRect();
    if (buttonRect.top < containerRect.top) container.scrollBy({ top: buttonRect.top - containerRect.top - 4, behavior: "smooth" });
    else if (buttonRect.bottom > containerRect.bottom) container.scrollBy({ top: buttonRect.bottom - containerRect.bottom + 4, behavior: "smooth" });
  }, [selectedId, items]);
  return <div className="mb-2 shrink-0 overflow-hidden rounded-lg border border-line bg-white">
    <div ref={containerRef} className="flex max-h-24 flex-wrap gap-1 overflow-y-auto overscroll-contain p-2" aria-label="Danh sách câu hỏi">{items.map((item, index) => <button ref={(element) => { if (element) itemRefs.current.set(item.clientId, element); else itemRefs.current.delete(item.clientId); }} type="button" key={item.clientId} aria-current={selectedId === item.clientId ? "true" : undefined} aria-label={`Câu ${startIndex + index + 1}`} title={item.issues.length ? item.issues.map((issue) => ISSUE_LABELS[issue] || issue).join("; ") : "READY"} onClick={() => onSelect(item)} className={`h-8 min-w-8 rounded-md px-2 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6550DB] ${selectedId === item.clientId ? "bg-[#7865EE] text-white" : item.status === "ready" ? "bg-green-100 text-green-700" : item.status === "error" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{startIndex + index + 1}</button>)}</div>
    {pageCount > 1 && <div className="flex items-center justify-center gap-2 border-t border-line px-2 py-1"><button type="button" className={`${cx.btn} ${cx.btnGhost} !min-h-8 !px-2`} disabled={page === 0} onClick={() => onPageChange(Math.max(0, page - 1))}>← 100 câu</button><span className="text-xs">Trang {page + 1}/{pageCount}</span><button type="button" className={`${cx.btn} ${cx.btnGhost} !min-h-8 !px-2`} disabled={page + 1 >= pageCount} onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}>100 câu →</button></div>}
  </div>;
}

function QuestionEditor({ item, onChange, importAnyway, onImportAnyway }: { item: ParsedQuestion; onChange: (update: Partial<ParsedQuestion>) => void; importAnyway: boolean; onImportAnyway: (enabled: boolean) => void }) {
  return <div className="space-y-2 rounded-xl border border-line bg-white p-3"><div className="flex items-center justify-between gap-2"><select className={`${cx.input} !mb-0 !w-auto`} value={item.type} onChange={(event) => onChange({ type: event.target.value as ParsedQuestion["type"] })}>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="text-xs font-bold">Parse Confidence {Math.round(item.confidence * 100)}%</span></div><textarea className={`${cx.input} !mb-0 min-h-24`} value={item.question} onChange={(event) => onChange({ question: event.target.value })} />
    {(item.type === "multiple_choice" || item.type === "true_false") && <div className="space-y-1.5"><p className="text-[0.7rem] text-muted">Có thể chọn nhiều đáp án đúng. Phím tắt sẽ chọn một đáp án.</p>{item.options.map((option, index) => <div key={`${option.id}-${index}`} className="flex items-center gap-2"><input type="checkbox" checked={option.isCorrect} aria-label={`Đáp án đúng ${option.id}`} onChange={(event) => onChange({ detectedAnswer: undefined, answerKeyAnswer: undefined, issues: item.issues.filter((issue) => issue !== "CONFLICTING_ANSWERS" && issue !== "INVALID_CORRECT_ANSWER"), options: item.options.map((value, i) => i === index ? { ...value, isCorrect: event.target.checked } : value) })} /><b className="w-5 text-xs">{option.id}</b><input className={`${cx.input} !mb-0 flex-1`} value={option.text} onChange={(event) => onChange({ options: item.options.map((value, i) => i === index ? { ...value, text: event.target.value } : value) })} /><button aria-label={`Xóa lựa chọn ${option.id}`} className="px-2 text-bad" onClick={() => onChange({ options: item.options.filter((_, i) => i !== index).map((value, i) => ({ ...value, id: optionId(i) })) })}>×</button></div>)}{item.options.length < 26 && <button className="text-xs font-bold text-[#6550DB]" onClick={() => onChange({ options: [...item.options, { id: optionId(item.options.length), text: "", isCorrect: false }] })}>+ Thêm lựa chọn</button>}</div>}
    {(item.type === "essay" || item.type === "speaking") && <textarea className={`${cx.input} !mb-0 min-h-24`} placeholder="Đáp án mẫu" value={item.answer} onChange={(event) => onChange({ answer: event.target.value })} />}
    <textarea className={`${cx.input} !mb-0 min-h-16`} placeholder="Giải thích" value={item.explanation} onChange={(event) => onChange({ explanation: event.target.value })} /><div className="grid gap-2 sm:grid-cols-2"><select className={`${cx.input} !mb-0`} value={item.difficulty} onChange={(event) => onChange({ difficulty: event.target.value as ParsedQuestion["difficulty"] })}><option value="">Chưa đặt độ khó</option><option value="easy">Dễ</option><option value="medium">Trung bình</option><option value="hard">Khó</option></select><input className={`${cx.input} !mb-0`} placeholder="tags, cách nhau bằng dấu phẩy" value={item.tags.join(", ")} onChange={(event) => onChange({ tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} /></div>{item.issues.length > 0 && <div className="flex flex-wrap gap-1">{item.issues.map((issue) => <span key={issue} className="rounded-full bg-amber-100 px-2 py-1 text-[0.65rem] font-bold text-amber-800">{ISSUE_LABELS[issue] || issue}</span>)}</div>}{item.issues.includes("CONFLICTING_ANSWERS") && item.answerKeyAnswer && <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs"><b>Đáp án xung đột</b><p className="mt-1">Đáp án hiện có: {item.detectedAnswer || item.options.filter((option) => option.isCorrect).map((option) => option.id).join(", ") || "—"}</p><p>Bảng đáp án: {item.answerKeyAnswer}</p><div className="mt-2 flex gap-2"><button type="button" className={`${cx.btn} ${cx.btnGhost} !min-h-8 !px-2`} onClick={() => onChange({ answerKeyAnswer: undefined, issues: item.issues.filter((issue) => issue !== "CONFLICTING_ANSWERS") })}>Giữ đáp án hiện có</button><button type="button" className={`${cx.btn} ${cx.btnGold} !min-h-8 !px-2`} onClick={() => { const ids = item.answerKeyAnswer!.split(","); onChange({ detectedAnswer: item.answerKeyAnswer, answerKeyAnswer: undefined, issues: item.issues.filter((issue) => issue !== "CONFLICTING_ANSWERS" && issue !== "INVALID_CORRECT_ANSWER"), options: item.options.map((option) => ({ ...option, isCorrect: ids.includes(option.id) })) }); }}>Dùng bảng đáp án</button></div></div>}{item.duplicateOf && <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs"><b>Possible duplicate · {Math.round(item.duplicateOf.similarity * 100)}%</b><p className="mt-1">Existing: {item.duplicateOf.question}</p><label className="mt-2 flex items-center gap-2 font-bold"><input type="checkbox" checked={importAnyway} onChange={(event) => onImportAnyway(event.target.checked)} /> Import anyway</label></div>}</div>;
}

export function SourcePreview({ raw, selected }: { raw: string; selected: ParsedQuestion | null }) {
  const lines = normalizeQuestionImportText(raw).split("\n"); const selectedRef = useRef<HTMLElement>(null);
  const start = selected ? Math.min(lines.length - 1, Math.max(0, selected.sourceStart)) : -1; const end = selected ? Math.max(start, Math.min(lines.length - 1, selected.sourceEnd)) : -1;
  const before = start >= 0 ? lines.slice(0, start).join("\n") : lines.join("\n"); const highlighted = start >= 0 ? lines.slice(start, end + 1).join("\n") : ""; const after = start >= 0 ? lines.slice(end + 1).join("\n") : "";
  useEffect(() => { const mark = selectedRef.current; const container = mark?.closest<HTMLElement>("[data-source-scroll]"); if (!mark || !container) return; const containerRect = container.getBoundingClientRect(); const markRect = mark.getBoundingClientRect(); const targetOffset = markRect.top - containerRect.top - (containerRect.height - markRect.height) / 2; container.scrollBy({ top: targetOffset, behavior: "smooth" }); }, [selected?.clientId]);
  return <pre className="whitespace-pre-wrap text-xs leading-5"><span>{before}{before && highlighted ? "\n" : ""}</span>{highlighted && <mark ref={selectedRef} className="bg-amber-200">{highlighted}</mark>}<span>{highlighted && after ? "\n" : ""}{after}</span></pre>;
}
