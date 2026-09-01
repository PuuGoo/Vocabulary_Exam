"use client";

import { useEffect, useMemo, useState } from "react";
import {
  categoryBreadcrumbs,
  categoryCollator,
  listChildCategoryFolders,
  parentCategoryPath,
  searchCategorizedItems,
  setsDirectlyInFolder,
  UNCATEGORIZED_PATH,
} from "@/lib/categoryPath";
import { normalizeSearch } from "@/lib/search";

export type SetLike = { id: number; name: string; category?: string | null; count?: number };

export function mergeFolderSelection(selected: number[], folderIds: number[], maxMultiple?: number): number[] {
  const merged = [...new Set([...selected, ...folderIds])];
  return maxMultiple == null ? merged : merged.slice(0, maxMultiple);
}

export default function SetPicker({
  sets,
  mode = "single",
  selected,
  onSelect,
  maxMultiple,
  renderTrigger,
  open,
  onOpenChange,
  title = "Chọn bộ từ",
}: {
  sets: SetLike[];
  mode?: "single" | "multiple";
  selected: number[];
  onSelect: (ids: number[]) => void;
  maxMultiple?: number;
  renderTrigger: (count: number, label: string) => React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = (value: boolean) => {
    setInternalOpen(value);
    onOpenChange?.(value);
  };
  const [folderPath, setFolderPath] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (isOpen) {
      setFolderPath("");
      setQuery("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  const categoryPaths = useMemo(
    () => Array.from(new Set((sets.map((set) => set.category) || []).filter(Boolean) as string[])),
    [sets],
  );

  const childFolders = useMemo(
    () => listChildCategoryFolders(folderPath, categoryPaths, sets),
    [categoryPaths, folderPath, sets],
  );
  const directSets = useMemo(
    () => setsDirectlyInFolder(folderPath, sets).sort((a, b) => categoryCollator.compare(a.name, b.name)),
    [folderPath, sets],
  );
  const breadcrumbs = useMemo(() => categoryBreadcrumbs(folderPath), [folderPath]);

  const searchResults = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return [];
    return searchCategorizedItems(query, sets).sort((a, b) => categoryCollator.compare(a.name, b.name));
  }, [query, sets]);

  function toggleId(id: number) {
    const isSelected = selected.includes(id);
    let next: number[];
    if (mode === "single") {
      next = isSelected ? [] : [id];
    } else if (isSelected) {
      next = selected.filter((value) => value !== id);
    } else if (maxMultiple != null && selected.length >= maxMultiple) {
      return;
    } else {
      next = [...selected, id];
    }
    onSelect(next);
    if (mode === "single") setOpen(false);
  }

  const showRest = childFolders.length > 0 || directSets.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="w-full text-left"
      >
        {renderTrigger(selected.length, selected.length ? `${selected.length} bộ đã chọn` : title)}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
        >
          <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="font-serif text-base">{title}</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Đóng" className="px-2 text-xl text-muted hover:text-ink">×</button>
            </div>

            <div className="border-b border-line p-3">
              <label className="relative block">
                <span className="sr-only">Tìm bộ từ</span>
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">⌕</span>
                <input
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm bộ từ hoặc thư mục..."
                  className="h-11 w-full rounded-[11px] border border-line bg-[#FBFAFE] pl-9 pr-9 text-sm outline-none transition focus:border-gold"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Xoá tìm kiếm"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                  >
                    ×
                  </button>
                )}
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {query.trim() ? (
                searchResults.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted">Không tìm thấy bộ từ phù hợp.</div>
                ) : searchResults.map((set) => (
                  <label key={set.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${selected.includes(set.id) ? "border-gold bg-goldpale/40" : "border-line hover:border-gold/60"}`}>
                    <input type={mode === "multiple" ? "checkbox" : "radio"} checked={selected.includes(set.id)} onChange={() => toggleId(set.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{set.name}</span>
                      <span className="text-xs text-muted">{set.count != null ? `${set.count} từ · ` : ""}{(set.category || "").split(" / ").join(" › ") || "Chưa phân loại"}</span>
                    </span>
                  </label>
                ))
              ) : (
                <>
                  <nav aria-label="Đường dẫn thư mục" className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold">
                    <button type="button" onClick={() => setFolderPath("")} className={!folderPath ? "text-ink" : "text-gold hover:underline"}>Tất cả</button>
                    {breadcrumbs.map((crumb) => (
                      <span key={crumb.path} className="flex items-center gap-2">
                        <span className="text-muted">›</span>
                        <button type="button" onClick={() => setFolderPath(crumb.path)} className="text-gold hover:underline">{crumb.label}</button>
                      </span>
                    ))}
                  </nav>
                  {folderPath && (
                    <button
                      type="button"
                      onClick={() => setFolderPath(folderPath === UNCATEGORIZED_PATH ? "" : parentCategoryPath(folderPath))}
                      className="mb-3 inline-flex min-h-9 items-center gap-1 rounded-lg border border-line px-3 text-xs font-bold hover:border-gold"
                    >
                      ← Quay lại
                    </button>
                  )}
                  {childFolders.map((folder) => {
                    return (
                      <div key={folder.path} className="flex items-center gap-2 rounded-lg border border-line p-2 mb-2">
                        <button type="button" onClick={() => setFolderPath(folder.path)} className="flex min-h-10 flex-1 items-center gap-2 text-left text-sm font-semibold" aria-label={`Mở thư mục ${folder.name}, ${folder.count} bộ`}>
                          <span aria-hidden="true">📁</span>
                          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                          <span className="shrink-0 text-xs text-muted">{folder.count} bộ</span>
                          <span aria-hidden="true" className="text-muted">›</span>
                        </button>
                      </div>
                    );
                  })}
                  {directSets.map((set) => (
                    <label key={set.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 mb-2 ${selected.includes(set.id) ? "border-gold bg-goldpale/40" : "border-line hover:border-gold/60"}`}>
                      <input type={mode === "multiple" ? "checkbox" : "radio"} checked={selected.includes(set.id)} onChange={() => toggleId(set.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{set.name}</span>
                        <span className="text-xs text-muted">{set.count != null ? `${set.count} từ` : ""}</span>
                      </span>
                    </label>
                  ))}
                  {!showRest && (
                    <div className="py-8 text-center text-sm text-muted">Thư mục này chưa có bộ từ.</div>
                  )}
                </>
              )}
            </div>

            {mode === "multiple" && (
              <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
                <div className="flex gap-2 text-xs">
                  {selected.length > 0 && (
                    <button type="button" onClick={() => onSelect([])} className="font-medium text-muted hover:underline">Bỏ chọn</button>
                  )}
                  {directSets.length > 0 && (
                    <button type="button" onClick={() => onSelect(mergeFolderSelection(selected, directSets.map((set) => set.id), maxMultiple))} className="font-medium text-gold hover:underline">Chọn tất cả trong thư mục này</button>
                  )}
                </div>
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-gold px-4 py-2 text-xs font-bold text-white">
                  Xong ({selected.length})
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
