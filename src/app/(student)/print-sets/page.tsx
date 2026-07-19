"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/Toast";
import { cx } from "@/components/ui";

type SetSummary = { id: number; name: string; type: string; count: number; className: string | null };
type PrintableWord = { id: number; setId: number; setName: string; setType: string; meaning: string; term: string | null; v1: string | null; v2: string | null; v3: string | null; ipa: string | null; wtype: string | null; example: string | null };
type PrintableSet = { id: number; name: string; type: string; words: PrintableWord[] };
type Layout = "list" | "cards" | "worksheet";

function answer(word: PrintableWord) {
  return word.setType === "irregular_verb" ? `${word.v1 || ""} — ${word.v2 || ""} — ${word.v3 || ""}` : word.term || "";
}

function exampleHint(word: PrintableWord) {
  const example = word.example || "";
  const target = (word.term || word.v1 || "").split("/")[0].trim();
  if (!target) return example;
  return example.replace(new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "________");
}

export default function PrintSetsPage() {
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("Phiếu học từ vựng IELTS");
  const [layout, setLayout] = useState<Layout>("list");
  const [showIpa, setShowIpa] = useState(true);
  const [showExample, setShowExample] = useState(false);
  const [showAnswerKey, setShowAnswerKey] = useState(true);
  const [documentSets, setDocumentSets] = useState<PrintableSet[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let active = true;
    setSets(null);
    setLoadError(false);
    fetch("/api/sets").then(async (res) => { if (!res.ok) throw new Error("load failed"); return res.json(); })
      .then((data) => { if (active) setSets((data.sets || []).filter((item: SetSummary) => item.count > 0)); })
      .catch(() => { if (active) { setSets([]); setLoadError(true); } });
    return () => { active = false; };
  }, [loadAttempt]);

  const filteredSets = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("vi");
    return (sets || []).filter((item) => !query || `${item.name} ${item.className || ""}`.toLocaleLowerCase("vi").includes(query));
  }, [search, sets]);
  const totalWords = documentSets.reduce((sum, item) => sum + item.words.length, 0);

  function toggleSet(id: number) {
    if (selectedIds.includes(id)) { setSelectedIds((current) => current.filter((item) => item !== id)); return; }
    if (selectedIds.length >= 5) { toast("Mỗi phiếu hỗ trợ tối đa 5 bộ từ để bản in không quá dài."); return; }
    setSelectedIds((current) => [...current, id]);
  }

  async function generate() {
    if (selectedIds.length === 0) { toast("Hãy chọn ít nhất một bộ từ."); return; }
    setGenerating(true);
    try {
      const res = await fetch(`/api/print-sets?setIds=${selectedIds.join(",")}`);
      if (!res.ok) throw new Error("generate failed");
      const data = await res.json();
      setDocumentSets(data.sets || []);
      setTruncated(Boolean(data.truncated));
      window.setTimeout(() => document.getElementById("print-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch {
      toast("Không thể tạo phiếu học. Vui lòng thử lại.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <section className={`${cx.panel} print:hidden`}>
        <h2 className={cx.h2}>🖨️ Phiếu học ngoại tuyến</h2>
        <div className={cx.desc}>Chọn bộ từ và mẫu trình bày, sau đó in trực tiếp hoặc chọn “Lưu dưới dạng PDF”.</div>
        {sets === null ? <div className={cx.empty} role="status">Đang tải các bộ từ...</div> : loadError ? <div className={cx.empty}>Không thể tải danh sách.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setLoadAttempt((value) => value + 1)}>Thử lại</button></div></div> : (
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <div className="rounded-xl border border-line bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-2"><div><h3 className="font-semibold">Chọn tối đa 5 bộ</h3><div className="text-xs text-muted">Đã chọn {selectedIds.length}/5</div></div>{selectedIds.length > 0 && <button className="text-xs text-muted hover:underline" onClick={() => setSelectedIds([])}>Bỏ chọn</button>}</div>
              <input type="search" className={`${cx.input} !mb-3`} placeholder="Tìm bộ từ..." value={search} onChange={(event) => setSearch(event.target.value)} />
              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">{filteredSets.map((item) => { const selected = selectedIds.includes(item.id); return <label key={item.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${selected ? "border-gold bg-goldpale/40" : "border-line hover:border-gold/60"}`}><input type="checkbox" checked={selected} onChange={() => toggleSet(item.id)} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.name}</span><span className="text-xs text-muted">{item.count} từ · {item.type === "irregular_verb" ? "Động từ bất quy tắc" : "IELTS"}</span></span></label>; })}{filteredSets.length === 0 && <div className="py-6 text-center text-sm text-muted">Không tìm thấy bộ từ.</div>}</div>
            </div>
            <div className="h-fit rounded-xl border border-gold/50 bg-goldpale/30 p-4 lg:sticky lg:top-4">
              <h3 className="font-semibold">Thiết lập bản in</h3>
              <label className={`${cx.label} mt-4`}>Tiêu đề<input className={`${cx.input} mt-1`} maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
              <label className={cx.label}>Mẫu trình bày<select className={`${cx.input} mt-1`} value={layout} onChange={(event) => setLayout(event.target.value as Layout)}><option value="list">Danh sách tra cứu</option><option value="cards">Flashcard cắt rời</option><option value="worksheet">Bài tập điền từ</option></select></label>
              <div className="mb-4 space-y-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={showIpa} onChange={(event) => setShowIpa(event.target.checked)} /> Hiện phiên âm IPA</label><label className="flex items-center gap-2"><input type="checkbox" checked={showExample} onChange={(event) => setShowExample(event.target.checked)} /> Hiện câu ví dụ</label>{layout === "worksheet" && <label className="flex items-center gap-2"><input type="checkbox" checked={showAnswerKey} onChange={(event) => setShowAnswerKey(event.target.checked)} /> Thêm trang đáp án</label>}</div>
              <button className={`${cx.btn} ${cx.btnGold} w-full`} disabled={selectedIds.length === 0 || generating} onClick={() => void generate()}>{generating ? "Đang tạo phiếu..." : "Tạo bản xem trước"}</button>
            </div>
          </div>
        )}
      </section>

      {documentSets.length > 0 && <section id="print-preview" className="bg-white p-5 text-black shadow-sm print:p-0 print:shadow-none">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-black/20 pb-4 print:mb-4"><div><h1 className="font-serif text-2xl font-bold">{title.trim() || "Phiếu học từ vựng"}</h1><div className="mt-1 text-xs text-gray-600">{documentSets.map((item) => item.name).join(" · ")} · {totalWords} từ</div></div><button className={`${cx.btn} ${cx.btnGold} print:hidden`} onClick={() => window.print()}>🖨️ In / Lưu PDF</button></div>
        {truncated && <div className="mb-4 rounded border border-amber-500 bg-amber-50 p-2 text-xs text-amber-800 print:hidden">Bản xem trước được giới hạn ở 500 từ.</div>}
        {layout === "list" && <ListLayout sets={documentSets} showIpa={showIpa} showExample={showExample} />}
        {layout === "cards" && <CardsLayout sets={documentSets} showIpa={showIpa} showExample={showExample} />}
        {layout === "worksheet" && <WorksheetLayout sets={documentSets} showIpa={showIpa} showExample={showExample} showAnswerKey={showAnswerKey} />}
      </section>}
    </div>
  );
}

function ListLayout({ sets, showIpa, showExample }: { sets: PrintableSet[]; showIpa: boolean; showExample: boolean }) {
  return <>{sets.map((set) => <div key={set.id} className="mb-6 break-inside-avoid-page"><h2 className="mb-2 border-b border-black pb-1 font-serif text-lg font-bold">{set.name}</h2><table className="w-full border-collapse text-sm"><thead><tr><th className="border border-black/30 p-2 text-left">#</th><th className="border border-black/30 p-2 text-left">Từ tiếng Anh</th><th className="border border-black/30 p-2 text-left">Nghĩa tiếng Việt</th>{showExample && <th className="border border-black/30 p-2 text-left">Ví dụ</th>}</tr></thead><tbody>{set.words.map((word, index) => <tr key={word.id} className="break-inside-avoid"><td className="border border-black/30 p-2">{index + 1}</td><td className="border border-black/30 p-2"><b>{answer(word)}</b>{showIpa && word.ipa && <div className="text-xs text-gray-600">{word.ipa}</div>}</td><td className="border border-black/30 p-2">{word.meaning}</td>{showExample && <td className="border border-black/30 p-2 text-xs italic">{word.example || "—"}</td>}</tr>)}</tbody></table></div>)}</>;
}

function CardsLayout({ sets, showIpa, showExample }: { sets: PrintableSet[]; showIpa: boolean; showExample: boolean }) {
  const words = sets.flatMap((set) => set.words);
  return <div className="grid grid-cols-2 gap-3">{words.map((word) => <article key={word.id} className="min-h-36 break-inside-avoid border border-dashed border-black p-4 text-center"><div className="text-[0.65rem] uppercase tracking-wide text-gray-500">{word.setName}</div><div className="mt-3 font-serif text-xl font-bold">{answer(word)}</div>{showIpa && word.ipa && <div className="text-sm text-gray-600">{word.ipa}</div>}<div className="mt-3 border-t border-black/20 pt-2">{word.meaning}</div>{showExample && word.example && <div className="mt-2 text-xs italic text-gray-600">{word.example}</div>}</article>)}</div>;
}

function WorksheetLayout({ sets, showIpa, showExample, showAnswerKey }: { sets: PrintableSet[]; showIpa: boolean; showExample: boolean; showAnswerKey: boolean }) {
  const words = sets.flatMap((set) => set.words);
  return <><div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">{words.map((word, index) => <div key={word.id} className="break-inside-avoid border-b border-black/30 pb-3 text-sm"><div><b>{index + 1}.</b> {word.meaning}</div><div className="mt-2 flex items-end gap-2"><span className="text-xs text-gray-500">Đáp án:</span><span className="h-5 flex-1 border-b border-black" /></div>{showIpa && word.ipa && <div className="mt-1 text-xs text-gray-500">IPA: {word.ipa}</div>}{showExample && word.example && <div className="mt-1 text-xs italic text-gray-600">Gợi ý: {exampleHint(word)}</div>}</div>)}</div>{showAnswerKey && <div className="print-page-break mt-8"><h2 className="mb-4 border-b border-black pb-2 font-serif text-xl font-bold">Đáp án</h2><div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">{words.map((word, index) => <div key={word.id}><b>{index + 1}.</b> {answer(word)}</div>)}</div></div>}</>;
}
