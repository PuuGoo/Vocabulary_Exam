"use client";

import Link from "next/link";

type StudyMode = "learn" | "fill" | "mc" | "match" | "dictation" | "listen" | "pronunciation" | "sentence" | "timed";

const items: { mode: StudyMode; label: string; icon: string; href: (setId: number) => string }[] = [
  { mode: "learn", label: "Học bài", icon: "📖", href: (setId) => `/learn/${setId}` },
  { mode: "fill", label: "Điền từ tiếng Anh", icon: "✍️", href: (setId) => `/quiz/${setId}?mode=fill` },
  { mode: "mc", label: "Trắc nghiệm", icon: "☑️", href: (setId) => `/quiz/${setId}?mode=mc` },
  { mode: "match", label: "Ghép cặp", icon: "🧩", href: (setId) => `/match/${setId}` },
  { mode: "dictation", label: "Nghe & viết", icon: "🎧", href: (setId) => `/dictation/${setId}` },
  { mode: "listen", label: "Nghe rảnh tay", icon: "🔊", href: (setId) => `/listen/${setId}` },
  { mode: "pronunciation", label: "Luyện phát âm", icon: "🎙️", href: (setId) => `/pronunciation/${setId}` },
  { mode: "sentence", label: "Xếp câu", icon: "🧩", href: (setId) => `/sentence/${setId}` },
  { mode: "timed", label: "Thi thử tính giờ", icon: "⏱", href: (setId) => `/quiz/${setId}?mode=fill&timed=1&minutes=15` },
];

export default function StudyModeNav({
  setId,
  active,
  isVerb = false,
}: {
  setId: number;
  active: StudyMode;
  isVerb?: boolean;
}) {
  return (
    <nav aria-label="Chuyển chế độ học" className="mb-5 border-b border-line">
      <div className="flex gap-1 overflow-x-auto pb-2">
        {items.filter((item) => !(isVerb && (item.mode === "mc" || item.mode === "sentence"))).map((item) => {
          const selected = item.mode === active;
          const label = isVerb && item.mode === "fill" ? "Điền V1/V2/V3" : item.label;
          return (
            <Link
              key={item.mode}
              href={item.href(setId)}
              aria-current={selected ? "page" : undefined}
              className={`shrink-0 rounded-lg border px-3 py-2 text-[0.82rem] font-medium transition-colors ${
                selected
                  ? "border-gold bg-goldpale text-golddark"
                  : "border-transparent text-muted hover:border-line hover:bg-white hover:text-ink"
              }`}
            >
              <span aria-hidden="true">{item.icon}</span> {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
