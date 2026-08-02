"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";
import Modal from "@/components/Modal";

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
type CategoryDocument = { id: number; category: string; title: string; fileName: string; fileSize: number; createdAt: string };
const ALL_CATEGORIES = "__all__";
const UNCATEGORIZED = "__uncategorized__";

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

export default function AdminSetsPage() {
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
  const [draggingSetId, setDraggingSetId] = useState<number | null>(null);
  const [movingSetId, setMovingSetId] = useState<number | null>(null);
  const [categoryDocuments, setCategoryDocuments] = useState<CategoryDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [viewingDocument, setViewingDocument] = useState<CategoryDocument | null>(null);

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
    );
  }, [sets, searchQuery, selectedCategory]);
  const filteredDetailWords = useMemo(() => {
    if (!detail) return [];
    const query = normalizeSearch(detailWordQuery);
    if (!query) return detail.words;
    return detail.words.filter((word) => normalizeSearch([
      word.term, word.meaning, word.v1, word.v2, word.v3, word.example,
    ].filter(Boolean).join(" ")).includes(query));
  }, [detail, detailWordQuery]);
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

  async function uploadCategoryDocument() {
    if (selectedCategory === ALL_CATEGORIES || selectedCategory === UNCATEGORIZED || documentFiles.length === 0 || documentUploading) return;
    if (documentFiles.some((file) => file.size > 4 * 1024 * 1024)) return toast("Mỗi file PDF không được vượt quá 4 MB.");
    const form = new FormData();
    form.append("category", selectedCategory);
    form.append("title", documentTitle.trim());
    documentFiles.forEach((file) => form.append("files", file));
    setDocumentUploading(true);
    try {
      const res = await fetch("/api/admin/category-documents", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "Không thể tải PDF lên.");
      setCategoryDocuments((current) => [...current, ...(data.documents || []).map((document: CategoryDocument) => ({ ...document, category: selectedCategory }))]);
      setDocumentFiles([]);
      setDocumentTitle("");
      const input = document.getElementById("category-pdf-file") as HTMLInputElement | null;
      if (input) input.value = "";
      toast("Đã tải tài liệu PDF lên thư mục.");
    } catch {
      toast("Không thể kết nối để tải PDF lên.");
    } finally {
      setDocumentUploading(false);
    }
  }

  async function deleteCategoryDocument(document: CategoryDocument) {
    if (!confirm(`Xóa tài liệu “${document.title}”?`)) return;
    const res = await fetch(`/api/admin/category-documents?id=${document.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error || "Không thể xóa tài liệu.");
    setCategoryDocuments((current) => current.filter((item) => item.id !== document.id));
    if (viewingDocument?.id === document.id) setViewingDocument(null);
    toast("Đã xóa tài liệu PDF.");
  }

  useEffect(() => {
    loadSets();
    loadClasses();
    loadCategories();
  }, []);

  useEffect(() => {
    setDocumentFiles([]);
    setDocumentTitle("");
    setViewingDocument(null);
    if (selectedCategory === ALL_CATEGORIES || selectedCategory === UNCATEGORIZED) {
      setCategoryDocuments([]);
      return;
    }
    const controller = new AbortController();
    setDocumentsLoading(true);
    fetch(`/api/admin/category-documents?category=${encodeURIComponent(selectedCategory)}`, { signal: controller.signal })
      .then(async (res) => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data) => setCategoryDocuments(data.documents || []))
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
    if (!confirm(`Xóa danh mục “${category.name}”? ${detail}`)) return;
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
    if (!confirm("Xoá bộ từ vựng này? Hành động không thể hoàn tác.")) return;
    try {
      const res = await fetch(`/api/sets/${id}`, { method: "DELETE" });
      if (!res.ok) return toast("Không thể xoá bộ từ vựng.");
      toast("Đã xoá bộ từ vựng.");
      if (detail?.id === id) setDetail(null);
      loadSets();
    } catch {
      toast("Không thể kết nối để xoá bộ từ vựng.");
    }
  }

  async function openDetail(id: number) {
    setPreviewSetId(null);
    setOpeningDetailId(id);
    try {
      const res = await fetch(`/api/sets/${id}`);
      if (!res.ok) return toast("Không thể mở bộ từ vựng.");
      const data = await res.json();
      setDetail(data.set);
      setEditSetName(data.set.name);
      setEditCategory(data.set.category || "");
      setDetailWordQuery("");
      setShowAddWord(false);
      setEditingWordId(null);
    } catch {
      toast("Không thể kết nối để mở bộ từ vựng.");
    } finally {
      setOpeningDetailId(null);
    }
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
    if (!confirm(`Xoá “${label}” khỏi bộ từ?`)) return;
    try {
      const res = await fetch(`/api/admin/words/${wordId}`, { method: "DELETE" });
      if (!res.ok) return toast("Không thể xoá từ.");
      setDetail((current) => current ? { ...current, words: current.words.filter((word) => word.id !== wordId) } : current);
      toast("Đã xoá từ.");
      loadSets();
    } catch {
      toast("Không thể kết nối để xoá từ.");
    }
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

  function closeDetail() {
    // A child editor handles Escape/overlay first; keep the parent open behind it.
    if (showAddWord || editingWordId !== null) return;
    if (detail && editSetName.trim() !== detail.name && !confirm("Tên bộ từ chưa được lưu. Bạn có muốn đóng và bỏ thay đổi?")) return;
    setDetail(null);
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
          <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => setShowNewForm(true)}>
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
            <div><h3 className="text-sm font-bold text-ink">Tài liệu PDF</h3><p className="mt-1 text-xs text-muted">Tải tài liệu lý thuyết lên và mở xem trực tiếp trong website.</p></div>
            <span className="rounded-full bg-[#F0EDFF] px-2.5 py-1 text-xs font-bold text-[#6550DB]">{categoryDocuments.length} tài liệu</span>
          </div>
          <div className="grid gap-2 rounded-xl border border-dashed border-[#CFC7FF] bg-[#FBFAFE] p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
            <label><span className={cx.label}>Tên tài liệu</span><input className={`${cx.input} !mb-0`} placeholder="VD: Tổng quan từ vựng sức khỏe" value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} maxLength={256} /></label>
            <label><span className={cx.label}>Chọn nhiều file PDF · tối đa 4 MB/file</span><input id="category-pdf-file" multiple type="file" accept="application/pdf,.pdf" className={`${cx.input} !mb-0 !py-2`} onChange={(event) => { const files = Array.from(event.target.files || []); if (files.some((file) => file.size > 4 * 1024 * 1024)) { toast("Mỗi file PDF không được vượt quá 4 MB."); event.target.value = ""; setDocumentFiles([]); return; } setDocumentFiles(files); }} /></label>
            <button type="button" className={`${cx.btn} ${cx.btnGold} min-h-11`} disabled={documentFiles.length === 0 || documentUploading} onClick={() => void uploadCategoryDocument()}>{documentUploading ? "Đang tải..." : `↑ Tải ${documentFiles.length || ""} PDF lên`}</button>
          </div>
          {documentsLoading ? <p className="mt-3 text-xs text-muted">Đang tải tài liệu...</p> : categoryDocuments.length === 0 ? <p className="mt-3 text-sm text-muted">Thư mục này chưa có tài liệu PDF.</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {categoryDocuments.map((document) => <article key={document.id} className="rounded-xl border border-line bg-[#FBFAFE] p-3">
              <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF1F1] text-lg" aria-hidden="true">PDF</span><div className="min-w-0"><b className="block truncate text-sm text-ink" title={document.title}>{document.title}</b><span className="mt-0.5 block truncate text-xs text-muted">{document.fileName} · {(document.fileSize / 1024 / 1024).toFixed(2)} MB</span></div></div>
              <div className="mt-3 flex gap-2"><button type="button" className={`${cx.btn} ${cx.btnGold} flex-1 !px-3 !py-1.5`} onClick={() => setViewingDocument(document)}>Mở xem</button><a className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} href={`/api/admin/category-documents/${document.id}/file`} target="_blank" rel="noopener noreferrer">Tab mới</a><button type="button" className="px-2 text-xs font-bold text-bad" onClick={() => void deleteCategoryDocument(document)}>Xóa</button></div>
            </article>)}
          </div>}
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
                      onClick={() => void openDetail(match.setId)}
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

      {viewingDocument && (
        <Modal title={viewingDocument.title} onClose={() => setViewingDocument(null)} wide>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span>{viewingDocument.fileName} · {(viewingDocument.fileSize / 1024 / 1024).toFixed(2)} MB</span><a className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} href={`/api/admin/category-documents/${viewingDocument.id}/file`} target="_blank" rel="noopener noreferrer">Mở trong tab mới</a></div>
          <iframe title={`Tài liệu ${viewingDocument.title}`} src={`/api/admin/category-documents/${viewingDocument.id}/file`} className="h-[70vh] min-h-[480px] w-full rounded-xl border border-line bg-[#F8F8FC]" />
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
                    <button className="min-h-9 rounded-[9px] border border-[#F2D6D6] bg-white px-3 text-xs font-bold text-[#B65353] transition hover:bg-[#FFF5F5]" disabled={categorySubmitting} onClick={() => void deleteCategory(category)}>Xóa</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Modal>
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
            className={`${cx.setcard} ${draggingSetId === s.id ? "opacity-60 ring-2 ring-[#7865EE]/30" : ""}`}
            key={s.id}
            draggable
            onDragStart={(event) => { setDraggingSetId(s.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(s.id)); }}
            onDragEnd={() => setDraggingSetId(null)}
          >
            <div>
              <div className="font-semibold">{s.name}</div>
              <div className="text-[0.78rem] text-muted mt-0.5">
                {s.type === "irregular_verb" ? "Động từ bất quy tắc" : "Từ vựng IELTS"} · {s.count} mục ·{" "}
                {s.className ? <span className={cx.badgeGold}>Lớp: {s.className}</span> : <span className={cx.badgeBlue}>Công khai</span>}
                {s.category && <span className="ml-2 rounded-full bg-[#F0EDFF] px-2.5 py-0.5 text-[0.7rem] font-semibold text-[#6550DB]">📁 {s.category}</span>}
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
            <Link className={`${cx.btn} ${cx.btnGhost}`} href={`/admin/import?target=${detail.id}`}>
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
                  <tr key={w.id} className="hover:bg-goldpale/30">
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
          </div>
        </Modal>
      )}
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
