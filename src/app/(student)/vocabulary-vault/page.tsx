"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "@/components/Toast";

type VaultWord = { term: string; meaning: string; ipa: string; example: string; type: string; status: "Review" | "Mastered" };
const starterWords: VaultWord[] = [
  { term: "meal", meaning: "bữa ăn", ipa: "/miːl/", example: "We had a big meal together.", type: "danh từ", status: "Review" },
  { term: "deal", meaning: "thỏa thuận, giao dịch", ipa: "/diːl/", example: "We made a good deal.", type: "danh từ", status: "Mastered" },
  { term: "trip", meaning: "chuyến đi", ipa: "/trɪp/", example: "We went on a trip to the beach.", type: "danh từ", status: "Review" },
  { term: "cheap", meaning: "rẻ", ipa: "/tʃiːp/", example: "These shoes are cheap.", type: "tính từ", status: "Mastered" },
  { term: "limit", meaning: "giới hạn", ipa: "/lɪmɪt/", example: "There is a speed limit here.", type: "danh từ", status: "Review" },
  { term: "should", meaning: "nên", ipa: "/ʃʊd/", example: "You should review your notes.", type: "động từ khuyết thiếu", status: "Mastered" },
  { term: "this", meaning: "điều này, cái này", ipa: "/ðɪs/", example: "This method improves recall.", type: "từ hạn định", status: "Review" },
];

export default function VocabularyVaultPage() {
  const [words, setWords] = useState(starterWords);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All words" | "To review" | "Mastered">("All words");
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<VaultWord>({ term: "", meaning: "", ipa: "", example: "", type: "danh từ", status: "Review" });
  const fileRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => words.filter((word) => {
    const matchesQuery = `${word.term} ${word.meaning} ${word.ipa} ${word.type}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    return matchesQuery && (filter === "All words" || (filter === "Mastered" ? word.status === "Mastered" : word.status === "Review"));
  }), [filter, query, words]);

  function exportCsv() {
    const csv = ["Từ,Nghĩa,IPA,Ví dụ,Loại từ,Trạng thái", ...words.map((word) => [word.term, word.meaning, word.ipa, word.example, word.type, word.status === "Mastered" ? "Đã thuộc" : "Cần ôn"].map((value) => `"${value.replaceAll('"', '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "lexora-vocabulary.csv"; anchor.click(); URL.revokeObjectURL(url);
    toast("Đã tải xuống file CSV.");
  }

  function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = String(reader.result || "").split(/\r?\n/).slice(1).map((line) => line.split(",").map((value) => value.trim().replace(/^"|"$/g, ""))).filter((row) => row[0]);
    const imported = rows.map(([term, meaning = "", ipa = "", example = "", type = "danh từ"]) => ({ term, meaning, ipa, example, type, status: "Review" as const }));
      if (!imported.length) return toast("Không tìm thấy dòng từ vựng hợp lệ trong file.");
      setWords((current) => [...imported, ...current]);
      toast(`Đã nhập ${imported.length} từ mới.`);
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function addWord(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.term.trim() || !draft.meaning.trim()) return toast("Hãy nhập từ và nghĩa.");
    setWords((current) => [draft, ...current]); setDraft({ term: "", meaning: "", ipa: "", example: "", type: "danh từ", status: "Review" }); setShowAdd(false); toast("Đã thêm từ vào kho từ vựng.");
  }

  const reviewLink = <Link href="/smart-review" className="rounded-full border border-[#D9D3FF] px-3 py-1 text-[0.68rem] font-bold text-[#6550DB] transition hover:bg-[#EFECFF]">Ôn lại</Link>;

  return <div className="lexora-page-enter space-y-6">
    <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 text-sm font-semibold text-gold">Học tập / Từ vựng</div><h1 className="text-[clamp(1.8rem,4vw,2.5rem)] font-extrabold tracking-[-0.045em]">Kho từ vựng</h1><p className="mt-2 text-[0.95rem] text-muted">Lưu lại những từ giúp bạn nâng cao điểm số.</p></div><div className="flex flex-wrap gap-2"><input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importFile} /><button onClick={() => fileRef.current?.click()} className="h-10 rounded-[11px] border border-line bg-white px-3.5 text-xs font-bold text-ink transition hover:-translate-y-0.5 hover:border-[#CFC7FF]">↑ Nhập tệp</button><button onClick={exportCsv} className="h-10 rounded-[11px] border border-line bg-white px-3.5 text-xs font-bold text-ink transition hover:-translate-y-0.5 hover:border-[#CFC7FF]">↓ Xuất CSV</button><button onClick={() => setShowAdd((value) => !value)} className="h-10 rounded-[11px] bg-gold px-3.5 text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-golddark">+ Thêm từ</button></div></section>
    {showAdd && <form onSubmit={addWord} className="lexora-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5"><input autoFocus className="h-10 rounded-[10px] border border-line px-3 text-sm" placeholder="Từ *" value={draft.term} onChange={(event) => setDraft({ ...draft, term: event.target.value })} /><input className="h-10 rounded-[10px] border border-line px-3 text-sm" placeholder="Nghĩa *" value={draft.meaning} onChange={(event) => setDraft({ ...draft, meaning: event.target.value })} /><input className="h-10 rounded-[10px] border border-line px-3 text-sm" placeholder="IPA /miːl/" value={draft.ipa} onChange={(event) => setDraft({ ...draft, ipa: event.target.value })} /><input className="h-10 rounded-[10px] border border-line px-3 text-sm" placeholder="Câu ví dụ" value={draft.example} onChange={(event) => setDraft({ ...draft, example: event.target.value })} /><button className="h-10 rounded-[10px] bg-gold text-sm font-bold text-white">Lưu từ</button></form>}
    <section className="lexora-stagger grid gap-4 md:grid-cols-3"><Stat label="Tổng số từ" value={String(words.length)} detail="Trong kho của bạn" icon="Aa" tint="bg-[#EFECFF] text-[#6550DB]" /><Stat label="Cần ôn tập" value={String(words.filter((word) => word.status === "Review").length)} detail="Sẵn sàng luyện tập" icon="↻" tint="bg-[#FFF0E8] text-[#D87855]" /><Stat label="Đã thuộc" value={String(words.filter((word) => word.status === "Mastered").length)} detail="Nhớ vững" icon="✓" tint="bg-[#E7F7F2] text-[#3D9B80]" /></section>
    <section className="lexora-card overflow-hidden"><div className="border-b border-line p-4 sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><label className="relative block min-w-0 flex-1 lg:max-w-md"><span className="sr-only">Tìm kiếm từ vựng</span><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm từ, nghĩa hoặc IPA..." className="h-11 w-full rounded-[11px] border border-line bg-[#FBFAFE] pl-9 pr-3 text-sm outline-none transition focus:border-gold" /></label><div className="flex gap-1.5 overflow-x-auto pb-1">{(["Tất cả từ", "Cần ôn", "Đã thuộc"] as const).map((item) => <button key={item} onClick={() => setFilter(item === "Tất cả từ" ? "All words" : item === "Cần ôn" ? "To review" : "Mastered")} className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition ${((item === "Tất cả từ" && filter === "All words") || (item === "Cần ôn" && filter === "To review") || (item === "Đã thuộc" && filter === "Mastered")) ? "bg-[#EFECFF] text-[#6550DB]" : "text-muted hover:bg-[#F7F6FA]"}`}>{item}</button>)}</div></div></div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] border-collapse"><thead><tr className="border-b border-line text-left text-[0.68rem] font-bold uppercase tracking-[0.1em] text-muted"><th className="px-5 py-4">Từ, nghĩa và IPA</th><th className="px-5 py-4">Ví dụ</th><th className="px-5 py-4">Loại từ</th><th className="px-5 py-4">Trạng thái</th></tr></thead><tbody>{filtered.map((word) => <tr key={`${word.term}-${word.ipa}`} className="border-b border-line/70 transition last:border-0 hover:bg-[#FBFAFE]"><td className="px-5 py-4"><div className="font-bold">{word.term}</div><div className="mt-1 text-sm text-inksoft">{word.meaning}</div><div className="mt-1 font-serif text-sm text-[#765FD5]">{word.ipa}</div></td><td className="max-w-xs px-5 py-4 text-sm italic text-muted">{word.example}</td><td className="px-5 py-4"><span className="rounded-full bg-[#EFECFF] px-2.5 py-1 text-[0.68rem] font-bold text-[#6550DB]">{word.type}</span></td><td className="px-5 py-4">{word.status === "Mastered" ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E7F7F2] px-2.5 py-1 text-[0.68rem] font-bold text-[#398B73]">✓ Đã thuộc</span> : reviewLink}</td></tr>)}</tbody></table></div>
      <div className="space-y-3 p-3 md:hidden">{filtered.map((word) => <article key={`${word.term}-${word.ipa}`} className="rounded-[13px] border border-line bg-[#FBFAFE] p-4"><div className="flex items-start justify-between gap-3"><div><b className="text-base">{word.term}</b><p className="mt-1 text-sm text-inksoft">{word.meaning}</p><p className="mt-1 font-serif text-sm text-[#765FD5]">{word.ipa}</p></div>{word.status === "Mastered" ? <span className="shrink-0 rounded-full bg-[#E7F7F2] px-2 py-1 text-[0.65rem] font-bold text-[#398B73]">✓ Đã thuộc</span> : reviewLink}</div><p className="mt-3 text-sm italic text-muted">{word.example}</p><span className="mt-3 inline-block rounded-full bg-[#EFECFF] px-2.5 py-1 text-[0.65rem] font-bold text-[#6550DB]">{word.type}</span></article>)}</div>
      {filtered.length === 0 && <div className="p-10 text-center text-sm text-muted">Không có từ phù hợp với tìm kiếm.</div>}<div className="flex items-center justify-between border-t border-line px-5 py-3 text-xs text-muted"><span>Hiển thị {filtered.length} trên {words.length} từ</span><span className="hidden sm:inline">Đã lưu trong phiên học này</span></div>
    </section>
  </div>;
}

function Stat({ label, value, detail, icon, tint }: { label: string; value: string; detail: string; icon: string; tint: string }) { return <article className="lexora-card flex items-center gap-4 p-5"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] text-sm font-extrabold ${tint}`}>{icon}</span><div><p className="text-xs font-semibold text-muted">{label}</p><div className="mt-1 flex items-baseline gap-2"><strong className="text-2xl font-extrabold">{value}</strong><span className="text-[0.68rem] font-semibold text-muted">{detail}</span></div></div></article>; }
