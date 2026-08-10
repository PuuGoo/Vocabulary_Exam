"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
type StudyMode = "learn" | "fill" | "mc" | "match" | "dictation" | "listen" | "pronunciation" | "sentence" | "timed";
const items: { mode: StudyMode; label: string; icon: string; href: (id: number) => string }[] = [
  { mode: "learn", label: "Học bài", icon: "📖", href: (id) => `/learn/${id}` },
  { mode: "fill", label: "Điền từ tiếng Anh", icon: "✍️", href: (id) => `/quiz/${id}?mode=fill` },
  { mode: "mc", label: "Trắc nghiệm", icon: "☑️", href: (id) => `/quiz/${id}?mode=mc` },
  { mode: "match", label: "Ghép cặp", icon: "🧩", href: (id) => `/match/${id}` },
  { mode: "dictation", label: "Nghe và viết", icon: "🎧", href: (id) => `/dictation/${id}` },
  { mode: "listen", label: "Nghe rảnh tay", icon: "🔊", href: (id) => `/listen/${id}` },
  { mode: "pronunciation", label: "Luyện phát âm", icon: "🎙️", href: (id) => `/pronunciation/${id}` },
  { mode: "sentence", label: "Xếp câu", icon: "🧩", href: (id) => `/sentence/${id}` },
  { mode: "timed", label: "Thi thử tính giờ", icon: "⏱", href: (id) => `/quiz/${id}?mode=fill&timed=1&minutes=15` },
];
export default function StudyModeNav({ setId, active, isVerb = false }: { setId: number; active: StudyMode; isVerb?: boolean }) {
  const router = useRouter();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const visibleItems = items.filter((item) => !(isVerb && (item.mode === "mc" || item.mode === "sentence")));
  useEffect(() => { scrollerRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" }); }, [active]);
  return <nav aria-label="Chuyển chế độ học" className="sticky top-[72px] z-20 -mx-1 mb-5 border-b border-line bg-paper/95 px-1 pt-2 backdrop-blur-md">
    <label className="mb-2 flex min-h-12 items-center gap-3 rounded-xl border border-[#DCD8F3] bg-white px-3 shadow-[0_5px_18px_rgba(36,35,55,0.06)] sm:hidden">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F0EDFF] text-[#6550DB]" aria-hidden="true">↔</span>
      <span className="min-w-0 flex-1"><span className="block text-[0.65rem] font-bold uppercase tracking-wide text-muted">Đổi chế độ học</span><select aria-label="Chọn chế độ học" value={active} onChange={(event) => { const item = visibleItems.find((candidate) => candidate.mode === event.target.value); if (item) router.push(item.href(setId)); }} className="block h-6 w-full appearance-none bg-transparent text-sm font-bold text-ink outline-none">{visibleItems.map((item) => <option key={item.mode} value={item.mode}>{item.icon} {isVerb && item.mode === "fill" ? "Điền V1/V2/V3" : item.label}</option>)}</select></span>
      <span className="text-muted" aria-hidden="true">⌄</span>
    </label>
    <div ref={scrollerRef} className="hidden snap-x gap-1 overflow-x-auto pb-2 [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden sm:flex">{visibleItems.map((item) => { const selected = item.mode === active; const label = isVerb && item.mode === "fill" ? "Điền V1/V2/V3" : item.label; return <Link key={item.mode} href={item.href(setId)} aria-current={selected ? "page" : undefined} className={`flex min-h-11 shrink-0 snap-start items-center rounded-lg border px-3 text-[0.82rem] font-medium transition-all duration-200 ${selected ? "border-gold bg-goldpale text-golddark shadow-[0_4px_14px_rgba(120,101,238,0.12)]" : "border-transparent text-muted hover:-translate-y-0.5 hover:border-line hover:bg-white hover:text-ink"}`}><span aria-hidden="true">{item.icon}</span> {label}</Link>; })}</div>
  </nav>;
}
