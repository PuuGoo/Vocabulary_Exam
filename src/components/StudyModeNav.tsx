"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { getFillModeLabel, normalizeLanguageCode, type FillTarget } from "@/lib/languages";

type StudyMode = "learn" | "fill" | "mc" | "match" | "dictation" | "listen" | "pronunciation" | "sentence" | "timed" | "tone" | "cloze";
type StudyModeNavItem = {
  key: string;
  mode: StudyMode;
  target?: FillTarget;
  label: string;
  icon: string;
  href: (id: number) => string;
};

const items: StudyModeNavItem[] = [
  { key: "learn", mode: "learn", label: "Học bài", icon: "📖", href: (id) => `/learn/${id}` },
  { key: "fill-term", mode: "fill", target: "term", label: "Điền từ tiếng Anh", icon: "✍️", href: (id) => `/quiz/${id}?mode=fill` },
  { key: "tone", mode: "tone", label: "Thanh điệu", icon: "〽", href: (id) => `/tone/${id}` },
  { key: "cloze", mode: "cloze", label: "Điền từ trong câu", icon: "文", href: (id) => `/cloze/${id}` },
  { key: "mc", mode: "mc", label: "Trắc nghiệm", icon: "☑️", href: (id) => `/quiz/${id}?mode=mc` },
  { key: "match", mode: "match", label: "Ghép cặp", icon: "🧩", href: (id) => `/match/${id}` },
  { key: "dictation", mode: "dictation", label: "Nghe và viết", icon: "🎧", href: (id) => `/dictation/${id}` },
  { key: "listen", mode: "listen", label: "Nghe rảnh tay", icon: "🔊", href: (id) => `/listen/${id}` },
  { key: "pronunciation", mode: "pronunciation", label: "Luyện phát âm", icon: "🎙️", href: (id) => `/pronunciation/${id}` },
  { key: "sentence", mode: "sentence", label: "Xếp câu", icon: "🧩", href: (id) => `/sentence/${id}` },
  { key: "timed", mode: "timed", label: "Thi thử tính giờ", icon: "⏱", href: (id) => `/quiz/${id}?mode=fill&timed=1&minutes=15` },
];

type Props = {
  setId: number;
  active: StudyMode;
  isVerb?: boolean;
  languageCode?: string;
  fillTarget?: FillTarget;
  availableModes?: readonly string[];
  onSelectMode?: (mode: string, target?: FillTarget) => void;
};

export default function StudyModeNav({ setId, active, isVerb = false, languageCode = "en", fillTarget = "term", availableModes, onSelectMode }: Props) {
  const router = useRouter();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const chinese = normalizeLanguageCode(languageCode) === "zh-CN";
  const visibleItems = useMemo(() => {
    const navigation = [...items];
    if (chinese) {
      navigation.splice(2, 0, {
        key: "fill-pronunciation",
        mode: "fill",
        target: "pronunciation",
        label: "Điền Pinyin",
        icon: "🔤",
        href: (id) => `/quiz/${id}?mode=fill&target=pronunciation`,
      });
    }
    return navigation.filter((item) =>
      (chinese || (item.mode !== "tone" && item.mode !== "cloze"))
      &&
      !(isVerb && (item.mode === "mc" || item.mode === "sentence"))
      && (!availableModes || availableModes.includes(item.mode)),
    );
  }, [availableModes, chinese, isVerb]);
  const selectedKey = active === "fill" ? `fill-${fillTarget}` : active;
  const labelFor = (item: StudyModeNavItem) => item.mode === "fill"
    ? getFillModeLabel({ type: isVerb ? "irregular_verb" : "ielts_vocab", languageCode }, item.target)
    : item.label;
  const choose = (item: StudyModeNavItem) => onSelectMode
    ? onSelectMode(item.mode, item.target)
    : router.push(item.href(setId));

  useEffect(() => {
    scrollerRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selectedKey]);

  return <nav aria-label="Chuyển chế độ học" className="sticky top-[72px] z-20 -mx-1 mb-5 border-b border-line bg-paper/95 px-1 pt-2 backdrop-blur-md">
    <label className="mb-2 flex min-h-12 items-center gap-3 rounded-xl border border-[#DCD8F3] bg-white px-3 shadow-[0_5px_18px_rgba(36,35,55,0.06)] sm:hidden">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F0EDFF] text-[#6550DB]" aria-hidden="true">↔</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.65rem] font-bold uppercase tracking-wide text-muted">Đổi chế độ học</span>
        <select
          aria-label="Chọn chế độ học"
          value={selectedKey}
          onChange={(event) => {
            const item = visibleItems.find((candidate) => candidate.key === event.target.value);
            if (item) choose(item);
          }}
          className="block h-6 w-full appearance-none bg-transparent text-sm font-bold text-ink outline-none"
        >
          {visibleItems.map((item) => <option key={item.key} value={item.key}>{item.icon} {labelFor(item)}</option>)}
        </select>
      </span>
      <span className="text-muted" aria-hidden="true">⌄</span>
    </label>
    <div ref={scrollerRef} className="hidden snap-x gap-1 overflow-x-auto pb-2 [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden sm:flex">
      {visibleItems.map((item) => {
        const selected = item.key === selectedKey;
        const className = `flex min-h-11 shrink-0 snap-start items-center rounded-lg border px-3 text-[0.82rem] font-medium transition-all duration-200 ${selected ? "border-gold bg-goldpale text-golddark shadow-[0_4px_14px_rgba(120,101,238,0.12)]" : "border-transparent text-muted hover:-translate-y-0.5 hover:border-line hover:bg-white hover:text-ink"}`;
        const content = <><span aria-hidden="true">{item.icon}</span> {labelFor(item)}</>;
        return onSelectMode
          ? <button type="button" key={item.key} onClick={() => choose(item)} aria-current={selected ? "page" : undefined} className={className}>{content}</button>
          : <Link key={item.key} href={item.href(setId)} aria-current={selected ? "page" : undefined} className={className}>{content}</Link>;
      })}
    </div>
  </nav>;
}
