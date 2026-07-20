"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SpeakButton from "@/components/SpeakButton";
import { toast } from "@/components/Toast";
import { cx } from "@/components/ui";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";

type SetSummary = { id: number; name: string; type: string; count: number; className: string | null };
type MixedWord = { id: number; setId: number; setName: string; meaning: string; term: string; ipa: string | null; example: string | null; wtype: string | null };
type PracticeMode = "interleaved" | "fill" | "mc";
type Question = MixedWord & { choices: string[]; questionMode: "fill" | "mc" };
type WrongWord = { wordId: number; setId: number };

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

function matches(value: string, expected: string) {
  const answer = normalize(value);
  return Boolean(answer && expected.split("/").some((option) => normalize(option) === answer));
}

export default function MixedPracticePage() {
  const router = useRouter();
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selectedSetIds, setSelectedSetIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<PracticeMode>("interleaved");
  const [count, setCount] = useState("20");
  const [starting, setStarting] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [wrongWords, setWrongWords] = useState<WrongWord[]>([]);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const startedAtRef = useRef(Date.now());

  useUnsavedChangesWarning(started && !finished, "Bài kiểm tra tổng hợp đang diễn ra. Bạn vẫn muốn rời trang?");

  useEffect(() => {
    let active = true;
    setSets(null);
    setLoadError(false);
    fetch("/api/sets")
      .then(async (res) => { if (!res.ok) throw new Error("load failed"); return res.json(); })
      .then((data) => {
        if (!active) return;
        const eligible = (data.sets || []).filter((item: SetSummary) => item.type === "ielts_vocab" && item.count > 0);
        setSets(eligible);
        setSelectedSetIds(eligible.slice(0, Math.min(3, eligible.length)).map((item: SetSummary) => item.id));
      })
      .catch(() => { if (active) { setSets([]); setLoadError(true); } });
    return () => { active = false; };
  }, [loadAttempt]);

  const filteredSets = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("vi");
    return (sets || []).filter((item) => !query || `${item.name} ${item.className || ""}`.toLocaleLowerCase("vi").includes(query));
  }, [search, sets]);
  const question = questions[index];
  const activeMode = question?.questionMode || "mc";
  const answerCorrect = checked && !!question && matches(answer, question.term);

  async function startPractice() {
    if (selectedSetIds.length === 0) { toast("Hãy chọn ít nhất một bộ từ."); return; }
    setStarting(true);
    try {
      const res = await fetch(`/api/mixed-practice?setIds=${selectedSetIds.join(",")}&count=${count}`);
      if (!res.ok) { const data = await res.json().catch(() => null); throw new Error(data?.error || "Không thể tạo bài."); }
      const data = await res.json();
      const words: MixedWord[] = data.words || [];
      if (words.length === 0) throw new Error("Các bộ đã chọn chưa có từ phù hợp.");
      const uniqueTerms = [...new Set(words.map((word) => word.term).filter(Boolean))];
      if (mode !== "fill" && uniqueTerms.length < 2) throw new Error("Cần ít nhất hai từ khác nhau để tạo câu trắc nghiệm.");
      const prepared = words.map((word, wordIndex) => ({
        ...word,
        questionMode: mode === "interleaved" ? (wordIndex % 2 === 0 ? "mc" as const : "fill" as const) : mode,
        choices: shuffle([word.term, ...shuffle(uniqueTerms.filter((term) => term !== word.term)).slice(0, 3)]),
      }));
      setQuestions(prepared);
      setStarted(true);
      setIndex(0);
      setAnswer("");
      setChecked(false);
      setScore(0);
      setWrongWords([]);
      setFinished(false);
      setSaved(false);
      setSaveError(false);
      startedAtRef.current = Date.now();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Không thể tạo bài kiểm tra.");
    } finally {
      setStarting(false);
    }
  }

  function grade(value = answer) {
    if (!question || checked || !value.trim()) return;
    const correct = matches(value, question.term);
    setAnswer(value);
    setChecked(true);
    if (correct) setScore((current) => current + 1);
    else setWrongWords((current) => [...current, { wordId: question.id, setId: question.setId }]);
  }

  function next() {
    if (!checked) return;
    if (index >= questions.length - 1) { setFinished(true); return; }
    setIndex((current) => current + 1);
    setAnswer("");
    setChecked(false);
  }

  async function saveResult() {
    if (saving || saved) return;
    setSaving(true);
    setSaveError(false);
    try {
      const res = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setId: null,
          setName: `Kiểm tra tổng hợp (${selectedSetIds.length} bộ)`,
          mode: "mixed",
          score,
          total: questions.length,
          durationSeconds: Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
          wrongWords,
          practicedWords: questions.map((item) => ({ wordId: item.id, setId: item.setId })),
          wordsPracticed: questions.length,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      setSaved(true);
    } catch {
      setSaveError(true);
      toast("Đã hoàn thành nhưng chưa thể lưu kết quả.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { if (finished && !saved && !saving && !saveError) void saveResult(); });
  useEffect(() => { if (checked) nextButtonRef.current?.focus(); else if (started && !finished && activeMode === "fill") inputRef.current?.focus(); }, [activeMode, checked, finished, index, started]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!started || finished) return;
      const target = event.target as HTMLElement | null;
      if (checked && event.key === "Enter") { event.preventDefault(); next(); return; }
      if (activeMode === "mc" && !checked && !(target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) {
        const choiceIndex = Number(event.key) - 1;
        if (choiceIndex >= 0 && choiceIndex < (question?.choices.length || 0)) { event.preventDefault(); grade(question.choices[choiceIndex]); }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!started) return (
    <div className={cx.panel}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className={cx.h2}>🎯 Kiểm tra tổng hợp</h2><div className={cx.desc}>Trộn từ giữa nhiều chủ đề để kiểm tra khả năng nhớ thật, không phụ thuộc thứ tự của từng bộ.</div></div><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>← Trang học bài</button></div>
      {sets === null ? <div className={cx.empty} role="status">Đang tải các bộ từ...</div> : loadError ? <div className={cx.empty}>Không thể tải danh sách bộ từ.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setLoadAttempt((value) => value + 1)}>Thử lại</button></div></div> : sets.length === 0 ? <div className={cx.empty}>Chưa có bộ từ IELTS phù hợp.</div> : (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <section className="rounded-xl border border-line bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">1. Chọn bộ từ</h3><div className="mt-0.5 text-xs text-muted">Đã chọn {selectedSetIds.length}/{sets.length} bộ</div></div><div className="flex gap-2"><button className="text-xs font-medium text-golddark hover:underline" onClick={() => setSelectedSetIds(sets.map((item) => item.id))}>Chọn tất cả</button><button className="text-xs text-muted hover:underline" onClick={() => setSelectedSetIds([])}>Bỏ chọn</button></div></div>
            <input type="search" className={`${cx.input} !mb-3`} placeholder="Tìm bộ từ..." value={search} onChange={(event) => setSearch(event.target.value)} />
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {filteredSets.map((item) => {
                const selected = selectedSetIds.includes(item.id);
                return <label key={item.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${selected ? "border-gold bg-goldpale/40" : "border-line hover:border-gold/60"}`}><input type="checkbox" checked={selected} onChange={() => setSelectedSetIds((current) => selected ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.name}</span><span className="text-xs text-muted">{item.count} từ{item.className ? ` · ${item.className}` : ""}</span></span></label>;
              })}
              {filteredSets.length === 0 && <div className="py-6 text-center text-sm text-muted">Không tìm thấy bộ từ.</div>}
            </div>
          </section>
          <section className="h-fit rounded-xl border border-gold/50 bg-goldpale/30 p-4 lg:sticky lg:top-4">
            <h3 className="font-semibold">2. Thiết lập bài</h3>
            <label className={`${cx.label} mt-4`}>Kiểu câu hỏi<select className={`${cx.input} mt-1`} value={mode} onChange={(event) => setMode(event.target.value as PracticeMode)}><option value="interleaved">Trộn điền từ + trắc nghiệm</option><option value="mc">Trắc nghiệm</option><option value="fill">Điền từ tiếng Anh</option></select></label>
            <label className={cx.label}>Số câu<select className={`${cx.input} mt-1`} value={count} onChange={(event) => setCount(event.target.value)}><option value="10">10 câu</option><option value="20">20 câu</option><option value="50">50 câu</option></select></label>
            <div className="mb-4 rounded-lg bg-white/70 p-3 text-xs text-muted">{mode === "interleaved" ? "Mỗi câu luân phiên giữa trắc nghiệm và điền từ" : "Câu hỏi được trộn ngẫu nhiên"} từ {selectedSetIds.length || 0} bộ đã chọn.</div>
            <button className={`${cx.btn} ${cx.btnGold} w-full`} disabled={selectedSetIds.length === 0 || starting} onClick={() => void startPractice()}>{starting ? "Đang tạo bài..." : "Bắt đầu kiểm tra"}</button>
          </section>
        </div>
      )}
    </div>
  );

  if (finished) return (
    <div className={cx.panel}>
      <section className="mx-auto max-w-lg rounded-xl border border-gold bg-goldpale/40 p-6 text-center"><div className="text-4xl" aria-hidden="true">🏁</div><h2 className="mt-2 font-serif text-xl font-bold">Hoàn thành bài tổng hợp</h2><div className="mt-3 font-serif text-4xl font-bold text-golddark">{score}/{questions.length}</div><div className="mt-1 text-sm text-muted">{Math.round(score / questions.length * 100)}% chính xác · {selectedSetIds.length} bộ từ</div><div className="mt-3 text-xs text-muted">{saved ? "✓ Đã lưu vào lịch sử học" : saving ? "Đang lưu kết quả..." : saveError ? "Chưa thể lưu kết quả" : ""}</div><div className="mt-5 flex flex-wrap justify-center gap-2">{saveError && <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => { setSaveError(false); void saveResult(); }}>Lưu lại</button>}<button className={`${cx.btn} ${cx.btnGold}`} onClick={() => { setStarted(false); setFinished(false); }}>Tạo bài mới</button><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/review")}>Ôn từ sai</button></div></section>
    </div>
  );

  return question ? (
    <div className={cx.panel}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className={cx.h2}>🎯 Kiểm tra tổng hợp</h2><span className="text-sm text-muted">Câu {index + 1}/{questions.length} · {score} đúng</span></div>
      <div className="mb-5 mt-3 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${(index + (checked ? 1 : 0)) / questions.length * 100}%` }} /></div>
      <section className="mx-auto max-w-xl rounded-2xl border border-line bg-white p-5 text-center sm:p-8">
        <span className={cx.badgeGold}>{question.setName}</span><div className="mt-3 text-xs font-medium uppercase tracking-wider text-golddark">{activeMode === "fill" ? "Điền từ" : "Trắc nghiệm"}</div><div className="mt-5 text-xs uppercase tracking-widest text-muted">Nghĩa tiếng Việt</div><div className="mt-2 font-serif text-2xl font-bold">{question.meaning}</div>
        {activeMode === "fill" ? <div className="mt-6"><label className="sr-only" htmlFor="mixed-answer">Nhập từ tiếng Anh</label><input ref={inputRef} id="mixed-answer" className={`${cx.input} mx-auto max-w-sm text-center text-lg ${checked ? answerCorrect ? "!border-ok !bg-okbg" : "!border-bad !bg-badbg" : ""}`} disabled={checked} autoComplete="off" spellCheck={false} placeholder="Nhập từ tiếng Anh..." value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !checked) grade(); }} /></div> : <div className="mt-6 grid gap-2 sm:grid-cols-2">{question.choices.map((choice, choiceIndex) => { const chosen = checked && answer === choice; const correct = checked && matches(choice, question.term); return <button key={choice} className={`rounded-xl border p-3 text-left text-sm ${correct ? "border-ok bg-okbg text-ok" : chosen ? "border-bad bg-badbg text-bad" : "border-line hover:border-gold hover:bg-goldpale/30"}`} disabled={checked} onClick={() => grade(choice)}><span className="mr-2 text-xs text-muted">{choiceIndex + 1}</span>{choice}</button>; })}</div>}
        {checked && <div className={`mt-5 rounded-lg p-3 text-sm ${answerCorrect ? "bg-okbg text-ok" : "bg-badbg text-bad"}`}>{answerCorrect ? "✓ Chính xác!" : <>Chưa đúng. Đáp án: <b>{question.term}</b></>}{question.ipa && <span className="ml-2 text-golddark">{question.ipa}</span>}<span className="ml-2 inline-block"><SpeakButton text={question.term} /></span>{question.example && <div className="mt-2 text-xs italic text-muted">VD: {question.example}</div>}</div>}
        {!checked ? activeMode === "fill" && <button className={`${cx.btn} ${cx.btnGold}`} disabled={!answer.trim()} onClick={() => grade()}>Kiểm tra</button> : <button ref={nextButtonRef} className={`${cx.btn} ${cx.btnGold} mt-5`} onClick={next}>{index === questions.length - 1 ? "Xem kết quả" : "Câu tiếp theo →"}<kbd className="ml-2 rounded border border-current/30 px-1 text-[0.65rem]">Enter</kbd></button>}
      </section>
    </div>
  ) : null;
}
