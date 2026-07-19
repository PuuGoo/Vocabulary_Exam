"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Modal from "@/components/Modal";

type Tab = { href: string; label: string };
type SetSummary = { id: number; name: string; type: string };
type Command = { href: string; label: string; description: string; kind: "Trang" | "Bộ từ" };

function searchable(value: string) {
  return value
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d");
}

export default function QuickSwitcher({ open, onClose, tabs }: { open: boolean; onClose: () => void; tabs: Tab[] }) {
  const [query, setQuery] = useState("");
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [loadingSets, setLoadingSets] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open || sets.length > 0) return;
    let cancelled = false;
    setLoadingSets(true);
    fetch("/api/sets")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("load failed")))
      .then((data) => { if (!cancelled) setSets(data.sets || []); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoadingSets(false); });
    return () => { cancelled = true; };
  }, [open, sets.length]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const commands = useMemo(() => {
    const uniqueTabs = [...tabs, { href: "/settings", label: "Cài đặt tài khoản" }]
      .filter((item, index, items) => items.findIndex((candidate) => candidate.href === item.href) === index);
    const pageCommands: Command[] = uniqueTabs.map((item) => ({
      href: item.href,
      label: item.label,
      description: "Mở trang",
      kind: "Trang",
    }));
    const setCommands: Command[] = sets.flatMap((set) => [
      { href: `/learn/${set.id}`, label: `Học bài · ${set.name}`, description: "Flashcard", kind: "Bộ từ" as const },
      { href: `/quiz/${set.id}?mode=fill`, label: `Điền từ · ${set.name}`, description: set.type === "irregular_verb" ? "Điền V1/V2/V3" : "Điền từ tiếng Anh", kind: "Bộ từ" as const },
      { href: `/match/${set.id}`, label: `Ghép cặp · ${set.name}`, description: "Ghép từ với nghĩa", kind: "Bộ từ" as const },
      { href: `/dictation/${set.id}`, label: `Nghe & viết · ${set.name}`, description: "Luyện chính tả", kind: "Bộ từ" as const },
    ]);
    const normalizedQuery = searchable(query.trim());
    return [...pageCommands, ...setCommands]
      .filter((command) => !normalizedQuery || searchable(`${command.label} ${command.description}`).includes(normalizedQuery))
      .slice(0, 20);
  }, [query, sets, tabs]);

  useEffect(() => { setActiveIndex(0); }, [query]);
  useEffect(() => {
    if (activeIndex >= commands.length) setActiveIndex(Math.max(0, commands.length - 1));
  }, [activeIndex, commands.length]);

  if (!open) return null;

  function activate(index: number) {
    document.getElementById(`quick-command-${index}`)?.click();
  }

  return (
    <Modal title="Chuyển nhanh" onClose={onClose} closeOnBackdrop>
      <label className="sr-only" htmlFor="quick-switcher-search">Tìm trang hoặc bộ từ</label>
      <input
        id="quick-switcher-search"
        type="search"
        autoFocus
        autoComplete="off"
        className="mb-3 w-full rounded-lg border border-line bg-[#fffefb] px-3 py-3 text-base outline-none focus:border-gold"
        placeholder="Gõ tên chức năng hoặc bộ từ..."
        value={query}
        role="combobox"
        aria-expanded="true"
        aria-controls="quick-switcher-results"
        aria-activedescendant={commands.length ? `quick-command-${activeIndex}` : undefined}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((value) => Math.min(value + 1, commands.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((value) => Math.max(0, value - 1));
          } else if (event.key === "Enter" && commands.length > 0) {
            event.preventDefault();
            activate(activeIndex);
          }
        }}
      />

      <div id="quick-switcher-results" role="listbox" className="max-h-[55vh] overflow-y-auto rounded-lg border border-line">
        {commands.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted">{loadingSets ? "Đang tải bộ từ..." : "Không tìm thấy chức năng hoặc bộ từ phù hợp."}</div>
        ) : commands.map((command, index) => (
          <Link
            id={`quick-command-${index}`}
            key={`${command.href}-${command.label}`}
            href={command.href}
            role="option"
            aria-selected={index === activeIndex}
            className={`flex items-center justify-between gap-3 border-b border-line px-3 py-3 last:border-b-0 ${index === activeIndex ? "bg-goldpale" : "bg-white hover:bg-[#faf9f5]"}`}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={onClose}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{command.label}</span>
              <span className="mt-0.5 block text-xs text-muted">{command.description}</span>
            </span>
            <span className="shrink-0 rounded-full bg-line/60 px-2 py-0.5 text-[0.65rem] text-muted">{command.kind}</span>
          </Link>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.68rem] text-muted">
        <span><kbd className="rounded border border-line px-1">↑↓</kbd> Di chuyển</span>
        <span><kbd className="rounded border border-line px-1">Enter</kbd> Mở</span>
        <span><kbd className="rounded border border-line px-1">Esc</kbd> Đóng</span>
      </div>
    </Modal>
  );
}
