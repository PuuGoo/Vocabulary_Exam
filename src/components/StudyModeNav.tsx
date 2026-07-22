"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
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
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollerRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" }); }, [active]);
  return <nav aria-label="Chuyển chế độ học" className="sticky top-[72px] z-20 -mx-1 mb-5 border-b border-line bg-paper/95 px-1 pt-2 backdrop-blur-md"><div ref={scrollerRef} className="flex snap-x gap-1 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{items.filter((item) => !(isVerb && (item.mode === "mc" || item.mode === "sentence"))).map((item) => { const selected = item.mode === active; const label = isVerb && item.mode === "fill" ? "Điền V1/V2/V3" : item.label; return <Link key={item.mode} href={item.href(setId)} aria-current={selected ? "page" : undefined} className={`shrink-0 snap-start rounded-lg border px-3 py-2 text-[0.82rem] font-medium transition-all duration-200 ${selected ? "border-gold bg-goldpale text-golddark shadow-[0_4px_14px_rgba(120,101,238,0.12)]" : "border-transparent text-muted hover:-translate-y-0.5 hover:border-line hover:bg-white hover:text-ink"}`}><span aria-hidden="true">{item.icon}</span> {label}</Link>; })}</div></nav>;
}
