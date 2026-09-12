"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import SpeakButton from "@/components/SpeakButton";
import StudyModeNav from "@/components/StudyModeNav";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";
import {
  ITEM_KIND_LABELS, buildCollocationItems, buildClozeItem, buildPatternItems, buildVocabularySession,
  gradeVocabularyItem, type CollocationContent, type PatternContent, type PracticeWord,
  type VocabularyGrade, type VocabularyItem, type VocabularyItemKind,
} from "@/lib/vocabularyPractice";

type Word = PracticeWord & { setId?: number };
type SetDetail = { id: number; name: string; type: "irregular_verb" | "ielts_vocab"; words: Word[] };
type SetContent = {
  collocations?: CollocationContent[];
  patterns?: PatternContent[];
  topics?: string[];
};

type DrillResult = {
  itemId: string;
  wordId: number;
  skill: VocabularyItem["skill"];
  correct: boolean;
  assisted: boolean;
  firstAnswer: string;
  canonical: string;
  prompt: string;
};

export type VocabularyDrillSessionProps = {
  kind: VocabularyItemKind;
  title: string;
  intro: string;
  emptyTitle: string;
  emptyDetail: string;
};

const COUNT_CHOICES = [10, 20, 0] as const;

function countLabel(value: number) {
  return value === 0 ? "Tất cả" : `${value} câu`;
}

export default function VocabularyDrillSession({ kind, title, intro, emptyTitle, emptyDetail }: VocabularyDrillSessionProps) {
  const params = useParams<{ setId: string }>();
  const router = useRouter();
  const [set, setSet] = useState<SetDetail | null>(null);
  const [content, setContent] = useState<Record<string, SetContent>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [countChoice, setCountChoice] = useState<number>(10);
  const [started, setStarted] = useState(false);
  const [session, setSession] = useState<{ items: VocabularyItem[]; blocks: ReturnType<typeof buildVocabularySession>["blocks"] }>({ items: [], blocks: [] });
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(false);
  const [grade, setGrade] = useState<VocabularyGrade | null>(null);
  const [assisted, setAssisted] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [results, setResults] = useState<DrillResult[]>([]);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const startedAtRef = useRef(Date.now());
  const savedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    setStarted(false);
    setFinished(false);
    savedRef.current = false;
    fetch(`/api/sets/${params.setId}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("load failed");
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        setSet(data.set);
        setContent(data.content || {});
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoadError(true);
        setLoading(false);
      });
    return () => { active = false; };
  }, [params.setId]);

  const words = useMemo(() => (set?.words || []).filter((word) => (word.term || "").trim()), [set]);
  const contentMaps = useMemo(() => {
    const collocations = new Map<number, CollocationContent[]>();
    const patterns = new Map<number, PatternContent[]>();
    for (const [key, value2] of Object.entries(content)) {
      const wordId = Number(key);
      collocations.set(wordId, value2.collocations || []);
      patterns.set(wordId, value2.patterns || []);
    }
    return { collocations, patterns };
  }, [content]);

  const buildItems = useCallback((target: VocabularyItemKind) => {
    const items: VocabularyItem[] = [];
    for (const word of words) {
      if (target === "collocation") items.push(...buildCollocationItems(word, contentMaps.collocations.get(word.id) || []));
      if (target === "pattern") items.push(...buildPatternItems(word, contentMaps.patterns.get(word.id) || []));
      if (target === "cloze") {
        const cloze = buildClozeItem(word);
        if (cloze) items.push(cloze);
      }
    }
    return items;
  }, [contentMaps, words]);

  const availableModes = useMemo(() => {
    const modes = ["learn", "fill", "mc", "match", "dictation", "listen", "pronunciation", "sentence", "timed"];
    if (set?.type === "irregular_verb") return modes;
    for (const candidate of ["collocation", "pattern", "cloze"] as VocabularyItemKind[]) {
      if (buildItems(candidate).length) modes.push(candidate);
    }
    return modes;
  }, [buildItems, set?.type]);

  const current = session.items[index];
  const total = session.items.length;
  const score = results.filter((item) => item.correct).length;

  useEffect(() => {
    if (checked || !current) return;
    inputRef.current?.focus();
  }, [checked, current, index]);

  function startSession(limit: number) {
    const items = buildItems(kind);
    if (!items.length) {
      toast(emptyDetail);
      return;
    }
    setSession(buildVocabularySession(items, limit));
    setIndex(0);
    setValue("");
    setChecked(false);
    setGrade(null);
    setAssisted(false);
    setShowHint(false);
    setResults([]);
    setFinished(false);
    savedRef.current = false;
    startedAtRef.current = Date.now();
    setCountChoice(limit);
    setStarted(true);
  }

  async function finishSession(finalResults: DrillResult[]) {
    if (!set || savedRef.current) return;
    savedRef.current = true;
    setSaving(true);
    const wordIds = [...new Set(finalResults.map((item) => item.wordId))];
    const wrongWordIds = new Set(finalResults.filter((item) => !item.correct).map((item) => item.wordId));
    try {
      const response = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setId: set.id,
          setName: set.name,
          mode: kind,
          score: finalResults.filter((item) => item.correct).length,
          total: finalResults.length,
          durationSeconds: Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)),
          timed: false,
          wrongWords: [...wrongWordIds].map((wordId) => ({ wordId, setId: set.id })),
          practicedWords: wordIds.map((wordId) => ({ wordId, setId: set.id })),
          wordsPracticed: wordIds.length,
          skillOutcomes: finalResults.map((item) => ({
            wordId: item.wordId, skill: item.skill, correct: item.correct, assisted: item.assisted,
          })),
        }),
      });
      if (!response.ok) throw new Error("save failed");
    } catch {
      savedRef.current = false;
      toast("Chưa thể lưu tiến độ phiên luyện này.");
    } finally {
      setSaving(false);
    }
  }

  function check() {
    if (!current || checked || !value.trim()) return;
    const nextGrade = gradeVocabularyItem(current, value);
    const result: DrillResult = {
      itemId: current.id, wordId: current.wordId, skill: current.skill,
      correct: nextGrade.correct, assisted: assisted || showHint,
      firstAnswer: value.trim(), canonical: nextGrade.canonical, prompt: current.prompt,
    };
    setGrade(nextGrade);
    setChecked(true);
    setResults((previous) => [...previous, result]);
  }

  function next() {
    if (!checked) return;
    if (index + 1 >= total) {
      setFinished(true);
      void finishSession(results);
      return;
    }
    setIndex((current2) => current2 + 1);
    setValue("");
    setChecked(false);
    setGrade(null);
    setAssisted(false);
    setShowHint(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!checked) check();
    else next();
  }

  if (loading) return <div className={cx.panel}><div className={cx.empty} role="status">Đang tải bộ từ…</div></div>;
  if (loadError || !set) {
    return <div className={cx.panel}><div className={cx.empty}>
      <p>Không tải được bộ từ vựng.</p>
      <button className={`${cx.btn} ${cx.btnGhost} mt-3`} onClick={() => router.refresh()}>Thử lại</button>
    </div></div>;
  }

  const setId = set.id;

  if (!started) {
    const preview = buildItems(kind);
    return (
      <div className="mx-auto w-full max-w-2xl">
        <StudyModeNav setId={setId} active={kind} isVerb={set.type === "irregular_verb"} availableModes={availableModes} />
        <section className={cx.panel}>
          <h1 className={cx.h2}>{title}</h1>
          <p className={cx.desc}>{intro}</p>
          {preview.length === 0 ? (
            <div className={cx.empty}>
              <p className="font-bold text-ink">{emptyTitle}</p>
              <p className="mt-1">{emptyDetail}</p>
              <Link href="/study" className={`${cx.btn} ${cx.btnGhost} mt-4 inline-flex`}>Về Học &amp; luyện</Link>
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                Bộ <b className="text-ink">{set.name}</b> có <b className="text-ink">{preview.length}</b> câu {ITEM_KIND_LABELS[kind].toLowerCase()}.
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Chọn số lượng câu">
                {COUNT_CHOICES.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={countChoice === choice}
                    className={`${cx.btn} ${countChoice === choice ? cx.btnGold : cx.btnGhost}`}
                    onClick={() => setCountChoice(choice)}
                  >
                    {countLabel(choice)}
                  </button>
                ))}
              </div>
              <button type="button" className={`${cx.btn} ${cx.btnGold} mt-4 w-full`} onClick={() => startSession(countChoice)}>
                Bắt đầu luyện
              </button>
            </>
          )}
        </section>
      </div>
    );
  }

  if (finished) {
    const wrong = results.filter((item) => !item.correct);
    return (
      <div className="mx-auto w-full max-w-2xl">
        <section className={cx.panel}>
          <h1 className={cx.h2}>Hoàn thành · {title}</h1>
          <p className={cx.desc}>{score}/{results.length} câu đúng{saving ? " · đang lưu tiến độ…" : ""}</p>
          {wrong.length === 0 ? (
            <p className="text-sm text-ok font-semibold">✔ Không có lỗi nào. Kỹ năng {ITEM_KIND_LABELS[kind]} đang tốt lên.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {wrong.map((item) => (
                <li key={item.itemId} className="rounded-xl border border-[#F0CACA] bg-[#FFF6F6] p-3 text-sm">
                  <p className="font-semibold text-ink">{item.prompt}</p>
                  <p className="mt-1 text-muted">Bạn trả lời: <span className="font-mono">{item.firstAnswer || "—"}</span></p>
                  <p className="mt-1 font-semibold text-[#A94747]">Đáp án: {item.canonical}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className={`${cx.btn} ${cx.btnGold}`} onClick={() => startSession(countChoice)}>Làm lại</button>
            <button type="button" className={`${cx.btn} ${cx.btnGhost}`} onClick={() => { setStarted(false); setFinished(false); }}>Đổi số lượng</button>
            <Link href="/study" className={`${cx.btn} ${cx.btnGhost} inline-flex`}>Về Học &amp; luyện</Link>
          </div>
        </section>
      </div>
    );
  }

  if (!current) {
    return <div className={cx.panel}><div className={cx.empty}>Không có câu nào trong phiên này.</div></div>;
  }

  const progress = total ? Math.round(((index + (checked ? 1 : 0)) / total) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <StudyModeNav setId={setId} active={kind} isVerb={set.type === "irregular_verb"} availableModes={availableModes} />
      <section className={cx.panel}>
        <header className="mb-3 flex items-center justify-between gap-3 text-xs font-semibold text-muted">
          <span>Câu {Math.min(index + 1, total)}/{total} · {ITEM_KIND_LABELS[kind]}</span>
          <span>{score} đúng</span>
        </header>
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-[#ECEAF5]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Tiến độ phiên luyện">
          <div className="h-full rounded-full bg-[#6550DB] transition-[width]" style={{ width: `${progress}%` }} />
        </div>

        <div className="rounded-2xl border border-line bg-[#FBFAFE] p-4 sm:p-5">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-muted">
            {current.kind === "cloze" ? "Điền từ vào chỗ trống" : current.task === "phrase" || current.task === "recall" ? "Viết lại bằng tiếng Anh" : "Điền vào chỗ trống"}
          </p>
          <p className="mt-3 break-words font-serif text-xl font-bold leading-8 text-ink sm:text-2xl">{current.prompt}</p>
          {current.kind !== "cloze" && (
            <p className="mt-2 text-sm text-muted">
              <span className="font-semibold">Nghĩa:</span> {current.meaning || "—"}
            </p>
          )}
          {current.kind === "cloze" && (
            <p className="mt-2 text-sm text-muted"><span className="font-semibold">Nghĩa của từ:</span> {current.meaning || "—"}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="font-semibold text-ink">{current.term}</span>
            <span className="text-golddark">{(words.find((word) => word.id === current.wordId)?.ipa) || ""}</span>
            <SpeakButton text={current.term} lang="en-GB" />
          </div>
          {current.kind === "cloze" && current.capitalized && !checked && (
            <p className="mt-2 text-xs text-muted">Chỗ trống ở đầu câu — nhớ viết hoa nếu cần.</p>
          )}
        </div>

        <label className="mt-4 block">
          <span className={cx.label}>Câu trả lời của bạn</span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={checked}
            aria-label={`Trả lời: ${current.prompt}`}
            aria-describedby="drill-feedback"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            className={`${cx.input} !mb-0 !min-h-12 !text-base`}
          />
        </label>

        <div id="drill-feedback" aria-live="polite" className="mt-3 min-h-[2.5rem]">
          {checked && grade ? (
            grade.correct ? (
              <p className="rounded-xl border border-[#B6DEC8] bg-[#EEFBF3] p-3 text-sm font-semibold text-[#277A4B]">
                ✔ Chính xác · {grade.canonical}
              </p>
            ) : (
              <div className="rounded-xl border border-[#F0CACA] bg-[#FFF6F6] p-3 text-sm">
                <p className="font-bold text-[#A94747]">✘ {grade.feedbackLabel}</p>
                <p className="mt-1 text-muted">
                  Đáp án: <span className="font-semibold text-ink">{grade.acceptedAnswers.join(" / ")}</span>
                </p>
                {grade.nearMiss && <p className="mt-1 text-xs text-muted">Gần đúng — kiểm tra lại chính tả.</p>}
                <p className="mt-1 font-semibold text-ink">{grade.canonical}</p>
                {current.example && <p className="mt-1 italic text-muted">VD: {current.example}</p>}
              </div>
            )
          ) : (
            <p className="text-xs text-muted">Nhấn Enter để kiểm tra · sau đó Enter để sang câu</p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {!checked ? (
            <>
              <button type="button" className={`${cx.btn} ${cx.btnGold} flex-1`} disabled={!value.trim()} onClick={check}>
                Kiểm tra · Enter
              </button>
              <button
                type="button"
                className={`${cx.btn} ${cx.btnGhost}`}
                onClick={() => { setShowHint(true); setAssisted(true); }}
                aria-expanded={showHint}
              >
                Gợi ý
              </button>
            </>
          ) : (
            <button type="button" className={`${cx.btn} ${cx.btnGold} flex-1`} onClick={next}>
              {index + 1 >= total ? "Xem tổng kết" : "Câu tiếp theo · Enter"}
            </button>
          )}
        </div>
        {showHint && !checked && current.hint && (
          <p className="mt-3 rounded-lg border border-dashed border-gold bg-goldpale/40 px-3 py-2 text-xs text-muted">
            <span className="font-bold">Gợi ý:</span> {current.hint}
          </p>
        )}
      </section>
    </div>
  );
}
