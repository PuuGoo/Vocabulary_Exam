"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";
import Modal from "@/components/Modal";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import DocumentPreview from "@/components/DocumentPreview";
import { compareDocumentsByFolderThenName, formatAggregatedDocumentName } from "@/lib/documentDisplay";
import { SUPPORTED_DOCUMENT_ACCEPT, documentKind, isSupportedDocument } from "@/lib/categoryDocumentFile";
import QuestionImportExportTools from "@/components/QuestionImportExportTools";
import ShareDialog from "@/components/ShareDialog";
import { safeSpreadsheetCell } from "@/lib/questionImportSpreadsheet";
import { correctAnswerDistribution, DEFAULT_QUESTION_SHUFFLE_SETTINGS, optionLetter, planPermanentOptionShuffle, type PermanentShufflePlan, type QuestionShuffleMode, type QuestionShuffleSettings, type ShuffleQuestion } from "@/lib/questionShuffle";

type SetSummary = { id: number; name: string; category: string | null; type: string; count: number; classId: number | null; className: string | null };
type Word = {
  id: number;
  meaning: string;
  v1?: string | null;
  v2?: string | null;
  v3?: string | null;
  ipaV1?: string | null;
  ipaV2?: string | null;
  ipaV3?: string | null;
  term?: string | null;
  example?: string | null;
  wtype?: string | null;
  ipa?: string | null;
};
type SetDetail = SetSummary & { words: Word[] };
type WordMatch = {
  wordId: number;
  setId: number;
  setName: string;
  category: string | null;
  setType: string;
  term: string | null;
  meaning: string;
  v1: string | null;
  v2: string | null;
  v3: string | null;
  ipa: string | null;
  ipaV1: string | null;
  ipaV2: string | null;
  ipaV3: string | null;
};
type ClassOpt = { id: number; name: string };
type CategorySummary = { id: number; name: string; count: number };
type CategoryDocument = { id: number; category: string; title: string; fileName: string; fileType: string; fileSize: number; createdAt: string };
type VisibleCategoryDocument = CategoryDocument & { displayTitle: string; displayFileName: string; aggregateOrder: number | null };
type DocumentSort = "newest" | "oldest" | "name" | "size";
type SetWorkspaceTab = "overview" | "vocabulary" | "questions" | "documents" | "settings";
type QuestionType = "speaking" | "multiple_choice" | "essay";
type AdminShuffleQuestion = ShuffleQuestion & { questionText: string };
type OptionShufflePreview = { mode: QuestionShuffleMode; questions: AdminShuffleQuestion[]; plans: PermanentShufflePlan[] };
const ALL_CATEGORIES = "__all__";
const UNCATEGORIZED = "__uncategorized__";
const SPELL_CHECK_KEY = "lexora-vietnamese-spell-check";

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function toShuffleQuestion(question: any): AdminShuffleQuestion {
  const parse = (value: unknown) => { if (Array.isArray(value)) return value.map(String); try { const parsed = JSON.parse(String(value || "[]")); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } };
  return { id: Number(question.id), questionText: String(question.question || ""), options: parse(question.options), correctOption: question.correctOption || null, correctOptions: parse(question.correctOptions) };
}

export default function AdminSetsPage() {
  const { confirm: confirmAction, dialog: confirmDialog } = useConfirmDialog();
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const [classesOpt, setClassesOpt] = useState<ClassOpt[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategorySummary[]>([]);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [managerNewName, setManagerNewName] = useState("");
  const [managerParentPath, setManagerParentPath] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [creatingSet, setCreatingSet] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [wordSearchQuery, setWordSearchQuery] = useState("");
  const [wordMatches, setWordMatches] = useState<WordMatch[]>([]);
  const [wordSearchLoading, setWordSearchLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newType, setNewType] = useState<"ielts_vocab" | "irregular_verb">("ielts_vocab");
  const [newClassId, setNewClassId] = useState<string>("");
  const [detail, setDetail] = useState<SetDetail | null>(null);
  const [detailTab, setDetailTab] = useState<SetWorkspaceTab>("overview");
  const [editSetName, setEditSetName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [savingSetName, setSavingSetName] = useState(false);
  const [showAddWord, setShowAddWord] = useState(false);
  const [wForm, setWForm] = useState({ meaning: "", v1: "", v2: "", v3: "", ipaV1: "", ipaV2: "", ipaV3: "", term: "", example: "", wtype: "", ipa: "" });
  const [editingWordId, setEditingWordId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ meaning: "", v1: "", v2: "", v3: "", ipaV1: "", ipaV2: "", ipaV3: "", term: "", example: "", wtype: "", ipa: "" });
  const [fetchingIpaId, setFetchingIpaId] = useState<number | null>(null);
  const [bulkIpaLoading, setBulkIpaLoading] = useState(false);
  const [savingClass, setSavingClass] = useState(false);
  const [openingDetailId, setOpeningDetailId] = useState<number | null>(null);
  const [detailWordQuery, setDetailWordQuery] = useState("");
  const [previewSetId, setPreviewSetId] = useState<number | null>(null);
  const [shareTarget, setShareTarget] = useState<{ targetType: "vocab_set" | "question_collection"; targetId: number; title: string; setType?: string } | null>(null);
  const [draggingSetId, setDraggingSetId] = useState<number | null>(null);
  const [dragOverSetId, setDragOverSetId] = useState<number | null>(null);
  const [movingSetId, setMovingSetId] = useState<number | null>(null);
  const [selectedSetIds, setSelectedSetIds] = useState<number[]>([]);
  const [selectedWordIds, setSelectedWordIds] = useState<number[]>([]);
  const [bulkDeletingSets, setBulkDeletingSets] = useState(false);
  const [bulkDeletingWords, setBulkDeletingWords] = useState(false);
  const [reorderingSets, setReorderingSets] = useState(false);
  const [moveTargetSetId, setMoveTargetSetId] = useState("");
  const [movingWords, setMovingWords] = useState(false);
  const [focusedWordId, setFocusedWordId] = useState<number | null>(null);
  const wordRowRefs = useRef(new Map<number, HTMLTableRowElement>()).current;
  const [exportingSetId, setExportingSetId] = useState<number | null>(null);
  const [categoryDocuments, setCategoryDocuments] = useState<CategoryDocument[]>([]);
  const [documentQuery, setDocumentQuery] = useState("");
  const [documentSort, setDocumentSort] = useState<DocumentSort>("name");
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentUploadProgress, setDocumentUploadProgress] = useState<{ fileName: string; fileIndex: number; totalFiles: number; percent: number } | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [documentDragActive, setDocumentDragActive] = useState(false);
  const [viewingDocument, setViewingDocument] = useState<CategoryDocument | null>(null);
  const [editingDocument, setEditingDocument] = useState<CategoryDocument | null>(null);
  const [editDocumentTitle, setEditDocumentTitle] = useState("");
  const [editDocumentFileName, setEditDocumentFileName] = useState("");
  const [savingDocumentName, setSavingDocumentName] = useState(false);
  const [replacingDocumentId, setReplacingDocumentId] = useState<number | null>(null);
  const [documentPreviewVersion, setDocumentPreviewVersion] = useState(0);
  const [categoryQuestions, setCategoryQuestions] = useState<any[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [editQuestionText, setEditQuestionText] = useState("");
  const [editAnswerText, setEditAnswerText] = useState("");
  const [editPhonetic, setEditPhonetic] = useState("");
  const [editVnMeaning, setEditVnMeaning] = useState("");
  const [editQuestionType, setEditQuestionType] = useState<QuestionType>("speaking");
  const [editOptions, setEditOptions] = useState(["", "", "", ""]);
  const [editCorrectOption, setEditCorrectOption] = useState("A");
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newAnswerText, setNewAnswerText] = useState("");
  const [newPhonetic, setNewPhonetic] = useState("");
  const [newVnMeaning, setNewVnMeaning] = useState("");
  const [newQuestionType, setNewQuestionType] = useState<QuestionType>("speaking");
  const [newOptions, setNewOptions] = useState(["", "", "", ""]);
  const [newCorrectOption, setNewCorrectOption] = useState("A");
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [collapsedQuestions, setCollapsedQuestions] = useState<Set<number>>(new Set());
  const [questionQuery, setQuestionQuery] = useState("");
  const [questionTypeFilter, setQuestionTypeFilter] = useState("all");
  const [questionDifficultyFilter, setQuestionDifficultyFilter] = useState("all");
  const [questionPage, setQuestionPage] = useState(0);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [questionBulkTarget, setQuestionBulkTarget] = useState("");
  const [questionBulkDifficulty, setQuestionBulkDifficulty] = useState("");
  const [questionBulkTags, setQuestionBulkTags] = useState("");
  const [questionShuffleSettings, setQuestionShuffleSettings] = useState<QuestionShuffleSettings>(DEFAULT_QUESTION_SHUFFLE_SETTINGS);
  const [savingQuestionShuffle, setSavingQuestionShuffle] = useState(false);
  const [optionShufflePreview, setOptionShufflePreview] = useState<OptionShufflePreview | null>(null);
  const [spellCheckEnabled, setSpellCheckEnabled] = useState(false);

  useEffect(() => {
    try { setSpellCheckEnabled(localStorage.getItem(SPELL_CHECK_KEY) === "on"); } catch { /* unavailable */ }
  }, []);

  function changeSpellCheck(enabled: boolean) {
    setSpellCheckEnabled(enabled);
    try { localStorage.setItem(SPELL_CHECK_KEY, enabled ? "on" : "off"); } catch { /* unavailable */ }
  }

  const filteredCategoryQuestions = useMemo(() => {
    const query = normalizeSearch(questionQuery);
    return categoryQuestions.filter((question) => {
      const options = (() => { try { return JSON.parse(question.options || "[]").join(" "); } catch { return ""; } })();
      const tags = (() => { try { return JSON.parse(question.tags || "[]").join(" "); } catch { return ""; } })();
      return (!query || normalizeSearch(`${question.question} ${question.answer || ""} ${options} ${tags}`).includes(query)) && (questionTypeFilter === "all" || question.questionType === questionTypeFilter) && (questionDifficultyFilter === "all" || (question.difficulty || "unset") === questionDifficultyFilter);
    });
  }, [categoryQuestions, questionDifficultyFilter, questionQuery, questionTypeFilter]);
  const QUESTION_PAGE_SIZE = 50;
  const questionPageCount = Math.max(1, Math.ceil(filteredCategoryQuestions.length / QUESTION_PAGE_SIZE));
  const pagedCategoryQuestions = filteredCategoryQuestions.slice(questionPage * QUESTION_PAGE_SIZE, (questionPage + 1) * QUESTION_PAGE_SIZE);
  const shuffleQuestions = useMemo(() => categoryQuestions.filter((question) => ["multiple_choice", "true_false"].includes(question.questionType)).map(toShuffleQuestion).filter((question) => question.options.length >= 2), [categoryQuestions]);
  const answerDistribution = useMemo(() => correctAnswerDistribution(shuffleQuestions), [shuffleQuestions]);
  const previewAnswerDistribution = useMemo(() => optionShufflePreview ? correctAnswerDistribution(optionShufflePreview.questions, optionShufflePreview.plans) : {}, [optionShufflePreview]);
  useEffect(() => { if (questionPage >= questionPageCount) setQuestionPage(questionPageCount - 1); }, [questionPage, questionPageCount]);

  async function runQuestionBulk(action: "delete" | "duplicate" | "move" | "copy") {
    if (!selectedQuestionIds.length) return;
    if (action === "delete" && !await confirmAction({ title: "Xóa câu hỏi đã chọn?", description: `${selectedQuestionIds.length} câu hỏi sẽ bị xóa. Hành động này không thể hoàn tác.`, confirmLabel: "Xóa câu hỏi", tone: "danger" })) return;
    if ((action === "move" || action === "copy") && !questionBulkTarget) return toast("Hãy chọn thư mục đích.");
    try { const response = await fetch("/api/admin/category-questions/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ids: selectedQuestionIds, ...(questionBulkTarget ? { category: questionBulkTarget } : {}) }) }); const data = await response.json(); if (!response.ok) return toast(data.error || "Không thể thực hiện bulk action."); toast(`Đã xử lý ${data.affected} câu hỏi.`); setSelectedQuestionIds([]); await refreshCategoryQuestions(); } catch { toast("Không thể kết nối để xử lý câu hỏi."); }
  }

  async function updateQuestionBulkMetadata() {
    if (!selectedQuestionIds.length || (!questionBulkDifficulty && !questionBulkTags.trim())) return toast("Hãy chọn độ khó hoặc nhập tag.");
    try { const response = await fetch("/api/admin/category-questions/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "metadata", ids: selectedQuestionIds, ...(questionBulkDifficulty ? { difficulty: questionBulkDifficulty } : {}), ...(questionBulkTags.trim() ? { tags: questionBulkTags.split(",").map((tag) => tag.trim()).filter(Boolean) } : {}) }) }); const data = await response.json(); if (!response.ok) return toast(data.error || "Không thể cập nhật metadata."); toast(`Đã cập nhật ${data.affected} câu hỏi.`); setSelectedQuestionIds([]); await refreshCategoryQuestions(); } catch { toast("Không thể kết nối để cập nhật metadata."); }
  }

  async function exportSelectedQuestions() {
    const selected = categoryQuestions.filter((question) => selectedQuestionIds.includes(question.id)); if (!selected.length) return;
    const XLSX = await import("xlsx");
    const rows = selected.map((question, index) => { const options = (() => { try { return JSON.parse(question.options || "[]"); } catch { return []; } })(); const correct = (() => { try { return JSON.parse(question.correctOptions || "[]"); } catch { return question.correctOption ? [question.correctOption] : []; } })(); const row: Record<string, unknown> = { id: question.id, question_number: index + 1, type: question.questionType, question: safeSpreadsheetCell(question.question), correct_answer: correct.join(","), answer: safeSpreadsheetCell(question.answer), explanation: safeSpreadsheetCell(question.explanation), difficulty: question.difficulty || "", tags: safeSpreadsheetCell((() => { try { return JSON.parse(question.tags || "[]").join(", "); } catch { return ""; } })()) }; options.forEach((option: string, optionIndex: number) => { row[`option_${String.fromCharCode(97 + optionIndex)}`] = safeSpreadsheetCell(option); }); return row; });
    const sheet = XLSX.utils.json_to_sheet(rows); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, "Questions"); XLSX.writeFile(workbook, `${selectedCategory.replace(/[\\/:*?"<>|]/g, "-")}-selected-questions.xlsx`);
  }

  async function saveQuestionShuffleSettings() {
    if (savingQuestionShuffle) return;
    setSavingQuestionShuffle(true);
    try {
      const response = await fetch("/api/admin/category-questions/shuffle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settings", category: selectedCategory, ...questionShuffleSettings }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return toast(data.error || "Không thể lưu cài đặt xáo trộn.");
      setQuestionShuffleSettings(data.settings || questionShuffleSettings);
      toast("Đã lưu cài đặt xáo trộn khi làm bài.");
    } catch {
      toast("Không thể kết nối để lưu cài đặt xáo trộn.");
    } finally {
      setSavingQuestionShuffle(false);
    }
  }

  function previewOptionShuffle(mode: QuestionShuffleMode, selectedOnly = false) {
    const selectedSet = new Set(selectedQuestionIds);
    const questions = selectedOnly ? shuffleQuestions.filter((question) => selectedSet.has(question.id)) : shuffleQuestions;
    if (!questions.length) return toast("Không có câu trắc nghiệm hợp lệ để xáo trộn.");
    setOptionShufflePreview({ mode, questions, plans: planPermanentOptionShuffle(questions, mode) });
  }

  async function applyOptionShuffle() {
    if (!optionShufflePreview || savingQuestionShuffle) return;
    setSavingQuestionShuffle(true);
    try {
      const response = await fetch("/api/admin/category-questions/shuffle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply_options", category: selectedCategory, items: optionShufflePreview.plans.map((plan) => ({ id: plan.id, optionOrder: plan.optionOrder })) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return toast(data.error || "Không thể xáo trộn lựa chọn.");
      toast(`Đã xáo trộn lựa chọn của ${data.affected} câu hỏi và giữ nguyên đáp án đúng.`);
      setOptionShufflePreview(null);
      setSelectedQuestionIds([]);
      await refreshCategoryQuestions();
    } catch {
      toast("Không thể kết nối để xáo trộn lựa chọn.");
    } finally {
      setSavingQuestionShuffle(false);
    }
  }

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of categoryOptions) {
      const parts = category.name.split(" / ");
      for (let index = 1; index <= parts.length; index += 1) {
        const path = parts.slice(0, index).join(" / ");
        if (!counts.has(path)) counts.set(path, 0);
      }
    }
    for (const set of sets || []) {
      const category = set.category?.trim() || UNCATEGORIZED;
      if (category === UNCATEGORIZED) counts.set(category, (counts.get(category) || 0) + 1);
      else {
        const parts = category.split(" / ");
        for (let index = 1; index <= parts.length; index += 1) {
          const path = parts.slice(0, index).join(" / ");
          counts.set(path, (counts.get(path) || 0) + 1);
        }
      }
    }
    return Array.from(counts.entries()).sort(([left], [right]) => {
      if (left === UNCATEGORIZED) return 1;
      if (right === UNCATEGORIZED) return -1;
      return left.localeCompare(right, "vi");
    });
  }, [categoryOptions, sets]);
  const childCategories = useMemo(() => {
    if (selectedCategory === UNCATEGORIZED) return [];
    const parent = selectedCategory === ALL_CATEGORIES ? "" : `${selectedCategory} / `;
    return categories.filter(([path]) => {
      if (path === UNCATEGORIZED || !path.startsWith(parent) || path === selectedCategory) return false;
      return !path.slice(parent.length).includes(" / ");
    });
  }, [categories, selectedCategory]);
  const categoryBreadcrumbs = useMemo(() => {
    if (selectedCategory === ALL_CATEGORIES || selectedCategory === UNCATEGORIZED) return [];
    const parts = selectedCategory.split(" / ");
    return parts.map((label, index) => ({ label, path: parts.slice(0, index + 1).join(" / ") }));
  }, [selectedCategory]);
  const filteredSets = useMemo(() => {
    if (!sets) return [];
    const query = normalizeSearch(searchQuery);
    return sets.filter((set) =>
      (selectedCategory === ALL_CATEGORIES || (set.category?.trim() || UNCATEGORIZED) === selectedCategory)
      && (!query || normalizeSearch(`${set.name} ${set.category || ""} ${set.className || "Công khai"} ${set.type === "irregular_verb" ? "Động từ bất quy tắc" : "Từ vựng IELTS"}`).includes(query))
    ).sort((left, right) => {
      const categoryOrder = (left.category || "").localeCompare(right.category || "", "vi", { numeric: true, sensitivity: "base" });
      return categoryOrder || left.name.localeCompare(right.name, "vi", { numeric: true, sensitivity: "base" });
    });
  }, [sets, searchQuery, selectedCategory]);
  const filteredDetailWords = useMemo(() => {
    if (!detail) return [];
    const query = normalizeSearch(detailWordQuery);
    if (!query) return detail.words;
    return detail.words.filter((word) => normalizeSearch([
      word.term, word.meaning, word.v1, word.v2, word.v3, word.example,
    ].filter(Boolean).join(" ")).includes(query));
  }, [detail, detailWordQuery]);
  const compatibleMoveTargets = useMemo(() => {
    if (!sets || !detail) return [];
    return sets.filter((set) => set.id !== detail.id && set.type === detail.type)
      .sort((left, right) => left.name.localeCompare(right.name, "vi", { numeric: true, sensitivity: "base" }));
  }, [detail, sets]);
  const hasAggregatedCategoryDocuments = useMemo(
    () => categoryDocuments.some((document) => document.category !== selectedCategory),
    [categoryDocuments, selectedCategory],
  );
  const visibleCategoryDocuments = useMemo<VisibleCategoryDocument[]>(() => {
    const query = normalizeSearch(documentQuery);
    const sortedDocuments = [...categoryDocuments].sort((left, right) => {
        if (documentSort === "name") return hasAggregatedCategoryDocuments
          ? compareDocumentsByFolderThenName(left, right)
          : left.title.localeCompare(right.title, "vi", { numeric: true, sensitivity: "base" });
        if (documentSort === "size") return right.fileSize - left.fileSize;
        const leftTime = new Date(left.createdAt).getTime();
        const rightTime = new Date(right.createdAt).getTime();
        return documentSort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
      });
    return sortedDocuments
      .map((document, index) => ({
        ...document,
        displayTitle: hasAggregatedCategoryDocuments ? formatAggregatedDocumentName(index + 1, document.title) : document.title,
        displayFileName: hasAggregatedCategoryDocuments ? formatAggregatedDocumentName(index + 1, document.fileName) : document.fileName,
        aggregateOrder: hasAggregatedCategoryDocuments ? index + 1 : null,
      }))
      .filter((document) => !query || normalizeSearch(`${document.displayTitle} ${document.displayFileName} ${document.title} ${document.fileName} ${document.category}`).includes(query));
  }, [categoryDocuments, documentQuery, documentSort, hasAggregatedCategoryDocuments]);
  const categorySiblings = useMemo(() => {
    if (!sets || !detail) return [];
    const categoryKey = detail.category?.trim() || UNCATEGORIZED;
    return sets
      .filter((set) => (set.category?.trim() || UNCATEGORIZED) === categoryKey)
      .sort((left, right) => left.name.localeCompare(right.name, "vi", { numeric: true, sensitivity: "base" }));
  }, [detail, sets]);
  const siblingIndex = detail ? categorySiblings.findIndex((set) => set.id === detail.id) : -1;
  const previousSibling = siblingIndex > 0 ? categorySiblings[siblingIndex - 1] : null;
  const nextSibling = siblingIndex >= 0 && siblingIndex < categorySiblings.length - 1 ? categorySiblings[siblingIndex + 1] : null;

  async function loadSets() {
    const res = await fetch("/api/sets");
    const data = await res.json();
    setSets(data.sets || []);
  }
  async function loadClasses() {
    const res = await fetch("/api/admin/classes");
    if (!res.ok) return;
    const data = await res.json();
    setClassesOpt((data.classes || []).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })));
  }
  async function loadCategories() {
    const res = await fetch("/api/admin/categories");
    if (!res.ok) return;
    const data = await res.json();
    setCategoryOptions(data.categories || []);
  }

  async function moveSetToCategory(setId: number, category: string) {
    const target = category === UNCATEGORIZED ? null : category;
    const source = sets?.find((item) => item.id === setId);
    if (!source || (source.category?.trim() || UNCATEGORIZED) === category) return;
    setMovingSetId(setId);
    try {
      const res = await fetch(`/api/sets/${setId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "Không thể chuyển bộ từ vào danh mục.");
      setSets((current) => current ? current.map((item) => item.id === setId ? { ...item, category: data.set?.category ?? target } : item) : current);
      setDetail((current) => current?.id === setId ? { ...current, category: data.set?.category ?? target } : current);
      await loadCategories();
      toast(`Đã chuyển “${source.name}” vào ${target || "Chưa phân loại"}.`);
    } catch {
      toast("Không thể kết nối để chuyển bộ từ.");
    } finally {
      setMovingSetId(null);
      setDraggingSetId(null);
    }
  }

  async function uploadDocumentInChunks(file: File, title: string, fileIndex: number, totalFiles: number, targetDocumentId?: number, targetCategory = selectedCategory) {
    const createResponse = await fetch("/api/admin/category-documents/uploads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: targetCategory, title, fileName: file.name, fileType: file.type, fileSize: file.size, targetDocumentId: targetDocumentId || null }),
    });
    const session = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok) throw new Error(session.error || `Không thể chuẩn bị tải “${file.name}”.`);
    try {
      for (let index = 0; index < session.chunkCount; index += 1) {
        const chunk = file.slice(index * session.chunkBytes, Math.min(file.size, (index + 1) * session.chunkBytes));
        let response: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          response = await fetch(`/api/admin/category-documents/uploads/${session.uploadId}/chunks/${index}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: chunk });
          if (response.ok) break;
          if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
        }
        if (!response?.ok) {
          const error = await response?.json().catch(() => ({}));
          throw new Error(error?.error || `Không thể tải phần ${index + 1}/${session.chunkCount} của “${file.name}”.`);
        }
        setDocumentUploadProgress({ fileName: file.name, fileIndex, totalFiles, percent: Math.round(((index + 1) / session.chunkCount) * 100) });
      }
      const completeResponse = await fetch(`/api/admin/category-documents/uploads/${session.uploadId}/complete`, { method: "POST" });
      const complete = await completeResponse.json().catch(() => ({}));
      if (!completeResponse.ok) throw new Error(complete.error || `Không thể hoàn tất “${file.name}”.`);
      return complete.document as CategoryDocument;
    } catch (error) {
      void fetch(`/api/admin/category-documents/uploads/${session.uploadId}`, { method: "DELETE" });
      throw error;
    }
  }

  async function uploadCategoryDocument() {
    if (selectedCategory === ALL_CATEGORIES || selectedCategory === UNCATEGORIZED || documentFiles.length === 0 || documentUploading) return;
    setDocumentUploading(true);
    const targetCategory = selectedCategory;
    try {
      for (let index = 0; index < documentFiles.length; index += 1) {
        const file = documentFiles[index];
        setDocumentUploadProgress({ fileName: file.name, fileIndex: index + 1, totalFiles: documentFiles.length, percent: 0 });
        await uploadDocumentInChunks(file, documentFiles.length === 1 ? documentTitle.trim() : "", index + 1, documentFiles.length, undefined, targetCategory);
      }
      await refreshCategoryDocuments();
      setDocumentFiles([]); setDocumentTitle("");
      const input = document.getElementById("category-document-file") as HTMLInputElement | null;
      if (input) input.value = "";
      toast(`Đã tải ${documentFiles.length} tài liệu lên thư mục.`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Không thể tải tài liệu lên.");
    } finally {
      setDocumentUploading(false); setDocumentUploadProgress(null);
    }
  }

  function addDocumentFiles(incoming: File[]) {
    const supported = incoming.filter((file) => isSupportedDocument(file.name, file.type) && file.size > 0);
    if (supported.length !== incoming.length) toast("Chỉ file PDF, DOCX và DOC hợp lệ được thêm vào danh sách.");
    setDocumentFiles((current) => {
      const existing = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      return [...current, ...supported.filter((file) => !existing.has(`${file.name}:${file.size}:${file.lastModified}`))];
    });
  }

  async function deleteCategoryDocument(document: CategoryDocument) {
    if (!await confirmAction({ title: "Xóa tài liệu?", description: `“${document.title}” sẽ bị xóa khỏi thư mục. Hành động này không thể hoàn tác.`, confirmLabel: "Xóa tài liệu", tone: "danger" })) return;
    const res = await fetch(`/api/admin/category-documents?id=${document.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error || "Không thể xóa tài liệu.");
    await refreshCategoryDocuments();
    if (viewingDocument?.id === document.id) setViewingDocument(null);
    toast("Đã xóa tài liệu.");
  }

  function startRenameDocument(document: CategoryDocument) {
    setEditingDocument(document);
    setEditDocumentTitle(document.title);
    setEditDocumentFileName(document.fileName);
  }

  async function saveDocumentName() {
    if (!editingDocument || savingDocumentName || !editDocumentTitle.trim() || !editDocumentFileName.trim()) return;
    setSavingDocumentName(true);
    try {
      const res = await fetch("/api/admin/category-documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingDocument.id, title: editDocumentTitle, fileName: editDocumentFileName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "Không thể đổi tên tài liệu.");
      await refreshCategoryDocuments();
      setViewingDocument((current) => current?.id === data.document.id ? data.document : current);
      setEditingDocument(null);
      toast("Đã đổi tên tài liệu.");
    } catch {
      toast("Không thể kết nối để đổi tên tài liệu.");
    } finally {
      setSavingDocumentName(false);
    }
  }

  async function refreshCategoryQuestions() {
    if (selectedCategory === ALL_CATEGORIES || selectedCategory === UNCATEGORIZED) { setCategoryQuestions([]); setQuestionShuffleSettings(DEFAULT_QUESTION_SHUFFLE_SETTINGS); return; }
    setQuestionsLoading(true);
    try {
      const res = await fetch(`/api/admin/category-questions?category=${encodeURIComponent(selectedCategory)}`);
      if (!res.ok) { setCategoryQuestions([]); setQuestionShuffleSettings(DEFAULT_QUESTION_SHUFFLE_SETTINGS); return; }
      const data = await res.json();
      setCategoryQuestions(data.questions || []);
      setQuestionShuffleSettings(data.shuffleSettings || DEFAULT_QUESTION_SHUFFLE_SETTINGS);
    } catch { setCategoryQuestions([]); setQuestionShuffleSettings(DEFAULT_QUESTION_SHUFFLE_SETTINGS); }
    finally { setQuestionsLoading(false); }
  }

  async function addCategoryQuestion() {
    if (!newQuestionText.trim() || savingQuestion) return;
    if (newQuestionType === "multiple_choice" && newOptions.some((option) => !option.trim())) return toast("Hãy nhập đủ 4 lựa chọn A, B, C và D.");
    setSavingQuestion(true);
    try {
      const res = await fetch("/api/admin/category-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: selectedCategory, question: newQuestionText.trim(), answer: newAnswerText.trim(), phonetic: newPhonetic.trim() || null, vnMeaning: newVnMeaning.trim() || null, questionType: newQuestionType, options: newQuestionType === "multiple_choice" ? newOptions.map((option) => option.trim()) : [], correctOption: newQuestionType === "multiple_choice" ? newCorrectOption : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "Không thể thêm câu hỏi.");
      await refreshCategoryQuestions();
      setNewQuestionText("");
      setNewAnswerText("");
      setNewOptions(["", "", "", ""]);
      toast("Đã thêm câu hỏi.");
    } catch { toast("Không thể kết nối."); }
    finally { setSavingQuestion(false); }
  }

  async function saveQuestionEdit(id: number) {
    if (!editQuestionText.trim() || savingQuestion) return;
    if (editQuestionType === "multiple_choice" && editOptions.some((option) => !option.trim())) return toast("Hãy nhập đủ 4 lựa chọn A, B, C và D.");
    setSavingQuestion(true);
    try {
      const res = await fetch("/api/admin/category-questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, question: editQuestionText.trim(), answer: editAnswerText.trim(), phonetic: editPhonetic.trim() || null, vnMeaning: editVnMeaning.trim() || null, questionType: editQuestionType, options: editQuestionType === "multiple_choice" ? editOptions.map((option) => option.trim()) : [], correctOption: editQuestionType === "multiple_choice" ? editCorrectOption : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "Không thể lưu câu hỏi.");
      setCategoryQuestions((current) => current.map((q) => q.id === id ? data.question : q));
      setEditingQuestionId(null);
      toast("Đã lưu câu hỏi.");
    } catch { toast("Không thể kết nối."); }
    finally { setSavingQuestion(false); }
  }

  async function deleteCategoryQuestion(id: number) {
    if (!await confirmAction({ title: "Xóa câu hỏi?", description: "Câu hỏi sẽ bị xóa khỏi ngân hàng. Hành động này không thể hoàn tác.", confirmLabel: "Xóa câu hỏi", tone: "danger" })) return;
    try {
      const res = await fetch("/api/admin/category-questions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!res.ok) return toast("Không thể xóa câu hỏi.");
      setCategoryQuestions((current) => current.filter((q) => q.id !== id));
      if (editingQuestionId === id) setEditingQuestionId(null);
      toast("Đã xóa câu hỏi.");
    } catch { toast("Không thể kết nối."); }
  }

  async function moveQuestionOrder(id: number, direction: -1 | 1) {
    const ordered = categoryQuestions.map((q) => q.id);
    const currentIndex = ordered.indexOf(id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
    [ordered[currentIndex], ordered[targetIndex]] = [ordered[targetIndex], ordered[currentIndex]];
    try {
      const res = await fetch("/api/admin/category-questions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: selectedCategory, orderedIds: ordered }),
      });
      if (!res.ok) return toast("Không thể sắp xếp câu hỏi.");
      const data = await res.json();
      setCategoryQuestions(data.questions || []);
    } catch { toast("Không thể kết nối."); }
  }

  function toggleQuestionCollapse(id: number) {
    setCollapsedQuestions((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  async function refreshCategoryDocuments() {
    if (selectedCategory === ALL_CATEGORIES || selectedCategory === UNCATEGORIZED) return;
    const res = await fetch(`/api/admin/category-documents?category=${encodeURIComponent(selectedCategory)}`);
    if (!res.ok) return;
    const data = await res.json();
    setCategoryDocuments(data.documents || []);
  }

  async function replaceCategoryDocument(document: CategoryDocument, file: File) {
    if (replacingDocumentId !== null) return;
    if (!isSupportedDocument(file.name, file.type) || file.size < 1) return toast("Chỉ chấp nhận file PDF, DOCX hoặc DOC hợp lệ.");
    if (!await confirmAction({ title: "Thay file tài liệu?", description: `Nội dung “${document.title}” sẽ được thay bằng “${file.name}”.`, confirmLabel: "Thay file", tone: "warning" })) return;
    setReplacingDocumentId(document.id);
    try {
      setDocumentUploadProgress({ fileName: file.name, fileIndex: 1, totalFiles: 1, percent: 0 });
      const updated = await uploadDocumentInChunks(file, document.title, 1, 1, document.id, document.category);
      setCategoryDocuments((current) => current.map((item) => item.id === document.id ? updated : item));
      setViewingDocument((current) => current?.id === document.id ? updated : current);
      setDocumentPreviewVersion((version) => version + 1);
      toast("Đã thay thế tài liệu thành công.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Không thể thay thế tài liệu.");
    } finally {
      setReplacingDocumentId(null); setDocumentUploadProgress(null);
    }
  }

  useEffect(() => {
    loadSets();
    loadClasses();
    loadCategories();
    const returnParams = new URLSearchParams(window.location.search);
    const requestedCategory = returnParams.get("category")?.trim();
    const requestedSetId = Number(returnParams.get("openSet"));
    if (requestedCategory) setSelectedCategory(requestedCategory);
    if (Number.isInteger(requestedSetId) && requestedSetId > 0) {
      window.history.replaceState(null, "", "/admin/sets");
      void openDetail(requestedSetId);
    }
  }, []);

  useEffect(() => {
    setDocumentFiles([]);
    setDocumentDragActive(false);
    setDocumentTitle("");
    setDocumentQuery("");
    setDocumentSort("name");
    setViewingDocument(null);
    if (selectedCategory === ALL_CATEGORIES || selectedCategory === UNCATEGORIZED) {
      setCategoryDocuments([]);
      setCategoryQuestions([]);
      return;
    }
    const controller = new AbortController();
    setDocumentsLoading(true);
    fetch(`/api/admin/category-documents?category=${encodeURIComponent(selectedCategory)}`, { signal: controller.signal })
      .then(async (res) => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data) => { setCategoryDocuments(data.documents || []); void refreshCategoryQuestions(); })
      .catch((error) => { if ((error as Error).name !== "AbortError") toast("Không thể tải tài liệu PDF."); })
      .finally(() => { if (!controller.signal.aborted) setDocumentsLoading(false); });
    return () => controller.abort();
  }, [selectedCategory]);

  useEffect(() => {
    const query = wordSearchQuery.trim();
    if (query.length < 2) {
      setWordMatches([]);
      setWordSearchLoading(false);
      return;
    }
    const controller = new AbortController();
    setWordSearchLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/words/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!res.ok) throw new Error("search");
        const data = await res.json();
        setWordMatches(data.matches || []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") toast("Không thể tìm kiếm từ lúc này.");
      } finally {
        if (!controller.signal.aborted) setWordSearchLoading(false);
      }
    }, 280);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [wordSearchQuery]);

  useEffect(() => {
    function handleSetNavigation(event: KeyboardEvent) {
      if (!detail || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (showAddWord || editingWordId !== null || showCategoryManager || showNewForm || openingDetailId !== null) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      const sibling = event.key === "ArrowLeft" ? previousSibling : nextSibling;
      if (!sibling) return;
      event.preventDefault();
      void navigateToSibling(sibling.id);
    }
    window.addEventListener("keydown", handleSetNavigation);
    return () => window.removeEventListener("keydown", handleSetNavigation);
  }, [detail, editingWordId, nextSibling, openingDetailId, previousSibling, showAddWord, showCategoryManager, showNewForm]);

  useEffect(() => {
    if (previewSetId === null) return;
    function closePreview(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-preview-menu]")) setPreviewSetId(null);
    }
    function closePreviewWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setPreviewSetId(null);
    }
    document.addEventListener("pointerdown", closePreview);
    window.addEventListener("keydown", closePreviewWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closePreview);
      window.removeEventListener("keydown", closePreviewWithEscape);
    };
  }, [previewSetId]);

  async function createCategory() {
    const name = managerNewName.trim();
    if (!name) return toast("Vui lòng nhập tên danh mục.");
    setCategorySubmitting(true);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentPath: managerParentPath || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "Không thể tạo danh mục.");
      setManagerNewName("");
      setManagerParentPath("");
      await loadCategories();
      toast(`Đã tạo danh mục “${data.category.name}”.`);
    } catch {
      toast("Không thể kết nối để tạo danh mục.");
    } finally {
      setCategorySubmitting(false);
    }
  }

  async function renameCategory(id: number) {
    const name = editingCategoryName.trim();
    if (!name) return toast("Tên danh mục không được để trống.");
    setCategorySubmitting(true);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "Không thể đổi tên danh mục.");
      if (selectedCategory === data.category.oldName) setSelectedCategory(data.category.name);
      if (newCategory === data.category.oldName) setNewCategory(data.category.name);
      if (editCategory === data.category.oldName) setEditCategory(data.category.name);
      setEditingCategoryId(null);
      await Promise.all([loadCategories(), loadSets()]);
      toast(`Đã đổi tên thành “${data.category.name}” cho tất cả bộ từ liên quan.`);
    } catch {
      toast("Không thể kết nối để đổi tên danh mục.");
    } finally {
      setCategorySubmitting(false);
    }
  }

  async function deleteCategory(category: CategorySummary) {
    const detail = category.count
      ? `${category.count} bộ từ trong danh mục sẽ được chuyển về “Chưa phân loại”.`
      : "Danh mục này hiện chưa có bộ từ.";
    if (!await confirmAction({ title: "Xóa danh mục?", description: `Danh mục “${category.name}” sẽ bị xóa. ${detail}`, confirmLabel: "Xóa danh mục", tone: "danger" })) return;
    setCategorySubmitting(true);
    try {
      const res = await fetch(`/api/admin/categories?id=${category.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "Không thể xóa danh mục.");
      if (selectedCategory === category.name) setSelectedCategory(ALL_CATEGORIES);
      if (newCategory === category.name) setNewCategory("");
      if (editCategory === category.name) setEditCategory("");
      await Promise.all([loadCategories(), loadSets()]);
      toast(data.movedSets ? `Đã xóa và chuyển ${data.movedSets} bộ từ về “Chưa phân loại”.` : "Đã xóa danh mục.");
    } catch {
      toast("Không thể kết nối để xóa danh mục.");
    } finally {
      setCategorySubmitting(false);
    }
  }

  async function createSet() {
    if (!newName.trim()) return toast("Vui lòng nhập tên bộ từ vựng.");
    setCreatingSet(true);
    try {
      const res = await fetch("/api/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), category: newCategory.trim() || null, type: newType, classId: newClassId ? Number(newClassId) : null }),
      });
      if (!res.ok) return toast("Không thể tạo bộ từ vựng.");
      toast("Đã tạo bộ từ vựng!");
      closeNewForm();
      await Promise.all([loadSets(), loadCategories()]);
    } catch {
      toast("Không thể kết nối để tạo bộ từ vựng.");
    } finally {
      setCreatingSet(false);
    }
  }

  function openNewSetForm() {
    setNewCategory(selectedCategory === ALL_CATEGORIES || selectedCategory === UNCATEGORIZED ? "" : selectedCategory);
    setShowNewForm(true);
  }

  function closeNewForm() {
    setShowNewForm(false);
    setNewName("");
    setNewCategory("");
    setNewType("ielts_vocab");
    setNewClassId("");
  }

  async function changeSetClass(setId: number, classId: string) {
    const nextClassId = classId ? Number(classId) : null;
    setSavingClass(true);
    try {
      const res = await fetch(`/api/sets/${setId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: nextClassId }),
      });
      if (!res.ok) return toast("Không thể cập nhật lớp.");
      setDetail((current) => current?.id === setId ? {
        ...current,
        classId: nextClassId,
        className: classesOpt.find((item) => item.id === nextClassId)?.name || null,
      } : current);
      toast("Đã cập nhật phạm vi hiển thị.");
      loadSets();
    } catch {
      toast("Không thể kết nối để cập nhật lớp.");
    } finally {
      setSavingClass(false);
    }
  }

  async function deleteSet(id: number) {
    if (!await confirmAction({ title: "Xóa bộ từ?", description: "Toàn bộ từ trong bộ này sẽ bị xóa. Hành động không thể hoàn tác.", confirmLabel: "Xóa bộ từ", tone: "danger" })) return;
    try {
      const res = await fetch(`/api/sets/${id}`, { method: "DELETE" });
      if (!res.ok) return toast("Không thể xoá bộ từ vựng.");
      toast("Đã xoá bộ từ vựng.");
      setSelectedSetIds((current) => current.filter((setId) => setId !== id));
      if (detail?.id === id) setDetail(null);
      loadSets();
    } catch {
      toast("Không thể kết nối để xoá bộ từ vựng.");
    }
  }

  async function deleteSelectedSets() {
    if (selectedSetIds.length === 0 || bulkDeletingSets) return;
    if (!await confirmAction({ title: "Xóa các bộ từ đã chọn?", description: `${selectedSetIds.length} bộ và toàn bộ từ bên trong sẽ bị xóa vĩnh viễn.`, confirmLabel: "Xóa các bộ", tone: "danger" })) return;
    setBulkDeletingSets(true);
    try {
      const res = await fetch("/api/admin/sets/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", ids: selectedSetIds }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "Không thể xóa các bộ từ đã chọn.");
      if (detail && selectedSetIds.includes(detail.id)) setDetail(null);
      setSelectedSetIds([]);
      await Promise.all([loadSets(), loadCategories()]);
      toast(`Đã xóa ${data.deleted || 0} bộ từ.`);
    } catch { toast("Không thể kết nối để xóa hàng loạt."); }
    finally { setBulkDeletingSets(false); }
  }

  async function saveSetOrder(orderedIds: number[]) {
    if (selectedCategory === ALL_CATEGORIES || selectedCategory === UNCATEGORIZED || reorderingSets) return;
    setReorderingSets(true);
    try {
      const res = await fetch("/api/admin/sets/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reorder", category: selectedCategory, orderedIds }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "Không thể lưu thứ tự bộ từ.");
      await loadSets();
      toast("Đã sắp xếp và chuẩn hóa tiền tố bộ từ.");
    } catch { toast("Không thể kết nối để lưu thứ tự bộ từ."); }
    finally { setReorderingSets(false); setDraggingSetId(null); setDragOverSetId(null); }
  }

  function currentCategorySetIds() {
    if (!sets || selectedCategory === ALL_CATEGORIES || selectedCategory === UNCATEGORIZED) return [];
    return sets.filter((item) => item.category === selectedCategory)
      .sort((left, right) => left.name.localeCompare(right.name, "vi", { numeric: true, sensitivity: "base" }))
      .map((item) => item.id);
  }

  function moveSetByOffset(setId: number, offset: -1 | 1) {
    const ordered = currentCategorySetIds();
    const currentIndex = ordered.indexOf(setId);
    const targetIndex = currentIndex + offset;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
    [ordered[currentIndex], ordered[targetIndex]] = [ordered[targetIndex], ordered[currentIndex]];
    void saveSetOrder(ordered);
  }

  function autoSortSetIds() {
    if (!sets) return [];
    return sets.filter((item) => item.category === selectedCategory)
      .sort((left, right) => left.name.localeCompare(right.name, "vi", { numeric: true, sensitivity: "base" }))
      .map((item) => item.id);
  }

  function dropSetBefore(targetId: number) {
    if (draggingSetId === null || draggingSetId === targetId) return;
    const ordered = currentCategorySetIds().filter((id) => id !== draggingSetId);
    const targetIndex = ordered.indexOf(targetId);
    if (targetIndex < 0) return;
    ordered.splice(targetIndex, 0, draggingSetId);
    void saveSetOrder(ordered);
  }

  async function exportSet(setId: number, format: "xlsx" | "pdf") {
    setExportingSetId(setId);
    try {
      const res = await fetch(`/api/sets/${setId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.set) throw new Error(data.error || "Không thể tải dữ liệu bộ từ.");
      const current = data.set as SetDetail;
      const safeName = current.name.replace(/[\\/:*?"<>|]/g, "-").trim() || `bo-tu-${current.id}`;
      const rows = current.words.map((word, index) => current.type === "irregular_verb"
        ? { STT: index + 1, Nghĩa: word.meaning, V1: word.v1 || "", "IPA V1": word.ipaV1 || "", V2: word.v2 || "", "IPA V2": word.ipaV2 || "", V3: word.v3 || "", "IPA V3": word.ipaV3 || "" }
        : { STT: index + 1, Từ: word.term || "", Nghĩa: word.meaning, IPA: word.ipa || "", "Loại từ": word.wtype || "", "Ví dụ": word.example || "" });
      if (format === "xlsx") {
        const XLSX = await import("xlsx");
        const sheet = XLSX.utils.json_to_sheet(rows);
        sheet["!cols"] = current.type === "irregular_verb" ? [{ wch: 6 }, { wch: 28 }, ...Array.from({ length: 6 }, () => ({ wch: 18 }))] : [{ wch: 6 }, { wch: 24 }, { wch: 30 }, { wch: 18 }, { wch: 16 }, { wch: 52 }];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, "Từ vựng");
        XLSX.writeFile(workbook, `${safeName}.xlsx`);
      } else {
        const [{ default: pdfMake }, { default: pdfFonts }] = await Promise.all([import("pdfmake/build/pdfmake"), import("pdfmake/build/vfs_fonts")]);
        pdfMake.vfs = pdfFonts.pdfMake?.vfs || pdfFonts.vfs || pdfFonts;
        const headers = current.type === "irregular_verb" ? ["STT", "Nghĩa", "V1 / IPA", "V2 / IPA", "V3 / IPA"] : ["STT", "Từ / IPA", "Nghĩa", "Loại", "Ví dụ"];
        const body = [headers, ...current.words.map((word, index) => current.type === "irregular_verb"
          ? [String(index + 1), word.meaning, `${word.v1 || ""}\n${word.ipaV1 || ""}`, `${word.v2 || ""}\n${word.ipaV2 || ""}`, `${word.v3 || ""}\n${word.ipaV3 || ""}`]
          : [String(index + 1), `${word.term || ""}\n${word.ipa || ""}`, word.meaning, word.wtype || "", word.example || ""] )];
        pdfMake.createPdf({ pageOrientation: "landscape", pageMargins: [28, 38, 28, 34], content: [
          { text: current.name, fontSize: 18, bold: true, color: "#242337", margin: [0, 0, 0, 4] },
          { text: `${current.category || "Chưa phân loại"} · ${current.words.length} mục`, fontSize: 9, color: "#6F6C82", margin: [0, 0, 0, 14] },
          { table: { headerRows: 1, widths: current.type === "irregular_verb" ? [28, "*", "*", "*", "*"] : [28, 115, 145, 65, "*"], body }, layout: { fillColor: (row: number) => row === 0 ? "#EFECFF" : row % 2 === 0 ? "#FAF9FD" : null, hLineColor: () => "#DCD9E8", vLineColor: () => "#DCD9E8" } },
        ], defaultStyle: { font: "Roboto", fontSize: 8, color: "#242337" }, footer: (page: number, pages: number) => ({ text: `${page}/${pages}`, alignment: "center", fontSize: 8, color: "#8B899F" }) }).download(`${safeName}.pdf`);
      }
      toast(`Đã tạo file ${format.toUpperCase()} cho “${current.name}”.`);
    } catch (error) { toast(error instanceof Error ? error.message : "Không thể xuất bộ từ."); }
    finally { setExportingSetId(null); }
  }

  async function openDetail(id: number, focusWordId?: number) {
    setPreviewSetId(null);
    setOpeningDetailId(id);
    try {
      const res = await fetch(`/api/sets/${id}`);
      if (!res.ok) return toast("Không thể mở bộ từ vựng.");
      const data = await res.json();
      setDetail(data.set);
      setDetailTab(focusWordId ? "vocabulary" : "overview");
      setFocusedWordId(focusWordId ?? null);
      setEditSetName(data.set.name);
      setEditCategory(data.set.category || "");
      setDetailWordQuery("");
      setShowAddWord(false);
      setEditingWordId(null);
      setSelectedWordIds([]);
    } catch {
      toast("Không thể kết nối để mở bộ từ vựng.");
    } finally {
      setOpeningDetailId(null);
    }
  }

  useEffect(() => {
    if (!detail || focusedWordId === null) return;
    const timer = window.setTimeout(() => {
      const row = wordRowRefs.get(focusedWordId);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
      row?.focus({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [detail, focusedWordId, wordRowRefs]);

  async function moveSelectedWords() {
    if (!detail || selectedWordIds.length === 0 || !moveTargetSetId || movingWords) return;
    const target = compatibleMoveTargets.find((set) => set.id === Number(moveTargetSetId));
    if (!target) return;
    if (!await confirmAction({ title: "Di chuyển từ?", description: `${selectedWordIds.length} từ sẽ được chuyển từ “${detail.name}” sang “${target.name}”.`, confirmLabel: "Di chuyển", tone: "warning" })) return;
    setMovingWords(true);
    try {
      const res = await fetch("/api/admin/words/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedWordIds, targetSetId: target.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "Không thể di chuyển các từ đã chọn.");
      setDetail((current) => current ? { ...current, words: current.words.filter((word) => !selectedWordIds.includes(word.id)) } : current);
      setSelectedWordIds([]);
      setMoveTargetSetId("");
      await loadSets();
      toast(`Đã di chuyển ${data.moved} từ sang “${target.name}”.`);
    } catch { toast("Không thể kết nối để di chuyển từ."); }
    finally { setMovingWords(false); }
  }

  async function navigateToSibling(id: number) {
    if (!detail || openingDetailId !== null) return;
    const hasUnsavedName = editSetName.trim() !== detail.name;
    const hasUnsavedCategory = editCategory.trim() !== (detail.category || "");
    if (hasUnsavedName || hasUnsavedCategory) {
      toast("Hãy lưu hoặc hoàn tác thay đổi trước khi chuyển sang bộ khác.");
      return;
    }
    await openDetail(id);
  }

  async function saveWord() {
    if (!detail) return;
    const isVerb = detail.type === "irregular_verb";
    const body = isVerb
      ? { meaning: wForm.meaning, v1: wForm.v1, v2: wForm.v2, v3: wForm.v3, ipaV1: wForm.ipaV1, ipaV2: wForm.ipaV2, ipaV3: wForm.ipaV3 }
      : { term: wForm.term, meaning: wForm.meaning, example: wForm.example, wtype: wForm.wtype, ipa: wForm.ipa };
    const res = await fetch(`/api/admin/sets/${detail.id}/words`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return toast(err.error || "Không thể thêm từ.");
    }
    toast("Đã thêm từ.");
    setWForm({ meaning: "", v1: "", v2: "", v3: "", ipaV1: "", ipaV2: "", ipaV3: "", term: "", example: "", wtype: "", ipa: "" });
    setShowAddWord(false);
    openDetail(detail.id);
    loadSets();
  }

  async function deleteWord(wordId: number) {
    if (!detail) return;
    const target = detail.words.find((word) => word.id === wordId);
    const label = target?.term || target?.v1 || target?.meaning || "từ này";
    if (!await confirmAction({ title: "Xóa từ khỏi bộ?", description: `“${label}” sẽ bị xóa khỏi bộ từ. Hành động này không thể hoàn tác.`, confirmLabel: "Xóa từ", tone: "danger" })) return;
    try {
      const res = await fetch(`/api/admin/words/${wordId}`, { method: "DELETE" });
      if (!res.ok) return toast("Không thể xoá từ.");
      setSelectedWordIds((current) => current.filter((id) => id !== wordId));
      setDetail((current) => current ? { ...current, words: current.words.filter((word) => word.id !== wordId) } : current);
      toast("Đã xoá từ.");
      loadSets();
    } catch {
      toast("Không thể kết nối để xoá từ.");
    }
  }

  async function deleteSelectedWords() {
    if (!detail || selectedWordIds.length === 0 || bulkDeletingWords) return;
    if (!await confirmAction({ title: "Xóa các từ đã chọn?", description: `${selectedWordIds.length} từ sẽ bị xóa khỏi “${detail.name}”. Hành động này không thể hoàn tác.`, confirmLabel: "Xóa các từ", tone: "danger" })) return;
    setBulkDeletingWords(true);
    try {
      const res = await fetch("/api/admin/words/bulk", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selectedWordIds }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "Không thể xóa các từ đã chọn.");
      setDetail((current) => current ? { ...current, words: current.words.filter((word) => !selectedWordIds.includes(word.id)) } : current);
      setSelectedWordIds([]);
      await loadSets();
      toast(`Đã xóa ${data.deleted || 0} từ.`);
    } catch { toast("Không thể kết nối để xóa các từ đã chọn."); }
    finally { setBulkDeletingWords(false); }
  }

  function startEditWord(w: Word) {
    setEditingWordId(w.id);
    setEditForm({
      meaning: w.meaning || "",
      v1: w.v1 || "",
      v2: w.v2 || "",
      v3: w.v3 || "",
      ipaV1: w.ipaV1 || "",
      ipaV2: w.ipaV2 || "",
      ipaV3: w.ipaV3 || "",
      term: w.term || "",
      example: w.example || "",
      wtype: w.wtype || "",
      ipa: w.ipa || "",
    });
  }

  function cancelEditWord() {
    setEditingWordId(null);
  }

  async function closeDetail() {
    // A child editor handles Escape/overlay first; keep the parent open behind it.
    if (showAddWord || editingWordId !== null) return;
    if (detail && editSetName.trim() !== detail.name && !await confirmAction({ title: "Bỏ thay đổi chưa lưu?", description: "Tên bộ từ đã thay đổi nhưng chưa được lưu.", confirmLabel: "Bỏ thay đổi", tone: "warning" })) return;
    setDetail(null);
    setFocusedWordId(null);
    setDetailWordQuery("");
  }

  async function saveSetName() {
    if (!detail || savingSetName) return;
    const name = editSetName.trim();
    if (!name) return toast("Tên bộ từ vựng không được để trống.");
    if (name === detail.name) return;

    setSavingSetName(true);
    try {
      const res = await fetch(`/api/sets/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "Không thể đổi tên bộ từ vựng.");
      const savedName = data.set?.name || name;
      setDetail((current) => (current ? { ...current, name: savedName } : current));
      setEditSetName(savedName);
      loadSets();
      toast("Đã đổi tên bộ từ vựng.");
    } catch {
      toast("Không thể kết nối để đổi tên bộ từ vựng.");
    } finally {
      setSavingSetName(false);
    }
  }

  async function saveCategory() {
    if (!detail) return;
    const category = editCategory.trim();
    const res = await fetch(`/api/sets/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: category || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error || "Không thể cập nhật danh mục.");
    setDetail((current) => current ? { ...current, category: data.set?.category || null } : current);
    setEditCategory(data.set?.category || "");
    await Promise.all([loadSets(), loadCategories()]);
    toast(category ? `Đã chuyển bộ từ vào danh mục “${category}”.` : "Đã bỏ bộ từ khỏi danh mục.");
  }

  async function fetchIpaForWord(wordId: number) {
    setFetchingIpaId(wordId);
    const res = await fetch(`/api/admin/words/${wordId}/fetch-ipa`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setFetchingIpaId(null);
    if (!res.ok) return toast(data.error || "Không lấy được phiên âm.");
    toast(`Đã lấy phiên âm: ${data.ipa}`);
    if (detail) openDetail(detail.id);
  }

  async function fetchIpaForSet(force: boolean) {
    if (!detail) return;
    setBulkIpaLoading(true);
    const res = await fetch(`/api/admin/sets/${detail.id}/fetch-ipa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });
    const data = await res.json().catch(() => ({}));
    setBulkIpaLoading(false);
    if (!res.ok) return toast(data.error || "Không thể lấy phiên âm cho cả bộ.");
    if (data.errors && data.errors.length > 0) {
      toast(`Đã lấy được ${data.updated}/${data.total} từ trước khi dừng: ${data.errors[0]}`);
    } else {
      toast(`Đã lấy phiên âm cho ${data.updated}/${data.total} từ.`);
    }
    openDetail(detail.id);
  }

  async function saveEditWord() {
    if (!detail || editingWordId === null) return;
    const isVerb = detail.type === "irregular_verb";
    const body = isVerb
      ? { meaning: editForm.meaning, v1: editForm.v1, v2: editForm.v2, v3: editForm.v3, ipaV1: editForm.ipaV1, ipaV2: editForm.ipaV2, ipaV3: editForm.ipaV3 }
      : { term: editForm.term, meaning: editForm.meaning, example: editForm.example, wtype: editForm.wtype, ipa: editForm.ipa };
    const res = await fetch(`/api/admin/words/${editingWordId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return toast(err.error || "Không thể lưu thay đổi.");
    }
    toast("Đã lưu thay đổi.");
    setEditingWordId(null);
    openDetail(detail.id);
  }

  return (
    <div className={cx.panel}>
      {confirmDialog}
      <h2 className={cx.h2}>Các bộ từ vựng</h2>
      <div className={cx.desc}>
        Quản lý các bộ từ vựng dùng để kiểm tra. Bạn có thể thêm bộ mới, hoặc nhập nhanh bằng CSV/Excel ở tab
        &quot;Nhập dữ liệu&quot;.
      </div>

      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">⌕</span>
          <input
            type="search"
            className={`${cx.input} !mb-0 !pl-9`}
            placeholder="Tìm theo tên bộ, loại hoặc lớp..."
            aria-label="Tìm bộ từ vựng"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setShowCategoryManager(true)}>
            📁 Quản lý danh mục
          </button>
          <button className={`${cx.btn} ${cx.btnGold}`} onClick={openNewSetForm}>
            + Tạo bộ từ vựng mới
          </button>
        </div>
      </div>
      {sets && categories.length > 0 && (
        <section className="mb-5 rounded-[14px] border border-line bg-[#FBFAFE] p-3 sm:p-4" aria-label="Trình duyệt thư mục bộ từ">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <nav className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm" aria-label="Đường dẫn thư mục">
              <button type="button" className={`rounded-lg px-2 py-1 font-bold ${selectedCategory === ALL_CATEGORIES ? "bg-[#7865EE] text-white" : "text-[#6550DB] hover:bg-[#F0EDFF]"}`} onClick={() => setSelectedCategory(ALL_CATEGORIES)}>Tất cả bộ từ</button>
              {selectedCategory === UNCATEGORIZED && <><span className="text-muted">/</span><span className="rounded-lg bg-[#7865EE] px-2 py-1 font-bold text-white">Chưa phân loại</span></>}
              {categoryBreadcrumbs.map((item, index) => <span key={item.path} className="flex items-center gap-1.5"><span className="text-muted">/</span><button type="button" className={`max-w-[190px] truncate rounded-lg px-2 py-1 font-bold ${index === categoryBreadcrumbs.length - 1 ? "bg-[#7865EE] text-white" : "text-[#6550DB] hover:bg-[#F0EDFF]"}`} onClick={() => setSelectedCategory(item.path)}>{item.label}</button></span>)}
            </nav>
            {selectedCategory !== ALL_CATEGORIES && selectedCategory !== UNCATEGORIZED && <button type="button" className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3 !py-1.5 text-xs`} onClick={() => { setManagerParentPath(selectedCategory); setManagerNewName(""); setShowCategoryManager(true); }}>+ Tạo thư mục con</button>}
          </div>
          {(childCategories.length > 0 || selectedCategory === ALL_CATEGORIES) && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {childCategories.map(([path, count]) => <FolderCard key={path} name={path.split(" / ").pop() || path} count={count} dragging={draggingSetId !== null} onClick={() => setSelectedCategory(path)} onDrop={draggingSetId !== null ? () => void moveSetToCategory(draggingSetId, path) : undefined} />)}
            {selectedCategory === ALL_CATEGORIES && categories.some(([path]) => path === UNCATEGORIZED) && <FolderCard name="Chưa phân loại" count={categories.find(([path]) => path === UNCATEGORIZED)?.[1] || 0} dragging={draggingSetId !== null} onClick={() => setSelectedCategory(UNCATEGORIZED)} onDrop={draggingSetId !== null ? () => void moveSetToCategory(draggingSetId, UNCATEGORIZED) : undefined} muted />}
          </div>}
          {selectedCategory !== ALL_CATEGORIES && selectedCategory !== UNCATEGORIZED && childCategories.length === 0 && <p className="text-xs text-muted">Thư mục này chưa có thư mục con. Bạn có thể tạo mới hoặc xem các bộ từ bên dưới.</p>}
          {draggingSetId !== null && <p className="mt-2 text-xs font-semibold text-[#6550DB]">Thả bộ từ vào thư mục đích để di chuyển.</p>}
        </section>
      )}

      {selectedCategory !== ALL_CATEGORIES && selectedCategory !== UNCATEGORIZED && (
        <section className="mb-5 rounded-[14px] border border-line bg-white p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="text-sm font-bold text-ink">Tài liệu PDF & Word</h3><p className="mt-1 text-xs text-muted">Tài liệu trong thư mục này và toàn bộ thư mục con sẽ được gom tại đây. File lớn được tự chia nhỏ khi tải lên nên không còn giới hạn 4–10 MB.{hasAggregatedCategoryDocuments ? " Danh sách tổng hợp được đánh số liên tục, không làm đổi tên trong thư mục con." : ""}</p></div>
            <span className="rounded-full bg-[#F0EDFF] px-2.5 py-1 text-xs font-bold text-[#6550DB]">{categoryDocuments.length} tài liệu</span>
          </div>
          <div className="grid gap-3 rounded-xl border border-line bg-[#FBFAFE] p-3 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:items-end">
            <label><span className={cx.label}>Tên tài liệu (chỉ áp dụng khi chọn 1 file)</span><input className={`${cx.input} !mb-0`} placeholder="VD: Tổng quan từ vựng sức khỏe" value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} maxLength={256} /></label>
            <div>
              <span className={cx.label}>Chọn hoặc kéo thả nhiều PDF / Word · tải file lớn theo từng phần</span>
              <div
                className={`relative rounded-xl border-2 border-dashed px-4 py-4 text-center transition ${documentDragActive ? "border-[#7865EE] bg-[#F0EDFF]" : "border-[#CFC7FF] bg-white hover:border-[#AFA2FF]"}`}
                onDragEnter={(event) => { event.preventDefault(); setDocumentDragActive(true); }}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDocumentDragActive(true); }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDocumentDragActive(false); }}
                onDrop={(event) => { event.preventDefault(); setDocumentDragActive(false); addDocumentFiles(Array.from(event.dataTransfer.files)); }}
              >
                <input id="category-document-file" multiple type="file" accept={SUPPORTED_DOCUMENT_ACCEPT} className="sr-only" onChange={(event) => { addDocumentFiles(Array.from(event.target.files || [])); event.target.value = ""; }} />
                <label htmlFor="category-document-file" className="cursor-pointer"><span className="text-2xl" aria-hidden="true">⇧</span><b className="mt-1 block text-sm text-ink">Kéo thả PDF, DOCX hoặc DOC vào đây</b><span className="mt-1 block text-xs text-muted">hoặc <span className="font-bold text-[#6550DB]">chọn file từ thiết bị</span> · không còn giới hạn 10 MB</span></label>
              </div>
            </div>
          </div>
          {documentFiles.length > 0 && <div className="mt-3 rounded-xl border border-line bg-white p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold text-ink">Đã chọn {documentFiles.length} file · {(documentFiles.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(2)} MB</span><button type="button" disabled={documentUploading} className="text-xs font-bold text-bad hover:underline disabled:opacity-40" onClick={() => setDocumentFiles([])}>Xóa tất cả</button></div><div className="grid gap-1.5 sm:grid-cols-2">{documentFiles.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`} className="flex min-w-0 items-center gap-2 rounded-lg bg-[#FBFAFE] px-2.5 py-2 text-xs"><span className={`font-bold ${documentKind(file.name) === "PDF" ? "text-[#B64242]" : "text-[#3565A8]"}`}>{documentKind(file.name)}</span><span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span><span className="shrink-0 text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</span><button type="button" disabled={documentUploading} className="px-1 text-muted hover:text-bad disabled:opacity-40" aria-label={`Xóa ${file.name}`} onClick={() => setDocumentFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div>{documentUploadProgress && <div className="mt-3" role="status"><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-semibold">File {documentUploadProgress.fileIndex}/{documentUploadProgress.totalFiles}: {documentUploadProgress.fileName}</span><b>{documentUploadProgress.percent}%</b></div><div className="h-2 overflow-hidden rounded-full bg-[#EBEAF2]"><div className="h-full rounded-full bg-[#7865EE] transition-[width] duration-200" style={{ width: `${documentUploadProgress.percent}%` }} /></div></div>}<button type="button" className={`${cx.btn} ${cx.btnGold} mt-3 min-h-11 w-full`} disabled={documentUploading} onClick={() => void uploadCategoryDocument()}>{documentUploading ? `Đang tải ${documentUploadProgress?.percent || 0}%…` : `↑ Tải ${documentFiles.length} tài liệu lên`}</button></div>}
          {!documentsLoading && categoryDocuments.length > 0 && <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
            <input type="search" value={documentQuery} onChange={(event) => setDocumentQuery(event.target.value)} className={`${cx.input} !mb-0`} placeholder="Tìm theo tên tài liệu, file hoặc thư mục..." aria-label="Tìm tài liệu PDF hoặc Word" />
            <select value={documentSort} onChange={(event) => setDocumentSort(event.target.value as DocumentSort)} className={`${cx.input} !mb-0`} aria-label="Sắp xếp tài liệu">
              <option value="name">{hasAggregatedCategoryDocuments ? "Thư mục → thứ tự tài liệu" : "Tên A → Z"}</option><option value="newest">Mới tải lên trước</option><option value="oldest">Cũ nhất trước</option><option value="size">Dung lượng lớn trước</option>
            </select>
          </div>}
          {documentsLoading ? <p className="mt-3 text-xs text-muted">Đang tải tài liệu...</p> : categoryDocuments.length === 0 ? <p className="mt-3 text-sm text-muted">Thư mục này và các thư mục con chưa có tài liệu PDF hoặc Word.</p> : visibleCategoryDocuments.length === 0 ? <p className="mt-3 text-sm text-muted">Không tìm thấy tài liệu phù hợp.</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visibleCategoryDocuments.map((document) => <article key={document.id} className="rounded-xl border border-line bg-[#FBFAFE] p-3">
              <div className="flex items-start gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold ${documentKind(document.fileName) === "PDF" ? "bg-[#FFF1F1] text-[#B64242]" : "bg-[#EAF2FF] text-[#3565A8]"}`} aria-hidden="true">{documentKind(document.fileName)}</span><div className="min-w-0"><div className="flex min-w-0 items-center gap-1.5"><b className="block min-w-0 truncate text-sm text-ink" title={document.displayTitle}>{document.displayTitle}</b>{document.aggregateOrder !== null && <span className="shrink-0 rounded-full bg-[#F0EDFF] px-1.5 py-0.5 text-[0.62rem] font-bold text-[#6550DB]">Số tổng hợp</span>}</div><span className="mt-0.5 block truncate text-xs text-muted" title={document.displayFileName}>{document.displayFileName} · {(document.fileSize / 1024 / 1024).toFixed(2)} MB</span>{document.category !== selectedCategory && <><span className="mt-1 block truncate text-[0.7rem] font-semibold text-[#6550DB]" title={document.category}>Từ thư mục: {document.category}</span><span className="mt-0.5 block truncate text-[0.68rem] text-muted" title={document.fileName}>Tên trong thư mục con: {document.fileName}</span></>}</div></div>
              <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={`${cx.btn} ${cx.btnGold} flex-1 !px-3 !py-1.5`} onClick={() => setViewingDocument(document)}>Mở xem</button><a className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} href={`/api/admin/category-documents/${document.id}/file`} target="_blank" rel="noopener noreferrer">Tab mới</a><label className={`${cx.btn} ${cx.btnGhost} cursor-pointer !px-3 !py-1.5 ${replacingDocumentId !== null ? "pointer-events-none opacity-50" : ""}`}>{replacingDocumentId === document.id ? `Đang thay ${documentUploadProgress?.percent || 0}%` : "Thay file"}<input className="sr-only" type="file" accept={SUPPORTED_DOCUMENT_ACCEPT} disabled={replacingDocumentId !== null} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void replaceCategoryDocument(document, file); }} /></label><button type="button" className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={() => startRenameDocument(document)}>Đổi tên</button><button type="button" className="px-2 text-xs font-bold text-bad" onClick={() => void deleteCategoryDocument(document)}>Xóa</button></div>
            </article>)}
          </div>}
        </section>
      )}

      {selectedCategory !== ALL_CATEGORIES && selectedCategory !== UNCATEGORIZED && (
        <section className="mb-5 rounded-[14px] border border-line bg-white p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="text-sm font-bold text-ink">Ngân hàng câu hỏi</h3><p className="mt-1 text-xs text-muted">Hỗ trợ IELTS Speaking, trắc nghiệm A–D và tự luận có đáp án mẫu.</p></div>
            <div className="flex items-center gap-2"><button type="button" role="switch" aria-checked={spellCheckEnabled} onClick={() => changeSpellCheck(!spellCheckEnabled)} className={`min-h-8 rounded-lg border px-2.5 text-xs font-bold ${spellCheckEnabled ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-line bg-white text-muted"}`}>Chính tả: {spellCheckEnabled ? "Bật" : "Tắt"}</button><span className="rounded-full bg-[#F0EDFF] px-2.5 py-1 text-xs font-bold text-[#6550DB]">{questionsLoading ? "..." : categoryQuestions.length + " câu hỏi"}</span></div>
          </div>
          <div className="mb-4 rounded-xl border border-[#DDD8FF] bg-[#F8F7FF] p-3"><div className="mb-2"><b className="text-xs text-ink">Smart Bulk Import / Export</b><p className="mt-0.5 text-[0.7rem] text-muted">Paste thông minh, Excel, PDF, lịch sử batch và Undo Import.</p></div><QuestionImportExportTools category={selectedCategory} questions={categoryQuestions} onChanged={refreshCategoryQuestions} /></div>
          <div className="mb-4 rounded-xl border border-[#D8E7E0] bg-[#F7FCF9] p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><b className="text-xs text-ink">Xáo trộn khi làm bài</b><p className="mt-0.5 text-[0.7rem] text-muted">Thứ tự được tạo một lần cho từng lượt làm và giữ nguyên khi tải lại trang.</p></div>
              <button type="button" className={`${cx.btn} ${cx.btnGold} !min-h-9 !px-3`} disabled={savingQuestionShuffle} onClick={() => void saveQuestionShuffleSettings()}>{savingQuestionShuffle ? "Đang lưu…" : "Lưu cài đặt"}</button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
              <label className="flex cursor-pointer items-center gap-2 font-semibold"><input type="checkbox" checked={questionShuffleSettings.shuffleQuestions} onChange={(event) => setQuestionShuffleSettings((current) => ({ ...current, shuffleQuestions: event.target.checked }))} /> Đảo thứ tự câu hỏi</label>
              <label className="flex cursor-pointer items-center gap-2 font-semibold"><input type="checkbox" checked={questionShuffleSettings.shuffleOptions} onChange={(event) => setQuestionShuffleSettings((current) => ({ ...current, shuffleOptions: event.target.checked }))} /> Đảo thứ tự đáp án</label>
              <label className="flex items-center gap-2 font-semibold">Chế độ <select className={`${cx.input} !mb-0 !min-h-8 !w-auto !py-1`} disabled={!questionShuffleSettings.shuffleOptions} value={questionShuffleSettings.shuffleMode} onChange={(event) => setQuestionShuffleSettings((current) => ({ ...current, shuffleMode: event.target.value as QuestionShuffleMode }))}><option value="random">Ngẫu nhiên</option><option value="balanced">Cân bằng vị trí đáp án đúng</option></select></label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#D8E7E0] pt-3">
              <span className="mr-1 text-[0.7rem] font-bold text-muted">Phân bố đáp án hiện tại:</span>
              {Object.entries(answerDistribution).map(([label, count]) => <span key={label} className="rounded-full border border-[#CFE0D7] bg-white px-2.5 py-1 text-xs font-bold text-ink">{label}: {count}</span>)}
              {!shuffleQuestions.length && <span className="text-xs text-muted">Chưa có MCQ hợp lệ.</span>}
              <div className="ml-auto flex flex-wrap gap-2"><button type="button" className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3`} disabled={!shuffleQuestions.length} onClick={() => previewOptionShuffle("random")}>Preview xáo trộn</button><button type="button" className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3`} disabled={!shuffleQuestions.length} onClick={() => previewOptionShuffle("balanced")}>Preview cân bằng đáp án</button></div>
            </div>
          </div>
          <div className="mb-4 grid gap-2 rounded-xl border border-line bg-white p-3 sm:grid-cols-3"><label><span className={cx.label}>Tìm nhanh</span><input className={`${cx.input} !mb-0`} type="search" placeholder="Câu hỏi, đáp án, tag…" value={questionQuery} onChange={(event) => { setQuestionQuery(event.target.value); setQuestionPage(0); }} /></label><label><span className={cx.label}>Loại</span><select className={`${cx.input} !mb-0`} value={questionTypeFilter} onChange={(event) => { setQuestionTypeFilter(event.target.value); setQuestionPage(0); }}><option value="all">Tất cả</option><option value="multiple_choice">Trắc nghiệm</option><option value="essay">Tự luận</option><option value="speaking">IELTS Speaking</option></select></label><label><span className={cx.label}>Độ khó</span><select className={`${cx.input} !mb-0`} value={questionDifficultyFilter} onChange={(event) => { setQuestionDifficultyFilter(event.target.value); setQuestionPage(0); }}><option value="all">Tất cả</option><option value="easy">Dễ</option><option value="medium">Trung bình</option><option value="hard">Khó</option><option value="unset">Chưa đặt</option></select></label></div>
          {selectedQuestionIds.length > 0 && <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#CFC7FF] bg-[#F5F2FF] p-3"><b className="mr-auto text-xs">Đã chọn {selectedQuestionIds.length} câu</b><button className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3`} onClick={() => previewOptionShuffle("random", true)}>Xáo trộn đáp án</button><button className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3`} onClick={() => previewOptionShuffle("balanced", true)}>Cân bằng vị trí đúng</button><select className={`${cx.input} !mb-0 !min-h-9 !w-auto`} value={questionBulkDifficulty} onChange={(event) => setQuestionBulkDifficulty(event.target.value)}><option value="">Độ khó…</option><option value="easy">Dễ</option><option value="medium">Trung bình</option><option value="hard">Khó</option></select><input className={`${cx.input} !mb-0 !min-h-9 !w-36`} placeholder="tag1, tag2" value={questionBulkTags} onChange={(event) => setQuestionBulkTags(event.target.value)} /><button className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3`} onClick={() => void updateQuestionBulkMetadata()}>Đổi metadata</button><button className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3`} onClick={() => void exportSelectedQuestions()}>Export</button><select className={`${cx.input} !mb-0 !min-h-9 !w-auto`} value={questionBulkTarget} onChange={(event) => setQuestionBulkTarget(event.target.value)}><option value="">Thư mục đích…</option>{categoryOptions.filter((item) => item.name !== selectedCategory).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select><button className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3`} onClick={() => void runQuestionBulk("move")}>Move</button><button className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3`} onClick={() => void runQuestionBulk("copy")}>Copy</button><button className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3`} onClick={() => void runQuestionBulk("duplicate")}>Duplicate</button><button className={`${cx.btn} ${cx.btnDanger} !min-h-9 !px-3`} onClick={() => void runQuestionBulk("delete")}>Delete</button></div>}
          <div className="mb-4 rounded-xl border border-line bg-[#FBFAFE] p-3">
            <div className="mb-3">
              <label className={cx.label}>Dạng câu hỏi</label>
              <select className={`${cx.input} !mb-0`} value={newQuestionType} onChange={(event) => setNewQuestionType(event.target.value as QuestionType)}>
                <option value="speaking">IELTS Speaking</option>
                <option value="multiple_choice">Trắc nghiệm A–D</option>
                <option value="essay">Tự luận</option>
              </select>
            </div>
            <div className="mb-3">
              <label className={cx.label}>Câu hỏi (hỗ trợ Markdown)</label>
              <textarea className={`${cx.input} !mb-0 min-h-[80px]`} placeholder="Describe a time when you..." value={newQuestionText} onChange={(event) => setNewQuestionText(event.target.value)} spellCheck={spellCheckEnabled} lang="vi" />
            </div>
            {newQuestionType === "multiple_choice" && <div className="mb-3 grid gap-2 sm:grid-cols-2">
              {newOptions.map((option, optionIndex) => <label key={optionIndex}><span className={cx.label}>Lựa chọn {String.fromCharCode(65 + optionIndex)}</span><input className={`${cx.input} !mb-0`} value={option} onChange={(event) => setNewOptions((current) => current.map((item, index) => index === optionIndex ? event.target.value : item))} spellCheck={spellCheckEnabled} lang="vi" /></label>)}
              <label className="sm:col-span-2"><span className={cx.label}>Đáp án đúng</span><select className={`${cx.input} !mb-0`} value={newCorrectOption} onChange={(event) => setNewCorrectOption(event.target.value)}>{["A", "B", "C", "D"].map((letter) => <option key={letter}>{letter}</option>)}</select></label>
            </div>}
            <div className="mb-3">
                          {newQuestionType === "speaking" && <><div className="mb-3">
              <label className={cx.label}>Phiên âm IPA (không bắt buộc)</label>
              <textarea className={`${cx.input} !mb-0 min-h-[60px]`} placeholder="/wɜːd/" value={newPhonetic} onChange={(event) => setNewPhonetic(event.target.value)} spellCheck={false} />
            </div>
            <div className="mb-3">
              <label className={cx.label}>Nghĩa tiếng Việt (không bắt buộc)</label>
              <textarea className={`${cx.input} !mb-0 min-h-[60px]`} placeholder="Một trải nghiệm mà tôi nhớ đến là..." value={newVnMeaning} onChange={(event) => setNewVnMeaning(event.target.value)} spellCheck={spellCheckEnabled} lang="vi" />
            </div></>}<label className={cx.label}>{newQuestionType === "multiple_choice" ? "Giải thích đáp án (không bắt buộc)" : "Đáp án mẫu — gợi ý cho học sinh (hỗ trợ Markdown)"}</label>
              <textarea className={`${cx.input} !mb-0 min-h-[120px]`} placeholder="One experience that comes to mind is..." value={newAnswerText} onChange={(event) => setNewAnswerText(event.target.value)} spellCheck={spellCheckEnabled} lang="vi" />
            </div>
            <button className={`${cx.btn} ${cx.btnGold} w-full`} disabled={savingQuestion || !newQuestionText.trim()} onClick={addCategoryQuestion}>
              {savingQuestion ? "Đang thêm..." : "+ Thêm câu hỏi"}
            </button>
          </div>
          {questionsLoading ? <p className="text-xs text-muted">Đang tải câu hỏi...</p> : categoryQuestions.length === 0 ? (
            <p className="text-sm text-muted">Thư mục này chưa có câu hỏi nào. Hãy thêm câu hỏi ở phía trên.</p>
          ) : filteredCategoryQuestions.length === 0 ? (
            <p className="text-sm text-muted">Không có câu hỏi phù hợp với bộ lọc.</p>
          ) : (
            <div className="space-y-3">
              {pagedCategoryQuestions.map((q) => {
                const index = categoryQuestions.indexOf(q);
                const isEditing = editingQuestionId === q.id;
                const isCollapsed = collapsedQuestions.has(q.id);
                return (
                  <article key={q.id} className={`rounded-xl border ${isEditing ? "border-[#7865EE] bg-[#F5F2FF]" : "border-line bg-[#FBFAFE]"} p-3`}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <input type="checkbox" checked={selectedQuestionIds.includes(q.id)} aria-label={`Chọn câu hỏi ${index + 1}`} onChange={(event) => setSelectedQuestionIds((current) => event.target.checked ? [...current, q.id] : current.filter((id) => id !== q.id))} />
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#EFECFF] text-xs font-bold text-[#6550DB]">{index + 1}</span>
                        <span className="text-xs font-bold text-muted">Câu hỏi #{q.id}</span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[0.65rem] font-bold text-[#6550DB]">{q.questionType === "multiple_choice" ? "Trắc nghiệm" : q.questionType === "essay" ? "Tự luận" : "Speaking"}</span>
                        {q.difficulty && <span className="rounded-full bg-[#FFF6D9] px-2 py-0.5 text-[0.65rem] font-bold text-[#8A6814]">{q.difficulty === "easy" ? "Dễ" : q.difficulty === "medium" ? "Trung bình" : "Khó"}</span>}
                        {q.speakingPart && <span className="rounded-full bg-[#E7F7F2] px-2 py-0.5 text-[0.65rem] font-bold text-[#277A4B]">{String(q.speakingPart).replace("part_", "Part ")}{q.topic ? ` · ${q.topic}` : ""}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" className="h-7 w-7 rounded border border-line bg-white text-xs disabled:opacity-30" disabled={index === 0} onClick={() => moveQuestionOrder(q.id, -1)} aria-label="Lên trước">↑</button>
                        <button type="button" className="h-7 w-7 rounded border border-line bg-white text-xs disabled:opacity-30" disabled={index === categoryQuestions.length - 1} onClick={() => moveQuestionOrder(q.id, 1)} aria-label="Xuống sau">↓</button>
                        <button type="button" className="h-7 w-7 rounded border border-line bg-white text-xs" onClick={() => toggleQuestionCollapse(q.id)} aria-label={isCollapsed ? "Mở rộng" : "Thu gọn"}>
                          {isCollapsed ? "▶" : "▼"}
                        </button>
                      </div>
                    </div>
                    {isEditing ? (
                      <div className="space-y-2">
                        <select className={`${cx.input} !mb-0`} value={editQuestionType} onChange={(event) => setEditQuestionType(event.target.value as QuestionType)}><option value="speaking">IELTS Speaking</option><option value="multiple_choice">Trắc nghiệm A–D</option><option value="essay">Tự luận</option></select>
                        <textarea className={`${cx.input} !mb-0 min-h-[80px]`} value={editQuestionText} onChange={(event) => setEditQuestionText(event.target.value)} spellCheck={spellCheckEnabled} lang="vi" />
                        {editQuestionType === "multiple_choice" && <div className="grid gap-2 sm:grid-cols-2">{editOptions.map((option, optionIndex) => <input key={optionIndex} aria-label={`Lựa chọn ${String.fromCharCode(65 + optionIndex)}`} placeholder={`${String.fromCharCode(65 + optionIndex)}.`} className={`${cx.input} !mb-0`} value={option} onChange={(event) => setEditOptions((current) => current.map((item, index) => index === optionIndex ? event.target.value : item))} spellCheck={spellCheckEnabled} lang="vi" />)}<select className={`${cx.input} !mb-0 sm:col-span-2`} value={editCorrectOption} onChange={(event) => setEditCorrectOption(event.target.value)}>{["A", "B", "C", "D"].map((letter) => <option key={letter} value={letter}>Đáp án đúng: {letter}</option>)}</select></div>}
                        <textarea className={`${cx.input} !mb-0 min-h-[100px]`} value={editAnswerText} onChange={(event) => setEditAnswerText(event.target.value)} spellCheck={spellCheckEnabled} lang="vi" />
                        <textarea className={`${cx.input} !mb-0 min-h-[60px]`} placeholder="Phiên âm IPA" value={editPhonetic} onChange={(event) => setEditPhonetic(event.target.value)} spellCheck={false} />
                        <textarea className={`${cx.input} !mb-0 min-h-[60px]`} placeholder="Nghĩa tiếng Việt" value={editVnMeaning} onChange={(event) => setEditVnMeaning(event.target.value)} spellCheck={spellCheckEnabled} lang="vi" />
                        <div className="flex gap-2">
                          <button className={`${cx.btn} ${cx.btnGold} !px-3 !py-1.5`} disabled={savingQuestion || !editQuestionText.trim()} onClick={() => saveQuestionEdit(q.id)}>{savingQuestion ? "Đang lưu..." : "Lưu"}</button>
                          <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={() => { setEditingQuestionId(null); }}>Hủy</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="prose prose-sm max-w-none text-sm leading-relaxed whitespace-pre-wrap">{q.question}</div>
                        {q.questionType === "multiple_choice" && !isCollapsed && <div className="mt-2 grid gap-1.5 sm:grid-cols-2">{(() => { try { const options = JSON.parse(q.options || "[]"); const correct = JSON.parse(q.correctOptions || "[]"); return options.map((option: string, optionIndex: number) => <div key={optionIndex} className={`rounded-lg border px-3 py-2 text-sm ${(correct.length ? correct : [q.correctOption]).includes(String.fromCharCode(65 + optionIndex)) ? "border-green-300 bg-green-50" : "border-line bg-white"}`}><b>{String.fromCharCode(65 + optionIndex)}.</b> {option}</div>); } catch { return null; } })()}</div>}
                        {!isCollapsed && (() => { try { const tags = JSON.parse(q.tags || "[]"); return tags.length ? <div className="mt-2 flex flex-wrap gap-1">{tags.map((tag: string) => <span key={tag} className="rounded-full bg-[#F1EFF8] px-2 py-0.5 text-[0.65rem] text-muted">#{tag}</span>)}</div> : null; } catch { return null; } })()}
                        {!isCollapsed && q.explanation && <div className="mt-2 line-clamp-2 rounded-lg bg-white px-3 py-2 text-xs text-muted"><b>Giải thích:</b> {q.explanation}</div>}
                        {q.answer && !isCollapsed && (
                          <div className="mt-2 rounded-lg border border-dashed border-gold bg-goldpale/30 px-3 py-2">
                            <div className="mb-1 text-[0.7rem] font-bold uppercase tracking-wider text-golddark">Gợi ý trả lời mẫu</div>
                            <div className="prose prose-sm max-w-none text-sm leading-relaxed whitespace-pre-wrap">{q.answer}</div>
                          </div>
                        )}
                        <div className="mt-2 flex gap-2">
                          <button className="text-xs font-bold text-[#6550DB] hover:underline" onClick={() => { setEditingQuestionId(q.id); setEditQuestionText(q.question); setEditAnswerText(q.answer || ""); setEditPhonetic(q.phonetic || ""); setEditVnMeaning(q.vnMeaning || ""); setEditQuestionType(q.questionType || "speaking"); try { const parsed = JSON.parse(q.options || "[]"); setEditOptions(parsed.length === 4 ? parsed : ["", "", "", ""]); } catch { setEditOptions(["", "", "", ""]); } setEditCorrectOption(q.correctOption || "A"); }}>Sửa</button>
                          <a href={`/writing?category=${encodeURIComponent(selectedCategory)}`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-green-700 hover:underline ml-2">Luyện viết</a>
                          <button className="text-xs font-bold text-bad hover:underline" onClick={() => deleteCategoryQuestion(q.id)}>Xóa</button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
              <div className="flex items-center justify-between gap-3 pt-2"><span className="text-xs text-muted">Hiển thị {questionPage * QUESTION_PAGE_SIZE + 1}–{Math.min((questionPage + 1) * QUESTION_PAGE_SIZE, filteredCategoryQuestions.length)} / {filteredCategoryQuestions.length}</span><div className="flex gap-2"><button className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3`} disabled={questionPage === 0} onClick={() => setQuestionPage((page) => page - 1)}>Trước</button><span className="flex items-center text-xs font-bold">{questionPage + 1}/{questionPageCount}</span><button className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3`} disabled={questionPage >= questionPageCount - 1} onClick={() => setQuestionPage((page) => page + 1)}>Sau</button></div></div>
            </div>
          )}
        </section>
      )}

      <section className="mb-6 rounded-[14px] border border-line bg-[#FBFAFE] p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-ink">Tìm từ trong tất cả bộ</h3>
            <p className="mt-1 text-xs text-muted">Tìm theo từ, nghĩa, V1/V2/V3 hoặc tên bộ để biết từ đang thuộc bộ nào.</p>
          </div>
          {wordSearchQuery.trim().length >= 2 && !wordSearchLoading && (
            <span className="text-xs font-semibold text-muted">{wordMatches.length} kết quả</span>
          )}
        </div>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">⌕</span>
          <input
            type="search"
            className={`${cx.input} !mb-0 !pl-9`}
            placeholder="Ví dụ: environment, môi trường, went..."
            aria-label="Tìm từ trong tất cả bộ"
            value={wordSearchQuery}
            onChange={(event) => setWordSearchQuery(event.target.value)}
          />
        </div>
        {wordSearchLoading && <p className="mt-3 text-xs text-muted">Đang tìm...</p>}
        {!wordSearchLoading && wordSearchQuery.trim().length > 0 && wordSearchQuery.trim().length < 2 && (
          <p className="mt-3 text-xs text-muted">Nhập ít nhất 2 ký tự để bắt đầu tìm.</p>
        )}
        {!wordSearchLoading && wordSearchQuery.trim().length >= 2 && wordMatches.length === 0 && (
          <p className="mt-3 text-sm text-muted">Không tìm thấy từ phù hợp trong các bộ hiện có.</p>
        )}
        {wordMatches.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {wordMatches.map((match) => {
              const label = match.setType === "irregular_verb"
                ? [match.v1, match.v2, match.v3].filter(Boolean).join(" · ") || match.meaning
                : match.term || match.meaning;
              return (
                <div key={`${match.setId}-${match.wordId}`} className="rounded-[11px] border border-line bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink">{label}</div>
                      <div className="mt-0.5 truncate text-xs text-muted">{match.meaning}</div>
                    </div>
                    <button
                      type="button"
                      className={`${cx.btn} ${cx.btnGhost} shrink-0 !px-2.5 !py-1.5 text-xs`}
                      onClick={() => void openDetail(match.setId, match.wordId)}
                    >
                      Mở bộ
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-semibold text-[#6550DB]">Thuộc bộ: {match.setName}</span>
                    {match.category && <span className="rounded-full bg-[#F0EDFF] px-2 py-0.5 text-[#6550DB]">📁 {match.category}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {optionShufflePreview && (
        <Modal title={optionShufflePreview.mode === "balanced" ? "Preview cân bằng vị trí đáp án đúng" : "Preview xáo trộn lựa chọn"} onClose={() => { if (!savingQuestionShuffle) setOptionShufflePreview(null); }} wide>
          <div className="grid gap-4">
            <div className="grid gap-3 rounded-xl border border-line bg-[#FBFAFE] p-3 sm:grid-cols-2">
              <div><b className="text-xs text-ink">Phân bố hiện tại</b><div className="mt-2 flex flex-wrap gap-2">{Object.entries(correctAnswerDistribution(optionShufflePreview.questions)).map(([label, count]) => <span key={label} className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-bold">{label}: {count}</span>)}</div></div>
              <div><b className="text-xs text-ink">Sau khi áp dụng</b><div className="mt-2 flex flex-wrap gap-2">{Object.entries(previewAnswerDistribution).map(([label, count]) => <span key={label} className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">{label}: {count}</span>)}</div></div>
            </div>
            <p className="text-xs text-muted">Preview dùng đúng permutation sẽ được gửi lên máy chủ. Nội dung câu hỏi/lựa chọn không đổi; đáp án đúng được remap theo stable option ID. Dưới đây là tối đa 5 câu mẫu.</p>
            <div className="max-h-[52dvh] space-y-3 overflow-y-auto pr-1">
              {optionShufflePreview.plans.slice(0, 5).map((plan) => {
                const question = optionShufflePreview.questions.find((item) => item.id === plan.id);
                if (!question) return null;
                return <article key={plan.id} className="rounded-xl border border-line p-3"><b className="block truncate text-xs text-ink">{question.questionText}</b><div className="mt-2 grid gap-3 md:grid-cols-2"><div><span className="text-[0.68rem] font-bold uppercase tracking-wide text-muted">Trước</span><div className="mt-1 space-y-1">{question.options.map((option, index) => <div key={`${plan.id}-before-${index}`} className={`truncate rounded-md px-2 py-1 text-xs ${plan.beforeCorrectPositions.includes(index) ? "bg-amber-50 font-bold text-amber-800" : "bg-[#F7F7FA]"}`}>{optionLetter(index)}. {option}{plan.beforeCorrectPositions.includes(index) ? " ✓" : ""}</div>)}</div></div><div><span className="text-[0.68rem] font-bold uppercase tracking-wide text-muted">Sau</span><div className="mt-1 space-y-1">{plan.optionOrder.map((originalIndex, displayedIndex) => { const option = question.options[originalIndex]; return <div key={`${plan.id}-after-${originalIndex}`} className={`truncate rounded-md px-2 py-1 text-xs ${plan.afterCorrectPositions.includes(displayedIndex) ? "bg-emerald-50 font-bold text-emerald-800" : "bg-[#F7F7FA]"}`}>{optionLetter(displayedIndex)}. {option}{plan.afterCorrectPositions.includes(displayedIndex) ? " ✓" : ""}</div>; })}</div></div></div></article>;
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3"><span className="text-xs font-semibold text-muted">Sẽ thay đổi thứ tự lựa chọn của {optionShufflePreview.plans.length} câu. Thao tác không sửa nội dung.</span><div className="flex gap-2"><button type="button" className={`${cx.btn} ${cx.btnGhost}`} disabled={savingQuestionShuffle} onClick={() => setOptionShufflePreview(null)}>Hủy</button><button type="button" className={`${cx.btn} ${cx.btnGold}`} disabled={savingQuestionShuffle} onClick={() => void applyOptionShuffle()}>{savingQuestionShuffle ? "Đang áp dụng…" : "Áp dụng xáo trộn"}</button></div></div>
          </div>
        </Modal>
      )}

      {viewingDocument && (
        <Modal title={viewingDocument.title} onClose={() => setViewingDocument(null)} wide>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span>{viewingDocument.fileName} · {(viewingDocument.fileSize / 1024 / 1024).toFixed(2)} MB</span><a className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} href={`/api/admin/category-documents/${viewingDocument.id}/file`} target="_blank" rel="noopener noreferrer">Mở trong tab mới</a></div>
          <DocumentPreview document={viewingDocument} version={documentPreviewVersion} />
        </Modal>
      )}

      {editingDocument && (
        <Modal title="Đổi tên tài liệu" onClose={() => { if (!savingDocumentName) setEditingDocument(null); }}>
          <div className="grid gap-4">
            <label><span className={cx.label}>Tên hiển thị</span><input autoFocus className={`${cx.input} !mb-0`} value={editDocumentTitle} maxLength={256} onChange={(event) => setEditDocumentTitle(event.target.value)} /></label>
            <div><span className={cx.label}>Tên file</span><input className={`${cx.input} !mb-0`} value={editDocumentFileName} maxLength={256} onChange={(event) => setEditDocumentFileName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveDocumentName(); }} /><span className="mt-1 block text-xs text-muted">Chỉ cần nhập tên nội dung. Khi lưu, hệ thống tự đánh số đúng thứ tự dạng 01_Tên, giữ nguyên đuôi PDF/Word và đồng bộ tên hiển thị.</span></div>
            <div className="flex justify-end gap-2"><button type="button" className={`${cx.btn} ${cx.btnGhost}`} disabled={savingDocumentName} onClick={() => setEditingDocument(null)}>Hủy</button><button type="button" className={`${cx.btn} ${cx.btnGold}`} disabled={savingDocumentName || !editDocumentTitle.trim() || !editDocumentFileName.trim()} onClick={() => void saveDocumentName()}>{savingDocumentName ? "Đang lưu..." : "Lưu tên mới"}</button></div>
          </div>
        </Modal>
      )}

      {showNewForm && (
        <Modal title="Tạo bộ từ vựng mới" onClose={closeNewForm} closeOnBackdrop={false}>
          <label className={cx.label}>Tên bộ từ vựng</label>
          <input
            className={cx.input}
            placeholder="VD: Từ vựng chủ đề Môi trường"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createSet();
            }}
            autoFocus
          />
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className={cx.label}>Danh mục / thư mục</span>
              <select className={`${cx.input} !mb-0`} value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
                <option value="">Chưa phân loại</option>
                {categoryOptions.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
              </select>
            </label>
            <button type="button" className={`${cx.btn} ${cx.btnGhost} shrink-0`} onClick={() => setShowCategoryManager(true)}>Quản lý</button>
          </div>
          <p className="mb-3 mt-1.5 text-xs text-muted">Chọn danh mục có sẵn để tránh tạo tên trùng hoặc sai chính tả.</p>
          <label className={cx.label}>Loại bài kiểm tra</label>
          <select
            className={cx.input}
            value={newType}
            onChange={(e) => setNewType(e.target.value as "ielts_vocab" | "irregular_verb")}
          >
            <option value="ielts_vocab">Từ vựng IELTS (từ — nghĩa — ví dụ)</option>
            <option value="irregular_verb">Động từ bất quy tắc (nghĩa — V1 — V2 — V3)</option>
          </select>
          <label className={cx.label}>Phạm vi hiển thị</label>
          <select className={cx.input} value={newClassId} onChange={(e) => setNewClassId(e.target.value)}>
            <option value="">Công khai — mọi học sinh đều thấy</option>
            {classesOpt.map((c) => (
              <option key={c.id} value={c.id}>
                Chỉ lớp: {c.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2.5">
            <button className={`${cx.btn} ${cx.btnGold}`} disabled={creatingSet} onClick={createSet}>
              {creatingSet ? "Đang tạo..." : "Tạo bộ từ"}
            </button>
            <button className={`${cx.btn} ${cx.btnGhost}`} disabled={creatingSet} onClick={closeNewForm}>
              Huỷ
            </button>
          </div>
        </Modal>
      )}

      {showCategoryManager && (
        <Modal title="Quản lý danh mục bộ từ" onClose={() => { if (!categorySubmitting) { setShowCategoryManager(false); setEditingCategoryId(null); } }} closeOnBackdrop={false}>
          <p className="mb-4 text-sm leading-6 text-muted">Tạo một lần rồi chọn lại khi thêm bộ từ. Đổi tên sẽ cập nhật đồng loạt; xóa sẽ đưa các bộ từ liên quan về “Chưa phân loại”.</p>
          <div className="mb-5 flex gap-2">
            <input
              className={`${cx.input} !mb-0 min-w-0 flex-1`}
              placeholder="Tên danh mục mới, ví dụ: Vocabulary"
              value={managerNewName}
              onChange={(event) => setManagerNewName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void createCategory(); }}
              maxLength={128}
              autoFocus
            />
            <button className={`${cx.btn} ${cx.btnGold} shrink-0`} disabled={categorySubmitting || !managerNewName.trim()} onClick={() => void createCategory()}>
              {categorySubmitting ? "Đang lưu..." : "+ Thêm"}
            </button>
          </div>
          <label className="mb-4 block">
            <span className={cx.label}>Danh mục cha (không bắt buộc)</span>
            <select className={`${cx.input} !mb-0`} value={managerParentPath} onChange={(event) => setManagerParentPath(event.target.value)}>
              <option value="">Tạo ở cấp cao nhất</option>
              {categoryOptions.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
            <span className="mt-1.5 block text-xs text-muted">Ví dụ: chọn Vocabulary rồi nhập Sức khỏe.</span>
          </label>
          <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
            {categoryOptions.length === 0 ? (
              <div className={cx.empty}>Chưa có danh mục. Hãy tạo danh mục đầu tiên ở phía trên.</div>
            ) : categoryOptions.map((category) => (
              <div key={category.id} className="rounded-[12px] border border-line bg-[#FBFAFE] p-3">
                {editingCategoryId === category.id ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      className={`${cx.input} !mb-0 min-w-0 flex-1`}
                      value={editingCategoryName}
                      onChange={(event) => setEditingCategoryName(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") void renameCategory(category.id); }}
                      maxLength={128}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button className={`${cx.btn} ${cx.btnGold}`} disabled={categorySubmitting || !editingCategoryName.trim() || editingCategoryName.trim() === category.name.split(" / ").pop()} onClick={() => void renameCategory(category.id)}>Lưu</button>
                      <button className={`${cx.btn} ${cx.btnGhost}`} disabled={categorySubmitting} onClick={() => setEditingCategoryId(null)}>Hủy</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#EFECFF]" aria-hidden="true">📁</span>
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-sm" style={{ paddingLeft: `${Math.max(0, category.name.split(" / ").length - 1) * 16}px` }}>{category.name}</b>
                      <span className="text-xs text-muted">{category.count} bộ từ</span>
                    </div>
                    <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-2`} disabled={categorySubmitting} onClick={() => { setEditingCategoryId(category.id); setEditingCategoryName(category.name.split(" / ").pop() || category.name); }}>Đổi tên</button>
                    <button type="button" className={`${cx.btn} ${cx.btnGhost} !px-3 !py-2`} onClick={() => setShareTarget({ targetType: "question_collection", targetId: category.id, title: category.name })}>Chia sẻ</button>
                    <button type="button" className="min-h-9 rounded-[9px] border border-[#F2D6D6] bg-white px-3 text-xs font-bold text-[#B65353] transition hover:bg-[#FFF5F5]" disabled={categorySubmitting} onClick={() => void deleteCategory(category)}>Xóa</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Modal>
      )}

      {sets !== null && filteredSets.length > 0 && (
        <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-[14px] border border-line bg-white/95 p-3 shadow-sm backdrop-blur" aria-label="Thao tác hàng loạt với bộ từ">
          <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-bold">
            <input type="checkbox" className="h-4 w-4 accent-[#7865EE]" checked={filteredSets.every((item) => selectedSetIds.includes(item.id))} onChange={(event) => setSelectedSetIds((current) => event.target.checked ? [...new Set([...current, ...filteredSets.map((item) => item.id)])] : current.filter((id) => !filteredSets.some((item) => item.id === id)))} />
            Chọn tất cả ({filteredSets.length})
          </label>
          {selectedSetIds.length > 0 && <><span className="rounded-full bg-[#F0EDFF] px-2.5 py-1 text-xs font-bold text-[#6550DB]">Đã chọn {selectedSetIds.length}</span><button type="button" className={`${cx.btn} ${cx.btnDanger} !min-h-10 !px-3 !py-1.5`} disabled={bulkDeletingSets} onClick={() => void deleteSelectedSets()}>{bulkDeletingSets ? "Đang xóa…" : `Xóa ${selectedSetIds.length} bộ`}</button><button type="button" className={`${cx.btn} ${cx.btnGhost} !min-h-10 !px-3 !py-1.5`} onClick={() => setSelectedSetIds([])}>Bỏ chọn</button></>}
          {selectedCategory !== ALL_CATEGORIES && selectedCategory !== UNCATEGORIZED && <button type="button" className={`${cx.btn} ${cx.btnGhost} ml-auto !min-h-10 !px-3 !py-1.5`} disabled={reorderingSets} onClick={() => void saveSetOrder(autoSortSetIds())}>{reorderingSets ? "Đang sắp xếp…" : "Sắp xếp tự động theo tiền tố"}</button>}
        </div>
      )}

      {sets === null ? (
        <div className={cx.empty}>Đang tải...</div>
      ) : sets.length === 0 ? (
        <div className={cx.empty}>Chưa có bộ từ vựng nào.</div>
      ) : filteredSets.length === 0 ? (
        <div className={cx.empty}>
          {childCategories.length > 0 && !searchQuery.trim() ? "Thư mục này chưa chứa bộ từ trực tiếp. Hãy mở một thư mục con ở phía trên." : "Không tìm thấy bộ từ phù hợp với bộ lọc hiện tại."}
          {!(childCategories.length > 0 && !searchQuery.trim()) && <div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={() => { setSearchQuery(""); setSelectedCategory(ALL_CATEGORIES); }}>Xoá bộ lọc</button></div>}
        </div>
      ) : (
        filteredSets.map((s) => (
          <div
            className={`${cx.setcard} ${draggingSetId === s.id ? "opacity-60 ring-2 ring-[#7865EE]/30" : ""} ${dragOverSetId === s.id ? "border-[#7865EE] shadow-[0_-3px_0_#7865EE]" : ""}`}
            key={s.id}
            onDragOver={(event) => { if (draggingSetId !== null && draggingSetId !== s.id && selectedCategory !== ALL_CATEGORIES && selectedCategory !== UNCATEGORIZED) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverSetId(s.id); } }}
            onDragLeave={() => setDragOverSetId((current) => current === s.id ? null : current)}
            onDrop={(event) => { event.preventDefault(); dropSetBefore(s.id); }}
          >
            <div className="flex min-w-0 items-start gap-3">
              {selectedCategory !== ALL_CATEGORIES && selectedCategory !== UNCATEGORIZED && <div className="flex shrink-0 flex-col items-center gap-1"><button type="button" draggable={!reorderingSets} onDragStart={(event) => { setDraggingSetId(s.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(s.id)); }} onDragEnd={() => { setDraggingSetId(null); setDragOverSetId(null); }} className="flex h-10 w-10 cursor-grab items-center justify-center rounded-lg border border-line bg-white text-lg text-muted active:cursor-grabbing" aria-label={`Kéo để sắp xếp ${s.name}`} title="Kéo để đổi vị trí">⠿</button><div className="flex gap-1"><button type="button" className="h-7 w-7 rounded border border-line bg-white text-xs disabled:opacity-30" disabled={reorderingSets || currentCategorySetIds()[0] === s.id} onClick={() => moveSetByOffset(s.id, -1)} aria-label={`Đưa ${s.name} lên`}>↑</button><button type="button" className="h-7 w-7 rounded border border-line bg-white text-xs disabled:opacity-30" disabled={reorderingSets || currentCategorySetIds().at(-1) === s.id} onClick={() => moveSetByOffset(s.id, 1)} aria-label={`Đưa ${s.name} xuống`}>↓</button></div></div>}
              <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#7865EE]" aria-label={`Chọn bộ ${s.name}`} checked={selectedSetIds.includes(s.id)} onChange={(event) => setSelectedSetIds((current) => event.target.checked ? [...current, s.id] : current.filter((id) => id !== s.id))} />
              <div className="min-w-0"><div className="font-semibold">{s.name}</div>
              <div className="text-[0.78rem] text-muted mt-0.5">
                {s.type === "irregular_verb" ? "Động từ bất quy tắc" : "Từ vựng IELTS"} · {s.count} mục ·{" "}
                {s.className ? <span className={cx.badgeGold}>Lớp: {s.className}</span> : <span className={cx.badgeBlue}>Công khai</span>}
                {s.category && <span className="ml-2 rounded-full bg-[#F0EDFF] px-2.5 py-0.5 text-[0.7rem] font-semibold text-[#6550DB]">📁 {s.category}</span>}
              </div>
              {selectedCategory !== ALL_CATEGORIES && selectedCategory !== UNCATEGORIZED && <div className="mt-1 text-[0.68rem] text-muted">Kéo thẻ để đổi thứ tự; hệ thống sẽ cập nhật lại tiền tố 01_, 02_…</div>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className={`${cx.btn} ${cx.btnGold}`}
                disabled={openingDetailId !== null || movingSetId === s.id}
                onClick={() => openDetail(s.id)}
              >
                {openingDetailId === s.id ? "Đang mở..." : "Quản lý bộ từ"}
              </button>
              <button type="button" className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setShareTarget({ targetType: "vocab_set", targetId: s.id, title: s.name, setType: s.type })}>Chia sẻ</button>
              <div className="relative" data-preview-menu>
                <button
                  type="button"
                  className={`${cx.btn} ${cx.btnGhost} select-none`}
                  aria-haspopup="menu"
                  aria-expanded={previewSetId === s.id}
                  aria-controls={`preview-menu-${s.id}`}
                  onClick={() => setPreviewSetId((current) => current === s.id ? null : s.id)}
                >
                  Xem thử <span aria-hidden="true">{previewSetId === s.id ? "▴" : "▾"}</span>
                </button>
                {previewSetId === s.id && <div id={`preview-menu-${s.id}`} role="menu" className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-56 rounded-lg border border-line bg-white p-1.5 shadow-lg">
                  <a
                    href={`/learn/${s.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    role="menuitem"
                    onClick={() => setPreviewSetId(null)}
                    className="block rounded-md px-3 py-2 text-[0.84rem] hover:bg-goldpale"
                  >
                    📖 Học bài
                  </a>
                  <a
                    href={`/quiz/${s.id}?mode=fill`}
                    target="_blank"
                    rel="noopener noreferrer"
                    role="menuitem"
                    onClick={() => setPreviewSetId(null)}
                    className="block rounded-md px-3 py-2 text-[0.84rem] hover:bg-goldpale"
                  >
                    ✍️ {s.type === "ielts_vocab" ? "Điền từ tiếng Anh" : "Điền V1/V2/V3"}
                  </a>
                  {s.type === "ielts_vocab" && (
                    <a
                      href={`/quiz/${s.id}?mode=mc`}
                      target="_blank"
                      rel="noopener noreferrer"
                      role="menuitem"
                      onClick={() => setPreviewSetId(null)}
                      className="block rounded-md px-3 py-2 text-[0.84rem] hover:bg-goldpale"
                    >
                      ☑️ Trắc nghiệm
                    </a>
                  )}
                </div>}
              </div>
              <button type="button" className={`${cx.btn} ${cx.btnGhost} !px-3`} disabled={exportingSetId !== null} onClick={() => void exportSet(s.id, "xlsx")}>{exportingSetId === s.id ? "…" : "↓ XLSX"}</button>
              <button type="button" className={`${cx.btn} ${cx.btnGhost} !px-3`} disabled={exportingSetId !== null} onClick={() => void exportSet(s.id, "pdf")}>{exportingSetId === s.id ? "…" : "↓ PDF"}</button>
              <button
                className="px-2 py-2 text-[0.8rem] text-bad hover:underline"
                onClick={() => deleteSet(s.id)}
              >
                Xoá
              </button>
            </div>
          </div>
        ))
      )}

      {detail && (
        <Modal title={detail.name} onClose={closeDetail} wide>
          <div>
          <div className={cx.desc}>
            {detail.type === "irregular_verb" ? "Động từ bất quy tắc" : "Từ vựng IELTS"} · {detail.words.length} mục
          </div>
          <div className="mb-4 flex items-center justify-between gap-3 rounded-[12px] border border-line bg-[#FBFAFE] p-2.5">
            <button
              type="button"
              className={`${cx.btn} ${cx.btnGhost} min-h-10 shrink-0 !px-3`}
              disabled={!previousSibling || openingDetailId !== null}
              onClick={() => previousSibling && void navigateToSibling(previousSibling.id)}
              aria-label="Mở bộ từ trước trong cùng danh mục"
              title={previousSibling ? `Bộ trước: ${previousSibling.name}` : "Đây là bộ đầu tiên"}
            >
              ← <span className="hidden sm:inline">Bộ trước</span>
            </button>
            <div className="min-w-0 text-center">
              <div className="truncate text-xs font-bold text-ink">📁 {detail.category || "Chưa phân loại"}</div>
              <div className="mt-0.5 text-[0.7rem] text-muted">
                Bộ {siblingIndex + 1}/{categorySiblings.length}
                <span className="hidden sm:inline"> · Dùng phím ← → để chuyển</span>
              </div>
            </div>
            <button
              type="button"
              className={`${cx.btn} ${cx.btnGhost} min-h-10 shrink-0 !px-3`}
              disabled={!nextSibling || openingDetailId !== null}
              onClick={() => nextSibling && void navigateToSibling(nextSibling.id)}
              aria-label="Mở bộ từ sau trong cùng danh mục"
              title={nextSibling ? `Bộ sau: ${nextSibling.name}` : "Đây là bộ cuối cùng"}
            >
              <span className="hidden sm:inline">Bộ sau</span> →
            </button>
          </div>
          <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Khu vực quản lý bộ từ">
            {([
              ["overview", "Tổng quan"],
              ["vocabulary", "Từ vựng"],
              ["questions", "Câu hỏi"],
              ["documents", "Tài liệu"],
              ["settings", "Cài đặt"],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" aria-current={detailTab === value ? "page" : undefined} onClick={() => setDetailTab(value)} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-bold ${detailTab === value ? "border-gold text-golddark" : "border-transparent text-muted hover:text-ink"}`}>{label}</button>
            ))}
          </nav>

          {detailTab === "overview" && <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-[#FBFAFE] p-4"><span className="text-xs text-muted">Từ vựng</span><b className="mt-1 block text-2xl">{detail.words.length}</b></div>
            <div className="rounded-xl border border-line bg-[#FBFAFE] p-4"><span className="text-xs text-muted">Danh mục</span><b className="mt-1 block truncate text-sm">{detail.category || "Chưa phân loại"}</b></div>
            <div className="rounded-xl border border-line bg-[#FBFAFE] p-4"><span className="text-xs text-muted">Phạm vi</span><b className="mt-1 block truncate text-sm">{detail.className || "Công khai"}</b></div>
            <div className="flex flex-wrap gap-2 sm:col-span-3"><button type="button" className={`${cx.btn} ${cx.btnGold}`} onClick={() => setDetailTab("vocabulary")}>Quản lý từ vựng</button><button type="button" className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setDetailTab("questions")}>Quản lý câu hỏi</button><button type="button" className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setDetailTab("settings")}>Cài đặt bộ</button></div>
          </section>}

          {(detailTab === "questions" || detailTab === "documents") && <section className="rounded-xl border border-line bg-[#FBFAFE] p-5">
            <h3 className="font-serif text-lg font-bold">{detailTab === "questions" ? "Câu hỏi trong thư mục" : "Tài liệu trong thư mục"}</h3>
            <p className="mt-2 text-sm text-muted">Nội dung này được dùng chung theo hierarchy danh mục hiện có để các bộ cùng chủ đề không bị nhân bản dữ liệu.</p>
            {detail.category ? <button type="button" className={`${cx.btn} ${cx.btnGold} mt-4`} onClick={() => { setSelectedCategory(detail.category || ALL_CATEGORIES); setDetail(null); }}>{detailTab === "questions" ? "Mở quản lý câu hỏi" : "Mở quản lý tài liệu"}</button> : <p className="mt-3 text-sm font-semibold text-bad">Hãy gán bộ vào một danh mục trong tab Cài đặt trước.</p>}
          </section>}

          {detailTab === "settings" && <>
          <div className="mb-4 grid grid-cols-1 items-end gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <label className={cx.label} htmlFor="edit-set-name">Tên bộ từ vựng</label>
              <div className="flex gap-2">
                <input
                  id="edit-set-name"
                  className={`${cx.input} !mb-0`}
                  maxLength={256}
                  value={editSetName}
                  onChange={(e) => setEditSetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveSetName();
                  }}
                />
                <button
                  className={`${cx.btn} ${cx.btnGold} shrink-0`}
                  disabled={savingSetName || !editSetName.trim() || editSetName.trim() === detail.name}
                  onClick={saveSetName}
                >
                  {savingSetName ? "Đang lưu..." : "Lưu tên"}
                </button>
              </div>
              {editSetName.trim() !== detail.name && (
                <div className="mt-1.5 flex items-center gap-2 text-[0.75rem] text-golddark">
                  <span>● Tên đã thay đổi nhưng chưa lưu</span>
                  <button type="button" className="underline hover:text-ink" onClick={() => setEditSetName(detail.name)}>
                    Hoàn tác
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className={cx.label}>Phạm vi hiển thị</label>
              <select
                className={`${cx.input} !mb-0`}
                disabled={savingClass}
                value={detail.classId ?? ""}
                onChange={(e) => changeSetClass(detail.id, e.target.value)}
              >
                <option value="">Công khai — mọi học sinh đều thấy</option>
                {classesOpt.map((c) => (
                  <option key={c.id} value={c.id}>
                    Chỉ lớp: {c.name}
                  </option>
                ))}
              </select>
              <div className={`mt-1.5 text-[0.75rem] ${savingClass ? "text-golddark" : "text-muted"}`}>
                {savingClass ? "Đang lưu phạm vi..." : "Thay đổi được lưu tự động"}
              </div>
            </div>
          </div>
          <div className="mb-4 max-w-xl">
            <label className={cx.label}>Danh mục / thư mục</label>
            <div className="flex gap-2">
              <select
                className={`${cx.input} !mb-0`}
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
              >
                <option value="">Chưa phân loại</option>
                {categoryOptions.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
              </select>
              <button className={`${cx.btn} ${cx.btnGhost} shrink-0`} disabled={editCategory.trim() === (detail.category || "")} onClick={saveCategory}>
                Lưu danh mục
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">Các bộ cùng danh mục được gom thành một thư mục trên trang học tập.</p>
              <button type="button" className="text-xs font-bold text-gold hover:underline" onClick={() => setShowCategoryManager(true)}>Quản lý danh mục</button>
            </div>
          </div>
          </>}
          {detailTab === "vocabulary" && <>
          <div className="mb-4 rounded-[11px] border border-line bg-[#FBFAFE] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-ink" htmlFor="detail-word-search">Tìm trong bộ này</label>
              {detailWordQuery.trim() && <span className="text-xs text-muted">Hiển thị {filteredDetailWords.length}/{detail.words.length} từ</span>}
            </div>
            <input
              id="detail-word-search"
              type="search"
              className={`${cx.input} !mb-0`}
              placeholder={detail.type === "irregular_verb" ? "Tìm nghĩa hoặc V1, V2, V3..." : "Tìm từ, nghĩa hoặc ví dụ..."}
              value={detailWordQuery}
              onChange={(event) => setDetailWordQuery(event.target.value)}
            />
          </div>
          <div className="flex gap-2.5 mb-3 flex-wrap">
            <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => setShowAddWord((v) => !v)}>
              + Thêm từ thủ công
            </button>
            <Link className={`${cx.btn} ${cx.btnGhost}`} href={`/admin/import?target=${detail.id}&returnTo=${encodeURIComponent(`/admin/sets?openSet=${detail.id}${detail.category ? `&category=${encodeURIComponent(detail.category)}` : ""}`)}`}>
              ↑ Nhập CSV / Excel vào bộ này
            </Link>
            <button className={`${cx.btn} ${cx.btnGhost}`} disabled={bulkIpaLoading} onClick={() => fetchIpaForSet(false)}>
              {bulkIpaLoading ? "Đang lấy phiên âm..." : "🔤 Lấy phiên âm còn thiếu (Gemini)"}
            </button>
            <button className={`${cx.btn} ${cx.btnGhost}`} disabled={bulkIpaLoading} onClick={() => fetchIpaForSet(true)}>
              🔤 Lấy lại phiên âm cho tất cả
            </button>
            <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setDetail(null)}>
              Đóng
            </button>
          </div>
          {detail.words.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-[#FBFAFE] p-2.5">
            <label className="flex min-h-10 cursor-pointer items-center gap-2 px-2 text-xs font-bold"><input type="checkbox" className="h-4 w-4 accent-[#7865EE]" checked={filteredDetailWords.length > 0 && filteredDetailWords.every((word) => selectedWordIds.includes(word.id))} onChange={(event) => setSelectedWordIds((current) => event.target.checked ? [...new Set([...current, ...filteredDetailWords.map((word) => word.id)])] : current.filter((id) => !filteredDetailWords.some((word) => word.id === id)))} />Chọn tất cả từ đang hiển thị ({filteredDetailWords.length})</label>
            {selectedWordIds.length > 0 && <><span className="rounded-full bg-[#F0EDFF] px-2.5 py-1 text-xs font-bold text-[#6550DB]">Đã chọn {selectedWordIds.length}</span><select className={`${cx.input} !mb-0 !min-h-10 !w-auto`} value={moveTargetSetId} onChange={(event) => setMoveTargetSetId(event.target.value)} aria-label="Chọn bộ từ đích"><option value="">Di chuyển sang...</option>{compatibleMoveTargets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select><button type="button" className={`${cx.btn} ${cx.btnGold} !min-h-10 !px-3 !py-1.5`} disabled={movingWords || !moveTargetSetId} onClick={() => void moveSelectedWords()}>{movingWords ? "Đang chuyển..." : "Di chuyển"}</button><button type="button" className={`${cx.btn} ${cx.btnDanger} !min-h-10 !px-3 !py-1.5`} disabled={bulkDeletingWords} onClick={() => void deleteSelectedWords()}>{bulkDeletingWords ? "Đang xóa…" : `Xóa ${selectedWordIds.length} từ`}</button><button type="button" className="min-h-10 px-2 text-xs font-bold text-muted hover:text-ink" onClick={() => setSelectedWordIds([])}>Bỏ chọn</button></>}
          </div>}

          {showAddWord && (
            <Modal
              title="Thêm từ mới"
              closeOnBackdrop={false}
              onClose={() => {
                setShowAddWord(false);
                setWForm({ meaning: "", v1: "", v2: "", v3: "", ipaV1: "", ipaV2: "", ipaV3: "", term: "", example: "", wtype: "", ipa: "" });
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {detail.type === "irregular_verb" ? (
                  <>
                    <div>
                      <label className={cx.label}>Nghĩa (tiếng Việt)</label>
                      <input className={cx.input} value={wForm.meaning} onChange={(e) => setWForm({ ...wForm, meaning: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>V1</label>
                      <input className={cx.input} value={wForm.v1} onChange={(e) => setWForm({ ...wForm, v1: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>V2</label>
                      <input className={cx.input} value={wForm.v2} onChange={(e) => setWForm({ ...wForm, v2: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>V3</label>
                      <input className={cx.input} value={wForm.v3} onChange={(e) => setWForm({ ...wForm, v3: e.target.value })} />
                    </div>
                    {(["ipaV1", "ipaV2", "ipaV3"] as const).map((field, index) => <div key={field}>
                      <label className={cx.label}>Phiên âm V{index + 1} (không bắt buộc)</label>
                      <input className={cx.input} placeholder="/.../" value={wForm[field]} onChange={(e) => setWForm({ ...wForm, [field]: e.target.value })} />
                    </div>)}
                  </>
                ) : (
                  <>
                    <div>
                      <label className={cx.label}>Từ / cụm từ tiếng Anh</label>
                      <input className={cx.input} value={wForm.term} onChange={(e) => setWForm({ ...wForm, term: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>Nghĩa (tiếng Việt)</label>
                      <input className={cx.input} value={wForm.meaning} onChange={(e) => setWForm({ ...wForm, meaning: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>Ví dụ (không bắt buộc)</label>
                      <input className={cx.input} value={wForm.example} onChange={(e) => setWForm({ ...wForm, example: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>Loại từ (không bắt buộc)</label>
                      <input className={cx.input} placeholder="noun / verb / adj..." value={wForm.wtype} onChange={(e) => setWForm({ ...wForm, wtype: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>Phiên âm IPA (không bắt buộc)</label>
                      <input className={cx.input} placeholder="/wɜːd/" value={wForm.ipa} onChange={(e) => setWForm({ ...wForm, ipa: e.target.value })} />
                    </div>
                  </>
                )}
                <div className="md:col-span-2">
                  <button className={`${cx.btn} ${cx.btnGold}`} onClick={saveWord}>
                    Lưu từ
                  </button>
                </div>
              </div>
            </Modal>
          )}

          {detail.words.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line bg-[#fffefb] px-4 py-8 text-center text-[0.88rem] text-muted">
              Bộ này chưa có từ nào. Chọn “Thêm từ thủ công” để bắt đầu.
            </div>
          ) : filteredDetailWords.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line bg-[#fffefb] px-4 py-8 text-center text-[0.88rem] text-muted">
              Không tìm thấy từ phù hợp trong bộ này.
            </div>
          ) : (
          <div className="max-h-[52vh] overflow-auto rounded-lg border border-line [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-white">
            <table className={cx.table}>
              <thead>
                <tr>
                  <th className={`${cx.th} w-10`}><span className="sr-only">Chọn</span></th>
                  {detail.type === "irregular_verb" ? (
                    <>
                      <th className={cx.th}>Nghĩa</th>
                      <th className={cx.th}>V1</th>
                      <th className={cx.th}>V2</th>
                      <th className={cx.th}>V3</th>
                      <th className={cx.th}>Phiên âm</th>
                      <th className={cx.th}></th>
                    </>
                  ) : (
                    <>
                      <th className={cx.th}>Từ</th>
                      <th className={cx.th}>Nghĩa</th>
                      <th className={cx.th}>Ví dụ</th>
                      <th className={cx.th}>Loại từ</th>
                      <th className={cx.th}>Phiên âm</th>
                      <th className={cx.th}></th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredDetailWords.map((w) => (
                  <tr key={w.id} ref={(element) => { if (element) wordRowRefs.set(w.id, element); else wordRowRefs.delete(w.id); }} tabIndex={focusedWordId === w.id ? -1 : undefined} className={`${selectedWordIds.includes(w.id) ? "bg-[#F5F2FF]" : "hover:bg-goldpale/30"} ${focusedWordId === w.id ? "ring-2 ring-inset ring-[#7865EE]" : ""}`}>
                    <td className={cx.td}><input type="checkbox" className="h-4 w-4 accent-[#7865EE]" aria-label={`Chọn ${w.term || w.v1 || w.meaning}`} checked={selectedWordIds.includes(w.id)} onChange={(event) => setSelectedWordIds((current) => event.target.checked ? [...current, w.id] : current.filter((id) => id !== w.id))} /></td>
                    {detail.type === "irregular_verb" ? (
                      <>
                        <td className={cx.td}>{w.meaning}</td>
                        <td className={cx.td}>{w.v1}</td>
                        <td className={cx.td}>{w.v2}</td>
                        <td className={cx.td}>{w.v3}</td>
                      </>
                    ) : (
                      <>
                        <td className={cx.td}>{w.term}</td>
                        <td className={cx.td}>{w.meaning}</td>
                        <td className={cx.td}>{w.example}</td>
                        <td className={cx.td}>{w.wtype}</td>
                      </>
                    )}
                    <td className={cx.td}>
                      {detail.type === "irregular_verb" ? (w.ipaV1 || w.ipaV2 || w.ipaV3) ? (
                        <div className="space-y-1 text-xs text-golddark"><div>V1 {w.ipaV1 || "—"}</div><div>V2 {w.ipaV2 || "—"}</div><div>V3 {w.ipaV3 || "—"}</div></div>
                      ) : (
                        <button
                          className={`${cx.btn} ${cx.btnGhost} !px-2 !py-1`}
                          disabled={fetchingIpaId === w.id}
                          onClick={() => fetchIpaForWord(w.id)}
                        >
                          {fetchingIpaId === w.id ? "..." : "🔤 Lấy"}
                        </button>
                      ) : w.ipa ? (
                        <span className="text-golddark">{w.ipa}</span>
                      ) : (
                        <button
                          className={`${cx.btn} ${cx.btnGhost} !px-2 !py-1`}
                          disabled={fetchingIpaId === w.id}
                          onClick={() => fetchIpaForWord(w.id)}
                        >
                          {fetchingIpaId === w.id ? "..." : "🔤 Lấy"}
                        </button>
                      )}
                    </td>
                    <td className={cx.td}>
                      <div className="flex gap-1.5">
                        <button className={`${cx.btn} ${cx.btnGhost} !px-2 !py-1`} onClick={() => startEditWord(w)}>
                          Sửa
                        </button>
                        <button className={`${cx.btn} ${cx.btnDanger} !px-2 !py-1`} onClick={() => deleteWord(w.id)}>
                          Xoá
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          {editingWordId !== null && (
            <Modal title="Sửa từ" onClose={cancelEditWord} closeOnBackdrop={false}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {detail.type === "irregular_verb" ? (
                  <>
                    <div>
                      <label className={cx.label}>Nghĩa</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.meaning} onChange={(e) => setEditForm({ ...editForm, meaning: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>V1</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.v1} onChange={(e) => setEditForm({ ...editForm, v1: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>V2</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.v2} onChange={(e) => setEditForm({ ...editForm, v2: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>V3</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.v3} onChange={(e) => setEditForm({ ...editForm, v3: e.target.value })} />
                    </div>
                    {(["ipaV1", "ipaV2", "ipaV3"] as const).map((field, index) => <div key={field}>
                      <label className={cx.label}>Phiên âm V{index + 1}</label>
                      <input className={`${cx.input} !mb-0`} value={editForm[field]} onChange={(e) => setEditForm({ ...editForm, [field]: e.target.value })} />
                    </div>)}
                  </>
                ) : (
                  <>
                    <div>
                      <label className={cx.label}>Từ</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.term} onChange={(e) => setEditForm({ ...editForm, term: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>Nghĩa</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.meaning} onChange={(e) => setEditForm({ ...editForm, meaning: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>Ví dụ</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.example} onChange={(e) => setEditForm({ ...editForm, example: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>Loại từ</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.wtype} onChange={(e) => setEditForm({ ...editForm, wtype: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>Phiên âm IPA</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.ipa} onChange={(e) => setEditForm({ ...editForm, ipa: e.target.value })} />
                    </div>
                  </>
                )}
                <div className="md:col-span-2 flex gap-2">
                  <button className={`${cx.btn} ${cx.btnGold} !px-3 !py-1.5`} onClick={saveEditWord}>
                    Lưu
                  </button>
                  <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={cancelEditWord}>
                    Huỷ
                  </button>
                </div>
              </div>
            </Modal>
          )}
          </>}
          </div>
        </Modal>
      )}

      {shareTarget && <ShareDialog {...shareTarget} onClose={() => setShareTarget(null)} />}
    </div>
  );
}

function FolderCard({ name, count, dragging, muted = false, onClick, onDrop }: { name: string; count: number; dragging: boolean; muted?: boolean; onClick: () => void; onDrop?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDrop ? (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } : undefined}
      onDrop={onDrop ? (event) => { event.preventDefault(); onDrop(); } : undefined}
      className={`flex min-h-[68px] items-center gap-3 rounded-xl border bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-[#CFC7FF] hover:shadow-sm ${dragging && onDrop ? "border-dashed border-[#7865EE] bg-[#F5F2FF]" : "border-line"}`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${muted ? "bg-[#F1EFF8]" : "bg-[#EFECFF]"}`} aria-hidden="true">{muted ? "◫" : "📁"}</span>
      <span className="min-w-0 flex-1"><b className="block truncate text-sm text-ink">{name}</b><span className="mt-0.5 block text-xs text-muted">{count} bộ từ</span></span>
      <span className="text-lg text-muted" aria-hidden="true">›</span>
    </button>
  );
}
