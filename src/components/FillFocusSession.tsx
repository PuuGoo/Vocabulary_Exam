"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SpeakButton from "@/components/SpeakButton";
import StudyModeNav from "@/components/StudyModeNav";
import { toast } from "@/components/Toast";
import { cx } from "@/components/ui";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import {
  canPlayTargetAudioBeforeAnswer,
  claimFillAction,
  chunkFillItems,
  createFirstRecallOutcome,
  getAcceptedAnswers,
  getProgressiveHint,
  gradeFillAnswer,
  isValidFillDraft,
  maskAnswerInExample,
  scheduleDelayedRetry,
  summarizeFillAttempts,
  resolveFillFocusEnterAction,
  type FillAttemptSummary,
  type FillDraft,
  type FillRecallOutcome,
  type FillSessionKind,
} from "@/lib/fillAnswer";

export type FillFocusWord = {
  id: number;
  meaning: string;
  term?: string | null;
  example?: string | null;
  wtype?: string | null;
  ipa?: string | null;
};

type Props = {
  set: { id: number; name: string; words: FillFocusWord[] };
  userId: number;
  sessionKind: FillSessionKind;
  retest: boolean;
  quickMode: boolean;
  mistakeIdByWordId: Record<number, number>;
  totalWordCount: number;
  rangeFrom: number;
  rangeTo: number;
  hasRange: boolean;
  onApplyRange: (from: number, to: number) => void;
  onChooseSet: () => void;
};

const GROUP_SIZE = 10;
const MAX_RETRIES_PER_WORD = 2;

type Feedback = { correct: boolean; nearMiss: boolean; answer: string; retry: boolean; corrected?: boolean };

function buildQueues(groups: FillFocusWord[][]) {
  return Object.fromEntries(groups.map((group, index) => [index, group.map((word) => word.id)]));
}

export default function FillFocusSession({
  set, userId, sessionKind, retest, quickMode, mistakeIdByWordId,
  totalWordCount, rangeFrom, rangeTo, hasRange, onApplyRange, onChooseSet,
}: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const groups = useMemo(() => chunkFillItems(set.words, GROUP_SIZE), [set.words]);
  const wordById = useMemo(() => new Map(set.words.map((word) => [word.id, word])), [set.words]);
  const wordIds = useMemo(() => set.words.map((word) => word.id), [set.words]);
  const draftKey = `lexora-fill-focus-v2-u${userId}-set-${set.id}-${sessionKind}-${retest ? "retest" : "normal"}-${wordIds.join("-")}`;

  const [group, setGroup] = useState(0);
  const [queues, setQueues] = useState<Record<number, number[]>>(() => buildQueues(groups));
  const [cursors, setCursors] = useState<Record<number, number>>({ 0: 0 });
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [outcomes, setOutcomes] = useState<Record<number, FillRecallOutcome>>({});
  const [hintLevels, setHintLevels] = useState<Record<number, number>>({});
  const [audioBeforeAnswer, setAudioBeforeAnswer] = useState<Record<number, boolean>>({});
  const [groupResults, setGroupResults] = useState<Record<number, FillAttemptSummary>>({});
  const [phase, setPhase] = useState<"questions" | "group_result" | "complete">("questions");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [needsCorrection, setNeedsCorrection] = useState(false);
  const [correction, setCorrection] = useState("");
  const [activeHintLevel, setActiveHintLevel] = useState(0);
  const [saving, setSaving] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState(hasRange ? String(rangeFrom) : "1");
  const [rangeEnd, setRangeEnd] = useState(hasRange ? String(rangeTo) : String(totalWordCount));
  const hydratedRef = useRef(false);
  const actionLockRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const correctionInputRef = useRef<HTMLInputElement>(null);

  const queue = queues[group] || groups[group]?.map((word) => word.id) || [];
  const cursor = Math.min(cursors[group] || 0, Math.max(0, queue.length - 1));
  const currentWord = wordById.get(queue[cursor]);
  const originalWords = groups[group] || [];
  const isRetry = Boolean(currentWord && outcomes[currentWord.id]);
  const currentAnswer = currentWord ? answers[currentWord.id] || "" : "";
  const currentOutcome = currentWord ? outcomes[currentWord.id] : undefined;
  const currentHint = currentWord ? getProgressiveHint(currentWord.term, activeHintLevel, currentWord.example) : null;
  const hasActivity = Object.keys(answers).length > 0 || Object.keys(outcomes).length > 0 || Object.keys(groupResults).length > 0;
  // After a Test result is persisted, "Sửa từ sai" is deliberately a learning
  // round. It may reveal feedback and audio, but cannot mutate the first score.
  const correctionRound = phase === "questions" && Boolean(groupResults[group]);
  const effectiveSessionKind: FillSessionKind = correctionRound ? "practice" : sessionKind;
  const totalAnsweredInTest = originalWords.filter((word) => Boolean(answers[word.id]?.trim())).length;
  const allTestAnswered = originalWords.length > 0 && totalAnsweredInTest === originalWords.length;

  useUnsavedChangesWarning(hasActivity && phase !== "complete", "Tiến độ đã được tự động lưu trên thiết bị. Bạn vẫn muốn rời bài luyện này?");

  useEffect(() => {
    hydratedRef.current = false;
    const initialQueues = buildQueues(groups);
    setGroup(0); setQueues(initialQueues); setCursors({ 0: 0 }); setAnswers({}); setOutcomes({});
    setHintLevels({}); setAudioBeforeAnswer({}); setGroupResults({}); setPhase("questions");
    setFeedback(null); setNeedsCorrection(false); setCorrection(""); setActiveHintLevel(0);
    try {
      const parsed = JSON.parse(localStorage.getItem(draftKey) || "null") as unknown;
      if (isValidFillDraft(parsed, wordIds)) {
        const draft = parsed as FillDraft;
        setGroup(Math.min(draft.group, Math.max(0, groups.length - 1)));
        setQueues({ ...initialQueues, ...draft.queues }); setCursors(draft.cursors || { 0: 0 });
        setAnswers(draft.answers || {}); setOutcomes(draft.outcomes || {}); setHintLevels(draft.hintLevels || {});
        setAudioBeforeAnswer(draft.audioBeforeAnswer || {}); setGroupResults(draft.groupResults || {}); setPhase(draft.phase || "questions");
        toast("Đã khôi phục phiên Điền từ đang làm.");
      } else if (parsed) localStorage.removeItem(draftKey);
    } catch { try { localStorage.removeItem(draftKey); } catch {} }
    hydratedRef.current = true;
  }, [draftKey, groups, wordIds]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (phase === "complete") {
      try { localStorage.removeItem(draftKey); } catch {}
      return;
    }
    if (!hasActivity) return;
    const draft: FillDraft = {
      version: 2, savedAt: Date.now(), wordIds, group, queues, cursors, answers, outcomes,
      hintLevels, audioBeforeAnswer, groupResults, phase,
    };
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch {}
    }, 250);
    return () => window.clearTimeout(timer);
  }, [answers, audioBeforeAnswer, cursors, draftKey, group, groupResults, hasActivity, hintLevels, outcomes, phase, queues, wordIds]);

  useEffect(() => {
    if (phase !== "questions" || feedback) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [cursor, feedback, group, phase]);

  // Restore feedback from a saved outcome, but never grade from answer changes.
  useEffect(() => {
    if (effectiveSessionKind !== "practice" || phase !== "questions" || feedback || !currentWord || !currentOutcome || !currentAnswer.trim()) return;
    const grade = gradeFillAnswer(currentAnswer, currentWord.term);
    setFeedback({ correct: grade.correct, nearMiss: grade.nearMiss, answer: currentAnswer, retry: currentOutcome.retryCount > 0 });
    setNeedsCorrection(!currentOutcome.finalCorrect);
  // `currentOutcome`/question changes indicate a restore or transition. The
  // answer itself is intentionally not a dependency: typing is state-only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWord?.id, currentOutcome, effectiveSessionKind, phase]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.key.toLowerCase() !== "h" || target?.closest("input,textarea,select,[contenteditable=true]")) return;
      if (effectiveSessionKind !== "practice" || feedback || phase !== "questions") return;
      event.preventDefault();
      advanceHint();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function navigateWith(updates: Record<string, string | null>) {
    if (hasActivity && !confirm("Tiến độ đã được tự động lưu. Bạn muốn chuyển chế độ?")) return;
    const params = new URLSearchParams(Array.from(search.entries()));
    for (const [key, value] of Object.entries(updates)) value === null ? params.delete(key) : params.set(key, value);
    router.push(`/quiz/${set.id}?${params.toString()}`);
  }

  function leaveSafely() {
    if (hasActivity && phase !== "complete" && !confirm("Tiến độ đã được tự động lưu. Bạn vẫn muốn rời bài luyện này?")) return;
    onChooseSet();
  }

  function applyRangeSafely(from: number, to: number) {
    if (hasActivity && phase !== "complete" && !confirm("Đổi phạm vi sẽ mở một phiên riêng. Tiến độ hiện tại vẫn được lưu. Tiếp tục?")) return;
    onApplyRange(from, to);
  }

  function changeGroup(nextGroup: number) {
    if (nextGroup < 0 || nextGroup >= groups.length) return;
    setGroup(nextGroup);
    setCursors((current) => ({ ...current, [nextGroup]: current[nextGroup] || 0 }));
    setPhase(groupResults[nextGroup] ? "group_result" : "questions");
    setFeedback(null); setNeedsCorrection(false); setCorrection(""); setActiveHintLevel(0); setNavigatorOpen(false);
  }

  function advanceHint() {
    if (!currentWord || effectiveSessionKind !== "practice" || feedback) return;
    const nextLevel = Math.min(4, activeHintLevel + 1);
    setActiveHintLevel(nextLevel);
    setHintLevels((current) => ({ ...current, [currentWord.id]: Math.max(current[currentWord.id] || 0, nextLevel) }));
  }

  function markAudioBeforeAnswer() {
    if (!currentWord || feedback || !canPlayTargetAudioBeforeAnswer(effectiveSessionKind)) return;
    setAudioBeforeAnswer((current) => ({ ...current, [currentWord.id]: true }));
  }

  function scheduleCurrentRetry(outcome: FillRecallOutcome) {
    if (!currentWord || outcome.retryCount >= MAX_RETRIES_PER_WORD) return;
    setQueues((current) => ({ ...current, [group]: scheduleDelayedRetry(current[group] || queue, currentWord.id, cursor, 4) }));
  }

  function checkPracticeAnswer() {
    if (!currentWord || feedback || !currentAnswer.trim() || !claimFillAction(actionLockRef)) return;
    const grade = gradeFillAnswer(currentAnswer, currentWord.term);
    const existing = outcomes[currentWord.id];
    let outcome: FillRecallOutcome;
    if (existing) {
      outcome = { ...existing, retryCount: existing.retryCount + 1, finalCorrect: grade.correct };
    } else {
      outcome = createFirstRecallOutcome({
        wordId: currentWord.id, answer: currentAnswer, answerKey: currentWord.term,
        hintLevelUsed: hintLevels[currentWord.id] || activeHintLevel,
        audioBeforeAnswer: Boolean(audioBeforeAnswer[currentWord.id]),
      });
    }
    setOutcomes((current) => ({ ...current, [currentWord.id]: outcome }));
    setFeedback({ correct: grade.correct, nearMiss: grade.nearMiss, answer: currentAnswer, retry: Boolean(existing) });
    setNeedsCorrection(!grade.correct);
    setCorrection("");
    if (grade.correct && !existing && !outcome.firstTryCorrect) scheduleCurrentRetry(outcome);
    window.setTimeout(() => { actionLockRef.current = false; }, 0);
  }

  function confirmCorrection() {
    if (!currentWord || !needsCorrection) return;
    if (!gradeFillAnswer(correction, currentWord.term).correct) {
      toast("Hãy gõ chính xác đáp án để hoàn tất bước sửa lỗi.");
      correctionInputRef.current?.focus();
      return;
    }
    if (!claimFillAction(actionLockRef)) return;
    const outcome = outcomes[currentWord.id];
    if (outcome) {
      const corrected = { ...outcome, corrected: true, finalCorrect: true };
      setOutcomes((current) => ({ ...current, [currentWord.id]: corrected }));
      scheduleCurrentRetry(corrected);
    }
    setNeedsCorrection(false);
    setFeedback((current) => current ? { ...current, corrected: true } : current);
    requestAnimationFrame(() => correctionInputRef.current?.focus());
    window.setTimeout(() => { actionLockRef.current = false; }, 0);
  }

  async function persistGroupResult(summary: FillAttemptSummary, groupWords: FillFocusWord[]) {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/results", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setId: set.id, setName: set.name, mode: "fill", score: summary.firstTryCorrect, total: summary.total,
          timed: false, wrongWordIds: summary.weakWordIds, practicedWordIds: groupWords.map((word) => word.id), wordsPracticed: groupWords.length,
        }),
      });
      if (!response.ok) throw new Error("save failed");
      if (retest) {
        const strong = groupWords.filter((word) => !summary.weakWordIds.includes(word.id) && mistakeIdByWordId[word.id]);
        await Promise.all(strong.map((word) => fetch(`/api/mistakes/${mistakeIdByWordId[word.id]}`, { method: "DELETE" })));
      }
    } catch {
      toast("Đã chấm bài nhưng chưa lưu được kết quả. Vui lòng thử lại trước khi rời trang.");
    } finally {
      setSaving(false);
    }
  }

  async function finishCurrentQueue(nextOutcomes = outcomes) {
    const originalIds = originalWords.map((word) => word.id);
    const summary = summarizeFillAttempts(Object.values(nextOutcomes), originalIds);
    const alreadySaved = Boolean(groupResults[group]);
    setGroupResults((current) => ({ ...current, [group]: summary }));
    setPhase("group_result");
    setFeedback(null); setNeedsCorrection(false); setCorrection("");
    if (!alreadySaved) await persistGroupResult(summary, originalWords);
  }

  function advancePractice() {
    if (!currentWord || needsCorrection) return;
    const nextIndex = cursor + 1;
    if (nextIndex >= queue.length) {
      void finishCurrentQueue();
      return;
    }
    const nextWordId = queue[nextIndex];
    if (outcomes[nextWordId]) setAnswers((current) => ({ ...current, [nextWordId]: "" }));
    setCursors((current) => ({ ...current, [group]: nextIndex }));
    setFeedback(null); setNeedsCorrection(false); setCorrection(""); setActiveHintLevel(0);
  }

  async function submitTestGroup() {
    if (!allTestAnswered || saving || !claimFillAction(actionLockRef)) return;
    const nextOutcomes = { ...outcomes };
    for (const word of originalWords) {
      nextOutcomes[word.id] = createFirstRecallOutcome({ wordId: word.id, answer: answers[word.id] || "", answerKey: word.term, hintLevelUsed: 0, audioBeforeAnswer: false });
    }
    setOutcomes(nextOutcomes);
    await finishCurrentQueue(nextOutcomes);
    actionLockRef.current = false;
  }

  function advanceTest() {
    if (!currentAnswer.trim()) return;
    const nextIndex = Math.min(originalWords.length - 1, cursor + 1);
    setCursors((current) => ({ ...current, [group]: nextIndex }));
  }

  function beginWeakCorrection() {
    const weak = groupResults[group]?.weakWordIds || [];
    if (!weak.length) return;
    setQueues((current) => ({ ...current, [group]: weak }));
    setCursors((current) => ({ ...current, [group]: 0 }));
    setAnswers((current) => ({ ...current, ...Object.fromEntries(weak.map((id) => [id, ""])) }));
    setPhase("questions"); setFeedback(null); setNeedsCorrection(false); setCorrection(""); setActiveHintLevel(0);
  }

  function nextGroup() {
    if (group >= groups.length - 1) {
      const pending = groups.findIndex((_, index) => !groupResults[index]);
      if (pending >= 0) changeGroup(pending); else setPhase("complete");
      return;
    }
    changeGroup(group + 1);
  }

  function restart() {
    if (hasActivity && !confirm("Xóa toàn bộ tiến độ của bài Điền từ này để làm lại?")) return;
    try { localStorage.removeItem(draftKey); } catch {}
    setGroup(0); setQueues(buildQueues(groups)); setCursors({ 0: 0 }); setAnswers({}); setOutcomes({});
    setHintLevels({}); setAudioBeforeAnswer({}); setGroupResults({}); setPhase("questions");
    setFeedback(null); setNeedsCorrection(false); setCorrection(""); setActiveHintLevel(0);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    const state = effectiveSessionKind === "test" ? "test" : feedback ? (needsCorrection ? "correcting" : feedback.corrected ? "corrected" : feedback.correct ? "correct" : "correcting") : "answering";
    const action = resolveFillFocusEnterAction({ state, value: needsCorrection ? correction : currentAnswer, repeat: event.repeat, isComposing: event.nativeEvent.isComposing });
    if (action === "noop") return;
    event.preventDefault();
    if (action === "test-next") {
      if (cursor === originalWords.length - 1 && allTestAnswered) void submitTestGroup(); else advanceTest();
      return;
    }
    if (action === "check") checkPracticeAnswer();
    else if (action === "confirm") confirmCorrection();
    else advancePractice();
  }

  const result = groupResults[group];
  const overall = summarizeOverall(groupResults, groups.length);
  const progressPercent = originalWords.length ? Math.round(((Math.min(cursor, originalWords.length - 1) + (feedback ? 1 : 0)) / originalWords.length) * 100) : 0;

  return (
    <div className="lexora-page-enter space-y-4 pb-8">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Điền từ tiếng Anh</p><h1 className="mt-1 truncate text-xl font-extrabold sm:text-2xl">{set.name}</h1></div>
        <div className="flex flex-wrap gap-2"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={restart}>Làm lại</button><button className={`${cx.btn} ${cx.btnGhost}`} onClick={leaveSafely}>Chọn bộ khác</button></div>
      </section>

      {!retest && !quickMode && <StudyModeNav setId={set.id} active="fill" isVerb={false} />}

      <section className="rounded-xl border border-line bg-white p-2.5 sm:p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-lg bg-[#F4F2FA] p-1" aria-label="Mục tiêu phiên học">
            <button className={`min-h-10 rounded-md px-3 text-sm font-bold ${sessionKind === "practice" ? "bg-white text-ink shadow-sm" : "text-muted"}`} onClick={() => navigateWith({ session: null, view: "focus" })}>Luyện tập</button>
            <button className={`min-h-10 rounded-md px-3 text-sm font-bold ${sessionKind === "test" ? "bg-white text-ink shadow-sm" : "text-muted"}`} onClick={() => navigateWith({ session: "test", view: "focus" })}>Kiểm tra</button>
          </div>
          <div className="inline-flex rounded-lg border border-line p-1" aria-label="Cách hiển thị câu hỏi">
            <button className="min-h-10 rounded-md bg-ink px-3 text-sm font-bold text-white">Focus</button>
            <button className="min-h-10 rounded-md px-3 text-sm font-bold text-muted" onClick={() => navigateWith({ view: "list" })}>Xem cả nhóm</button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>{set.words.length} từ · Nhóm {group + 1}/{groups.length}</span>
          <button className="min-h-9 rounded-lg px-2 font-bold text-golddark hover:bg-goldpale/40" onClick={() => setCustomOpen((open) => !open)} aria-expanded={customOpen}>Tùy chỉnh bài</button>
        </div>
        {customOpen && <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-line pt-3"><label className="text-xs text-muted">Từ câu<input className={`${cx.input} !mb-0 mt-1 !w-24 text-base`} type="number" min={1} max={totalWordCount} value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} /></label><label className="text-xs text-muted">Đến câu<input className={`${cx.input} !mb-0 mt-1 !w-24 text-base`} type="number" min={1} max={totalWordCount} value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} /></label><button className={`${cx.btn} ${cx.btnGold}`} onClick={() => applyRangeSafely(Number(rangeStart) || 1, Number(rangeEnd) || totalWordCount)}>Áp dụng</button>{hasRange && <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => applyRangeSafely(1, totalWordCount)}>Cả bộ</button>}</div>}
      </section>

      {phase === "complete" ? (
        <CompletionSummary summary={overall} setId={set.id} onRestart={restart} onChooseSet={onChooseSet} />
      ) : phase === "group_result" && result ? (
        <GroupSummary summary={result} words={originalWords} onCorrect={beginWeakCorrection} onNext={nextGroup} lastGroup={group === groups.length - 1} />
      ) : currentWord ? (
        <>
          <div className="rounded-xl border border-line bg-white px-3 py-3 sm:px-4">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted"><label className="flex items-center gap-1">Nhóm <select className="rounded-md border border-line bg-white px-1.5 py-1 text-xs font-bold text-ink" value={group} onChange={(event) => changeGroup(Number(event.target.value))}>{groups.map((items, index) => <option key={index} value={index}>{index + 1}/{groups.length} · {items.length} câu{groupResults[index] ? " · đã chấm" : ""}</option>)}</select></label><span>{isRetry ? "Ôn lại" : `Câu ${Math.min(cursor + 1, originalWords.length)}/${originalWords.length}`}</span><span>{progressPercent}%</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${progressPercent}%` }} /></div>
          </div>

          <section className="mx-auto w-full max-w-3xl rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-7" aria-live="polite">
            {isRetry && <div className="mb-3 inline-flex rounded-full border border-[#CFC7FF] bg-[#F7F5FF] px-3 py-1 text-xs font-bold text-[#6550DB]">↻ Từ yếu quay lại sau vài câu</div>}
            <div className="text-center"><div className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Nghĩa tiếng Việt</div><div className="mt-3 font-serif text-2xl font-bold sm:text-3xl">{currentWord.meaning}</div>{currentWord.wtype && <div className="mt-2 text-sm text-muted"><span className="font-semibold">Loại từ:</span> {currentWord.wtype}</div>}</div>

            {!feedback && effectiveSessionKind === "practice" && <div className="mt-5 flex flex-wrap justify-center gap-2">
              {canPlayTargetAudioBeforeAnswer(effectiveSessionKind) && <span onClickCapture={markAudioBeforeAnswer}><SpeakButton text={currentWord.term || ""} /></span>}
              <button className="min-h-11 rounded-lg border border-[#CFC7FF] bg-[#F7F5FF] px-3 text-sm font-bold text-[#6550DB]" onClick={advanceHint}>💡 Gợi ý {activeHintLevel ? `${activeHintLevel}/4` : ""}<span className="ml-1 hidden text-[0.65rem] sm:inline">(H)</span></button>
            </div>}

            {!feedback && currentHint && <div className="mx-auto mt-4 max-w-xl rounded-xl border border-dashed border-gold bg-goldpale/25 px-4 py-3 text-sm"><div className="text-xs font-bold uppercase tracking-wide text-golddark">{currentHint.label}</div><div className={`mt-1 ${currentHint.revealed ? "font-bold text-ink" : "font-mono text-muted"}`}>{currentHint.value}</div></div>}

            <div className="mx-auto mt-6 max-w-md"><label className="text-xs font-bold uppercase tracking-[0.12em] text-muted" htmlFor={`fill-answer-${currentWord.id}`}>Từ tiếng Anh</label><input ref={inputRef} id={`fill-answer-${currentWord.id}`} type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} readOnly={Boolean(feedback)} className={`${cx.input} !mb-0 mt-2 min-h-12 text-base ${feedback ? feedback.correct ? "!border-ok !bg-okbg/40" : "!border-bad !bg-badbg/30" : ""}`} value={currentAnswer} onChange={(event) => { if (!feedback) setAnswers((current) => ({ ...current, [currentWord.id]: event.target.value })); }} onKeyDown={onInputKeyDown} enterKeyHint="done" /></div>

            {feedback && <AnswerFeedback word={currentWord} feedback={feedback} outcome={currentOutcome} />}

            {feedback && (needsCorrection || feedback.corrected) && <div className="mx-auto mt-5 max-w-md rounded-xl border border-bad/25 bg-badbg/30 p-4"><label className={`text-sm font-bold ${feedback.corrected ? "text-ok" : "text-bad"}`} htmlFor={`fill-correction-${currentWord.id}`}>{feedback.corrected ? "✓ Đã sửa đúng" : "Gõ lại đáp án đúng"}</label><input ref={correctionInputRef} id={`fill-correction-${currentWord.id}`} autoFocus type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} readOnly={Boolean(feedback.corrected)} className={`${cx.input} !mb-0 mt-2 min-h-12 text-base`} value={correction} onChange={(event) => { if (!feedback.corrected) setCorrection(event.target.value); }} onKeyDown={onInputKeyDown} enterKeyHint="done" /></div>}

            <div className="mx-auto mt-5 max-w-md">
              {effectiveSessionKind === "test" ? (cursor === originalWords.length - 1 ? <button className={`${cx.btn} ${cx.btnGold} min-h-12 w-full`} disabled={!allTestAnswered || saving} onClick={() => void submitTestGroup()}>{saving ? "Đang lưu…" : allTestAnswered ? "Nộp nhóm" : `Còn ${originalWords.length - totalAnsweredInTest} câu chưa làm`}</button> : <button className={`${cx.btn} ${cx.btnGold} min-h-12 w-full`} disabled={!currentAnswer.trim()} onClick={advanceTest}>Câu tiếp theo →</button>) : !feedback ? <button className={`${cx.btn} ${cx.btnGold} min-h-12 w-full`} disabled={!currentAnswer.trim()} onClick={checkPracticeAnswer}>Kiểm tra</button> : needsCorrection ? <button className={`${cx.btn} ${cx.btnGold} min-h-12 w-full`} disabled={!correction.trim()} onClick={confirmCorrection}>Xác nhận sửa</button> : <button className={`${cx.btn} ${cx.btnGold} min-h-12 w-full`} onClick={advancePractice}>Câu tiếp theo →</button>}
            </div>
          </section>

          <QuestionNavigator open={navigatorOpen} onToggle={() => setNavigatorOpen((open) => !open)} words={originalWords} currentWordId={currentWord.id} answers={answers} outcomes={outcomes} hintLevels={hintLevels} queue={queue} cursor={cursor} onSelect={(wordId) => { const index = queue.indexOf(wordId); if (index >= 0) { setCursors((current) => ({ ...current, [group]: index })); setFeedback(null); setNeedsCorrection(false); setCorrection(""); setActiveHintLevel(0); } }} />
        </>
      ) : null}
    </div>
  );
}

function AnswerFeedback({ word, feedback, outcome }: { word: FillFocusWord; feedback: Feedback; outcome?: FillRecallOutcome }) {
  const accepted = getAcceptedAnswers(word.term);
  if (feedback.corrected) return <div className="mx-auto mt-5 max-w-xl rounded-xl border border-ok/30 bg-okbg/35 p-4"><div className="font-bold text-ok">✓ Đã sửa đúng</div><div className="mt-2 flex flex-wrap items-center gap-2"><span className="font-serif text-xl font-bold">{accepted.join(" / ")}</span>{word.ipa && <span className="text-golddark">{word.ipa}</span>}<SpeakButton text={word.term || ""} /></div>{word.example && <div className="mt-2 text-sm italic text-muted">{word.example}</div>}</div>;
  if (feedback.correct) return <div className="mx-auto mt-5 max-w-xl rounded-xl border border-ok/30 bg-okbg/35 p-4"><div className="font-bold text-ok">✓ {outcome?.firstTryCorrect ? "Chính xác" : "Đúng sau hỗ trợ"}</div><div className="mt-2 flex flex-wrap items-center gap-2"><span className="font-serif text-xl font-bold">{accepted.join(" / ")}</span>{word.ipa && <span className="text-golddark">{word.ipa}</span>}<SpeakButton text={word.term || ""} /></div>{word.example && <div className="mt-2 text-sm italic text-muted">{word.example}</div>}</div>;
  return <div className="mx-auto mt-5 max-w-xl rounded-xl border border-bad/25 bg-badbg/30 p-4"><div className="font-bold text-bad">✕ {feedback.nearMiss ? "Gần đúng — sai chính tả" : "Chưa chính xác"}</div><div className="mt-2 grid gap-1 text-sm"><div><span className="text-muted">Bạn nhập:</span> <span className="font-semibold line-through decoration-bad">{feedback.answer}</span></div><div><span className="text-muted">Đáp án:</span> <span className="font-bold">{accepted.join(" / ")}</span> {word.ipa && <span className="text-golddark">{word.ipa}</span>}</div></div><div className="mt-2 flex items-center gap-2"><SpeakButton text={word.term || ""} /><span className="text-xs text-muted">Nghe và gõ lại chính xác để tiếp tục.</span></div>{word.example && <div className="mt-2 text-sm italic text-muted">{word.example}</div>}</div>;
}

function QuestionNavigator({ open, onToggle, words, currentWordId, answers, outcomes, hintLevels, queue, cursor, onSelect }: { open: boolean; onToggle: () => void; words: FillFocusWord[]; currentWordId: number; answers: Record<number, string>; outcomes: Record<number, FillRecallOutcome>; hintLevels: Record<number, number>; queue: number[]; cursor: number; onSelect: (wordId: number) => void }) {
  return <section className="mx-auto w-full max-w-3xl rounded-xl border border-line bg-white p-3"><button className="flex min-h-11 w-full items-center justify-between text-sm font-bold sm:hidden" onClick={onToggle}><span>Xem câu</span><span>{open ? "Ẩn" : "Mở"}</span></button><div className={`${open ? "grid" : "hidden"} grid-cols-5 gap-2 sm:grid sm:grid-cols-10`}>{words.map((word, index) => { const outcome = outcomes[word.id]; const pendingRetry = queue.slice(cursor + 1).includes(word.id); const current = word.id === currentWordId; const assisted = Boolean(hintLevels[word.id] || outcome?.audioBeforeAnswer); const state = current ? "hiện tại" : pendingRetry ? "đang chờ ôn lại" : outcome?.firstTryCorrect ? "đúng lần đầu" : outcome ? "đã trả lời sai" : answers[word.id]?.trim() ? "đã trả lời" : "chưa làm"; const icon = pendingRetry ? "↻" : assisted ? "?" : outcome?.firstTryCorrect ? "✓" : outcome ? "×" : index + 1; const tone = current ? "border-ink bg-ink text-white" : pendingRetry ? "border-[#8C78E8] bg-[#F7F5FF] text-[#6550DB]" : outcome?.firstTryCorrect ? "border-ok bg-okbg text-ok" : outcome ? "border-bad bg-badbg text-bad" : answers[word.id]?.trim() ? "border-gold bg-goldpale text-golddark" : "border-line bg-white text-muted"; return <button key={word.id} type="button" aria-label={`Câu ${index + 1}, ${state}`} aria-current={current ? "step" : undefined} title={`Câu ${index + 1}: ${state}`} onClick={() => onSelect(word.id)} className={`min-h-11 rounded-lg border text-sm font-bold ${tone}`}><span aria-hidden="true">{icon}</span><span className="sr-only">Câu {index + 1}</span></button>; })}</div><div className="mt-2 hidden flex-wrap gap-3 text-[0.68rem] text-muted sm:flex"><span>✓ đúng lần đầu</span><span>? dùng hỗ trợ</span><span>× sai</span><span>↻ ôn lại</span></div></section>;
}

function GroupSummary({ summary, words, onCorrect, onNext, lastGroup }: { summary: FillAttemptSummary; words: FillFocusWord[]; onCorrect: () => void; onNext: () => void; lastGroup: boolean }) {
  const weak = words.filter((word) => summary.weakWordIds.includes(word.id));
  const percent = summary.total ? Math.round((summary.firstTryCorrect / summary.total) * 100) : 0;
  return <section className="mx-auto max-w-3xl rounded-2xl border border-line bg-white p-5 text-center shadow-sm sm:p-7"><p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Kết quả nhóm</p><h2 className="mt-2 text-2xl font-extrabold">{summary.firstTryCorrect}/{summary.total}</h2><p className="mt-1 text-sm text-muted">{percent}% đúng lần đầu</p><div className="mx-auto mt-5 grid max-w-xl grid-cols-3 gap-2"><ResultStat label="Đúng ngay" value={summary.firstTryCorrect} tone="ok"/><ResultStat label="Dùng hỗ trợ" value={summary.assisted}/><ResultStat label="Sai lần đầu" value={summary.firstAttemptWrong} tone="bad"/></div><div className="mt-3 text-sm text-muted">Sau sửa lỗi: <b className="text-ink">{summary.finalCorrect}/{summary.total}</b></div>{weak.length > 0 && <div className="mt-5 text-left"><h3 className="text-sm font-bold">Từ cần củng cố</h3><div className="mt-2 flex flex-wrap gap-2">{weak.map((word) => <span key={word.id} className="rounded-full border border-bad/20 bg-badbg/30 px-3 py-1 text-sm">{word.term}</span>)}</div><p className="mt-2 text-xs text-muted">Các từ này đã được gửi vào Mistakes và ưu tiên trong Word SRS.</p></div>}<div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">{weak.length > 0 && <button className={`${cx.btn} ${cx.btnGold} min-h-12`} onClick={onCorrect}>Sửa {weak.length} từ sai</button>}<button className={`${cx.btn} ${weak.length ? cx.btnGhost : cx.btnGold} min-h-12`} onClick={onNext}>{lastGroup ? "Xem tổng kết" : "Nhóm tiếp theo →"}</button></div></section>;
}

function CompletionSummary({ summary, setId, onRestart, onChooseSet }: { summary: FillAttemptSummary; setId: number; onRestart: () => void; onChooseSet: () => void }) {
  const percent = summary.total ? Math.round((summary.firstTryCorrect / summary.total) * 100) : 0;
  return <section className="mx-auto max-w-3xl rounded-2xl border border-gold/40 bg-white p-6 text-center shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Hoàn thành bài</p><h2 className="mt-3 text-3xl font-extrabold">{summary.firstTryCorrect}/{summary.total}</h2><p className="mt-1 text-muted">{percent}% đúng lần đầu</p><div className="mx-auto mt-5 grid max-w-xl grid-cols-3 gap-2"><ResultStat label="Đúng ngay" value={summary.firstTryCorrect} tone="ok"/><ResultStat label="Đúng sau hỗ trợ" value={summary.assisted}/><ResultStat label="Từ còn yếu" value={summary.weakWordIds.length} tone="bad"/></div>{summary.weakWordIds.length > 0 && <p className="mt-4 text-sm text-muted">{summary.weakWordIds.length} từ đã được ưu tiên cho lần ôn tiếp theo.</p>}<div className="mt-6 flex flex-wrap justify-center gap-2">{summary.weakWordIds.length > 0 && <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => location.assign(`/review-today`)}>Ôn {summary.weakWordIds.length} từ yếu</button>}<button className={`${cx.btn} ${cx.btnGhost}`} onClick={onChooseSet}>Về bộ từ</button><button className={`${cx.btn} ${cx.btnGhost}`} onClick={onRestart}>Làm lại</button><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => location.assign(`/learn/${setId}`)}>Học bằng thẻ</button></div></section>;
}

function ResultStat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "bad" }) {
  return <div className="rounded-xl border border-line p-3"><div className={`text-xl font-extrabold ${tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : "text-ink"}`}>{value}</div><div className="mt-1 text-[0.7rem] text-muted">{label}</div></div>;
}

function summarizeOverall(results: Record<number, FillAttemptSummary>, totalGroups: number): FillAttemptSummary {
  const values = Array.from({ length: totalGroups }, (_, index) => results[index]).filter(Boolean);
  return values.reduce<FillAttemptSummary>((sum, item) => ({ total: sum.total + item.total, firstTryCorrect: sum.firstTryCorrect + item.firstTryCorrect, assisted: sum.assisted + item.assisted, firstAttemptWrong: sum.firstAttemptWrong + item.firstAttemptWrong, corrected: sum.corrected + item.corrected, finalCorrect: sum.finalCorrect + item.finalCorrect, weakWordIds: [...sum.weakWordIds, ...item.weakWordIds] }), { total: 0, firstTryCorrect: 0, assisted: 0, firstAttemptWrong: 0, corrected: 0, finalCorrect: 0, weakWordIds: [] });
}
