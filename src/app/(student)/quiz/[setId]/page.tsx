"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { cx } from "@/components/ui";
import SpeakButton from "@/components/SpeakButton";
import StudyModeNav from "@/components/StudyModeNav";
import { toast } from "@/components/Toast";
import { groupIndexForQuestion, circleStatus } from "@/lib/quizGroups";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";

type Word = {
  id: number;
  meaning: string;
  v1?: string | null;
  v2?: string | null;
  v3?: string | null;
  term?: string | null;
  example?: string | null;
  wtype?: string | null;
  ipa?: string | null;
};
type SetDetail = { id: number; name: string; type: "irregular_verb" | "ielts_vocab"; words: Word[] };

const GROUP_SIZE = 10;

function norm(s: string | undefined | null) {
  return (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}
function checkMatch(userVal: string | undefined, answerKey: string | null | undefined) {
  const u = norm(userVal);
  if (!u) return false;
  return (answerKey || "").split("/").map(norm).includes(u);
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function fmtClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function QuizPlayerPage() {
  return (
    <Suspense fallback={<div className={cx.panel}><div className={cx.empty} role="status">Đang chuẩn bị bài kiểm tra...</div></div>}>
      <QuizPlayerInner />
    </Suspense>
  );
}

function QuizPlayerInner() {
  const params = useParams<{ setId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const mode = (search.get("mode") as "fill" | "mc") || "fill";
  const timedMode = search.get("timed") === "1";
  const minutes = Math.min(120, Math.max(1, Number(search.get("minutes")) || 15));
  const retest = search.get("retest") === "1";
  const quickMode = search.get("quick") === "1";
  const quickCount = [5, 10, 20].includes(Number(search.get("count"))) ? Number(search.get("count")) : 10;

  const [set, setSet] = useState<SetDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [mistakeIdByWordId, setMistakeIdByWordId] = useState<Record<number, number>>({});
  const [quickRecommendation, setQuickRecommendation] = useState<{ reviewCount: number; newCount: number } | null>(null);
  const [group, setGroup] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Record<string, string>>>({});
  const [mcOptions, setMcOptions] = useState<Record<number, string[]>>({});

  // grading, keyed by group index so a group's graded state survives navigating away and back
  const [checkedGroups, setCheckedGroups] = useState<Record<number, { score: number; total: number }>>({});
  const [grading, setGrading] = useState(false);

  // timed mode grading (whole-set, single submit)
  const [secondsLeft, setSecondsLeft] = useState(minutes * 60);
  const [timedSubmitted, setTimedSubmitted] = useState(false);
  const [timedScore, setTimedScore] = useState<{ score: number; total: number } | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const submittedRef = useRef(false);

  // navigation / autofocus
  const [jumpQuestion, setJumpQuestion] = useState("");
  const [pendingFocus, setPendingFocus] = useState<number | "first" | null>(null);
  const inputRefs = useRef(new Map<number, HTMLInputElement>()).current;
  const rowRefs = useRef(new Map<number, HTMLDivElement>()).current;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadError(false);
      setSet(null);
      try {
        const res = await fetch(quickMode ? `/api/quick-practice?count=${quickCount}` : `/api/sets/${params.setId}`);
        if (!res.ok) throw new Error("load failed");
        const data = await res.json();
        if (!data.set) throw new Error("missing set");
        let loadedSet: SetDetail = data.set;
        if (data.recommendation) setQuickRecommendation(data.recommendation);
        let mistakeMap: Record<number, number> = data.mistakeIdByWordId || {};
        if (retest) {
          const mRes = await fetch("/api/mistakes");
          if (!mRes.ok) throw new Error("mistakes failed");
          const mData = await mRes.json();
          const relevant = (mData.mistakes || []).filter((m: { setId: number }) => m.setId === loadedSet.id);
          const wordIds = new Set(relevant.map((m: { wordId: number }) => m.wordId));
          mistakeMap = Object.fromEntries(relevant.map((m: { wordId: number; id: number }) => [m.wordId, m.id]));
          loadedSet = { ...loadedSet, words: loadedSet.words.filter((w) => wordIds.has(w.id)) };
        }
        if (!cancelled) {
          setSet(loadedSet);
          setMistakeIdByWordId(mistakeMap);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.setId, retest, quickMode, quickCount, loadAttempt]);

  const totalGroups = set ? Math.ceil(set.words.length / GROUP_SIZE) : 0;
  const start = group * GROUP_SIZE;
  const end = set ? Math.min(start + GROUP_SIZE, set.words.length) : 0;
  const isVerb = set?.type === "irregular_verb";
  const effectiveChecked = timedMode ? timedSubmitted : checkedGroups[group] !== undefined;
  const gradedGroups = Object.values(checkedGroups);
  const allGroupsGraded = !timedMode && totalGroups > 0 && gradedGroups.length === totalGroups;
  const overallScore = gradedGroups.reduce((sum, result) => sum + result.score, 0);
  const overallTotal = gradedGroups.reduce((sum, result) => sum + result.total, 0);

  const currentWords = useMemo(() => (set ? set.words.slice(start, end) : []), [set, start, end]);
  const answeredInGroup = useMemo(
    () => currentWords.filter((word) => Object.values(answers[word.id] || {}).some((value) => value.trim() !== "")).length,
    [currentWords, answers]
  );
  const answeredOverall = useMemo(
    () => set ? set.words.filter((word) => Object.values(answers[word.id] || {}).some((value) => value.trim() !== "")).length : 0,
    [set, answers]
  );
  const hasUnsubmittedAnswers = useMemo(() => {
    if (!set || timedSubmitted) return false;
    return set.words.some((word, index) => {
      const answer = answers[word.id];
      const answered = answer && Object.values(answer).some((value) => value.trim() !== "");
      if (!answered) return false;
      return timedMode || checkedGroups[groupIndexForQuestion(index + 1, GROUP_SIZE)] === undefined;
    });
  }, [set, answers, checkedGroups, timedMode, timedSubmitted]);

  const leaveWarning = "Bạn còn câu đã nhập nhưng chưa nộp. Rời trang sẽ làm mất các câu trả lời này. Bạn vẫn muốn rời đi?";
  useUnsavedChangesWarning(hasUnsubmittedAnswers, leaveWarning);

  function leaveQuiz() {
    if (hasUnsubmittedAnswers && !confirm(leaveWarning)) return;
    router.push("/study");
  }

  // build MC options for the words in the current group, once
  useEffect(() => {
    if (!set || isVerb || mode !== "mc") return;
    const allMeanings = set.words.map((w) => w.meaning);
    setMcOptions((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const w of currentWords) {
        if (!next[w.id]) {
          const distractors = shuffle(allMeanings.filter((m) => m !== w.meaning)).slice(0, 3);
          next[w.id] = shuffle([w.meaning, ...distractors]);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [set, currentWords, isVerb, mode]);

  // countdown timer for timed mode
  useEffect(() => {
    if (!timedMode || !set || timedSubmitted) return;
    if (secondsLeft <= 0) {
      submitTimed();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timedMode, set, secondsLeft, timedSubmitted]);

  // focus the requested word's input (or the first word of the group) after navigation
  useEffect(() => {
    if (pendingFocus === null) return;
    const targetId = pendingFocus === "first" ? currentWords[0]?.id : pendingFocus;
    if (targetId == null) {
      setPendingFocus(null);
      return;
    }
    const input = inputRefs.get(targetId);
    const row = rowRefs.get(targetId);
    if (input) {
      input.focus();
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setPendingFocus(null);
  }, [group, currentWords, pendingFocus, inputRefs, rowRefs]);

  function setAnswer(wordId: number, part: string, value: string) {
    setAnswers((prev) => ({ ...prev, [wordId]: { ...prev[wordId], [part]: value } }));
  }

  function resetGroup() {
    if ((answeredInGroup > 0 || checkedGroups[group] !== undefined) && !confirm("Xoá câu trả lời và kết quả chấm của nhóm này để làm lại?")) return;
    setAnswers((prev) => {
      const next = { ...prev };
      currentWords.forEach((w) => delete next[w.id]);
      return next;
    });
    setCheckedGroups((prev) => {
      const next = { ...prev };
      delete next[group];
      return next;
    });
  }

  function goGroup(g: number, focusWordId?: number) {
    setGroup(g);
    setPendingFocus(focusWordId ?? "first");
  }

  function submitJumpQuestion() {
    if (!set) return;
    const n = Number(jumpQuestion);
    if (!jumpQuestion.trim() || Number.isNaN(n) || n < 1 || n > set.words.length) {
      toast("Nhập số thứ tự câu hợp lệ.");
      return;
    }
    const targetWord = set.words[n - 1];
    goGroup(groupIndexForQuestion(n, GROUP_SIZE), targetWord.id);
    setJumpQuestion("");
  }

  function isWordCorrect(w: Word): boolean {
    if (isVerb) {
      const a = answers[w.id] || {};
      return checkMatch(a.v1, w.v1) && checkMatch(a.v2, w.v2) && checkMatch(a.v3, w.v3);
    } else if (mode === "fill") {
      return checkMatch(answers[w.id]?.term, w.term);
    } else {
      return answers[w.id]?.mc === w.meaning;
    }
  }

  function isWordAnswered(w: Word): boolean {
    const a = answers[w.id];
    if (!a) return false;
    if (isVerb) return Boolean(a.v1 || a.v2 || a.v3);
    return Boolean(a.term || a.mc);
  }

  async function clearSolvedMistakes(list: Word[]) {
    const solved = list.filter((w) => isWordCorrect(w) && mistakeIdByWordId[w.id] != null);
    if (solved.length === 0) return;
    await Promise.all(solved.map((w) => fetch(`/api/mistakes/${mistakeIdByWordId[w.id]}`, { method: "DELETE" })));
    setMistakeIdByWordId((prev) => {
      const next = { ...prev };
      solved.forEach((w) => delete next[w.id]);
      return next;
    });
  }

  async function postResult(score: number, total: number, durationSeconds?: number): Promise<boolean> {
    if (!set) return false;
    const practicedWords = set.words.slice(timedMode ? 0 : start, timedMode ? set.words.length : end);
    const wrongWordIds = practicedWords
      .filter((w) => !isWordCorrect(w))
      .map((w) => w.id);
    try {
      const res = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setId: set.id,
          setName: set.name,
          mode,
          score,
          total,
          timed: timedMode,
          durationSeconds,
          wrongWordIds,
          practicedWordIds: practicedWords.map((word) => word.id),
          wordsPracticed: practicedWords.length,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  function restartAllGroups() {
    setAnswers({});
    setCheckedGroups({});
    setGroup(0);
    setJumpQuestion("");
    startedAtRef.current = Date.now();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function grade() {
    if (!set || grading || answeredInGroup === 0) return;
    setGrading(true);
    let correct = 0;
    let total = 0;
    for (const w of currentWords) {
      if (isVerb) {
        total += 3;
        const a = answers[w.id] || {};
        correct += (checkMatch(a.v1, w.v1) ? 1 : 0) + (checkMatch(a.v2, w.v2) ? 1 : 0) + (checkMatch(a.v3, w.v3) ? 1 : 0);
      } else if (mode === "fill") {
        total += 1;
        correct += checkMatch(answers[w.id]?.term, w.term) ? 1 : 0;
      } else {
        total += 1;
        correct += answers[w.id]?.mc === w.meaning ? 1 : 0;
      }
    }
    setCheckedGroups((prev) => ({ ...prev, [group]: { score: correct, total } }));
    const saved = await postResult(correct, total);
    if (!saved) toast("Đã chấm trên màn hình nhưng chưa lưu được vào lịch sử.");
    if (retest || quickMode) {
      try {
        await clearSolvedMistakes(currentWords);
      } catch {
        toast("Đã chấm bài nhưng chưa cập nhật được danh sách từ sai.");
      }
    }
    setGrading(false);
  }

  async function submitTimed() {
    if (!set || submittedRef.current) return;
    submittedRef.current = true;
    let correct = 0;
    let total = 0;
    for (const w of set.words) {
      if (isVerb) {
        total += 3;
        const a = answers[w.id] || {};
        correct += (checkMatch(a.v1, w.v1) ? 1 : 0) + (checkMatch(a.v2, w.v2) ? 1 : 0) + (checkMatch(a.v3, w.v3) ? 1 : 0);
      } else if (mode === "fill") {
        total += 1;
        correct += checkMatch(answers[w.id]?.term, w.term) ? 1 : 0;
      } else {
        total += 1;
        correct += answers[w.id]?.mc === w.meaning ? 1 : 0;
      }
    }
    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);
    setTimedSubmitted(true);
    setTimedScore({ score: correct, total });
    const saved = await postResult(correct, total, durationSeconds);
    if (!saved) toast("Bài đã được chấm nhưng chưa lưu được vào lịch sử.");
    if (retest || quickMode) {
      try {
        await clearSolvedMistakes(set.words);
      } catch {
        toast("Đã chấm bài nhưng chưa cập nhật được danh sách từ sai.");
      }
    }
  }

  function confirmTimedSubmit() {
    if (!set || timedSubmitted) return;
    const unanswered = set.words.length - answeredOverall;
    const message = unanswered > 0
      ? `Bạn còn ${unanswered} câu chưa trả lời. Bạn vẫn muốn nộp bài?`
      : "Nộp bài thi ngay? Bạn sẽ không thể sửa câu trả lời sau khi nộp.";
    if (confirm(message)) void submitTimed();
  }

  if (!set && !loadError) return <div className={cx.panel}><div className={cx.empty} role="status">Đang tải bài kiểm tra...</div></div>;

  if (loadError || !set) {
    return (
      <div className={cx.panel}>
        <div className={cx.empty}>
          Không thể tải bài kiểm tra.
          <div className="mt-3 flex justify-center gap-2">
            <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Thử lại</button>
            <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>Chọn bộ khác</button>
          </div>
        </div>
      </div>
    );
  }

  if (retest && set.words.length === 0) {
    return (
      <div className={cx.panel}>
        <div className={cx.empty}>
          🎉 Bạn không còn từ sai nào trong bộ này.
          <div className="mt-3">
            <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/review")}>
              ← Về trang Ôn từ sai
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (set.words.length === 0) {
    return (
      <div className={cx.panel}>
        <div className={cx.empty}>
          Bộ từ vựng này chưa có câu hỏi nào.
          <div className="mt-3">
            <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>← Chọn bộ khác</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cx.panel}>
      <div className="flex justify-between items-center mb-2.5 flex-wrap gap-2">
        <h2 className={cx.h2}>
          {set.name}{" "}
          {timedMode && <span className={cx.badgeGold}>Thi thử có tính giờ</span>}{" "}
          {retest && <span className={cx.badgeGold}>Làm lại từ sai</span>}{" "}
          {quickMode && <span className={cx.badgeGold}>Luyện nhanh</span>}
        </h2>
        <button className={`${cx.btn} ${cx.btnGhost}`} onClick={leaveQuiz}>
          ← Chọn bộ khác
        </button>
      </div>
      {!retest && !quickMode && (
        <StudyModeNav
          setId={set.id}
          active={timedMode ? "timed" : mode}
          isVerb={isVerb}
        />
      )}

      {quickMode && quickRecommendation && (
        <div className="mb-4 rounded-lg bg-goldpale px-4 py-3 text-sm text-muted">
          Bài luyện cá nhân hóa gồm <b className="text-ink">{quickRecommendation.reviewCount} từ cần ôn</b>
          {quickRecommendation.newCount > 0 && <> và <b className="text-ink">{quickRecommendation.newCount} từ mới</b></>}.
        </div>
      )}

      {timedMode && (
        <div className="flex items-center justify-between gap-3 flex-wrap bg-goldpale rounded-lg px-4 py-3 mb-4">
          <div className="font-serif text-lg">
            ⏱ Thời gian còn lại: <span className={secondsLeft <= 60 ? "text-bad font-bold" : "font-bold"}>{fmtClock(secondsLeft)}</span>
          </div>
          {!timedSubmitted ? (
            <button className={`${cx.btn} ${cx.btnGold}`} onClick={confirmTimedSubmit}>
              Nộp bài thi
            </button>
          ) : (
            <div className="font-serif text-lg">
              Kết quả: <b>{timedScore?.score}</b>/{timedScore?.total}
            </div>
          )}
        </div>
      )}

      {allGroupsGraded && !grading && (
        <section className="mb-5 rounded-xl border border-gold bg-goldpale/50 p-5 text-center" role="status">
          <div className="text-3xl" aria-hidden="true">🏁</div>
          <h3 className="mt-2 font-serif text-xl font-bold">Đã hoàn thành toàn bộ bài luyện</h3>
          <div className="mt-2 text-3xl font-bold text-golddark">{overallScore}/{overallTotal}</div>
          <p className="mt-1 text-sm text-muted">Độ chính xác {overallTotal ? Math.round((overallScore / overallTotal) * 100) : 0}%</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button className={`${cx.btn} ${cx.btnGold}`} onClick={restartAllGroups}>Làm lại toàn bộ</button>
            {overallScore < overallTotal && <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/review")}>Ôn lại từ sai</button>}
            <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push(`/learn/${set.id}`)}>Học lại bằng thẻ</button>
          </div>
        </section>
      )}

      <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
        <label className="text-[0.8rem] text-muted">Nhóm:</label>
        <select
          className={`${cx.input} !mb-0 !w-auto !py-1.5`}
          value={group}
          onChange={(e) => goGroup(Number(e.target.value))}
        >
          {Array.from({ length: totalGroups }).map((_, g) => {
            const s2 = g * GROUP_SIZE + 1;
            const e2 = Math.min((g + 1) * GROUP_SIZE, set.words.length);
            return (
              <option key={g} value={g}>
                Nhóm {g + 1}/{totalGroups} (câu {s2}-{e2})
              </option>
            );
          })}
        </select>
        <input
          type="number"
          min={1}
          max={set.words.length}
          placeholder="Đi tới câu số"
          value={jumpQuestion}
          onChange={(e) => setJumpQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitJumpQuestion();
          }}
          className={`${cx.input} !mb-0 !w-36 !py-1.5`}
        />
        <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={submitJumpQuestion}>
          Đi tới
        </button>
      </div>

      <div className="mb-4">
        <div className="mb-1.5 flex justify-between text-[0.76rem] text-muted">
          <span>Tiến độ nhóm hiện tại</span>
          <span>{answeredInGroup}/{currentWords.length} câu đã trả lời</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-gold transition-[width]"
            style={{ width: `${currentWords.length ? (answeredInGroup / currentWords.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 justify-center mb-4">
        {set.words.map((w, idx) => {
          const g = groupIndexForQuestion(idx + 1, GROUP_SIZE);
          const graded = timedMode ? timedSubmitted : checkedGroups[g] !== undefined;
          const status = circleStatus(graded, isWordAnswered(w), graded ? isWordCorrect(w) : false);
          const cls =
            status === "correct"
              ? "bg-ok text-white border-ok"
              : status === "wrong"
              ? "bg-bad text-white border-bad"
              : status === "answered"
              ? "bg-goldpale border-gold text-golddark"
              : "bg-white border-line text-muted";
          return (
            <button
              key={w.id}
              type="button"
              title={`Câu ${idx + 1}`}
              onClick={() => goGroup(g, w.id)}
              className={`w-7 h-7 rounded-full text-[0.7rem] font-semibold border flex items-center justify-center ${cls}`}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      <div className="text-[0.82rem] text-muted text-center mb-3.5">
        {mode === "mc" ? "Trắc nghiệm" : isVerb ? "Điền V1 / V2 / V3" : "Điền từ tiếng Anh"}
      </div>

      <div>
        {currentWords.map((w, idx) => (
          <div
            key={w.id}
            ref={(el) => {
              if (el) rowRefs.set(w.id, el);
              else rowRefs.delete(w.id);
            }}
            className="grid grid-cols-[30px_1fr] gap-2.5 items-start py-3.5 border-b border-dashed border-line last:border-none"
          >
            <div className="text-muted text-[0.88rem] text-right pt-1">{start + idx + 1}.</div>
            <div>
              {isVerb ? (
                <>
                  <div className="font-bold mb-2">{w.meaning}</div>
                  <div className="flex gap-2 flex-wrap">
                    {(["v1", "v2", "v3"] as const).map((part) => {
                      const val = answers[w.id]?.[part] || "";
                      const ok = effectiveChecked ? checkMatch(val, w[part]) : null;
                      return (
                        <div key={part} className="flex flex-col flex-1 min-w-[100px]">
                          <span className="text-[0.66rem] text-muted mb-0.5 tracking-wide">{part.toUpperCase()}</span>
                          <input
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            disabled={effectiveChecked}
                            value={val}
                            onChange={(e) => setAnswer(w.id, part, e.target.value)}
                            ref={
                              part === "v1"
                                ? (el) => {
                                    if (el) inputRefs.set(w.id, el);
                                    else inputRefs.delete(w.id);
                                  }
                                : undefined
                            }
                            className={`${cx.input} !mb-0 ${
                              effectiveChecked ? (ok ? "!border-ok !bg-okbg" : "!border-bad !bg-badbg") : ""
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {effectiveChecked && (
                    <div className="mt-2 text-[0.84rem] flex items-center gap-2 flex-wrap">
                      {isWordCorrect(w) ? (
                        <span className="text-ok">✔ Chính xác cả 3.</span>
                      ) : (
                        <>
                          <span className="text-bad">✘ Đáp án đúng:</span>{" "}
                          <span className="text-muted">
                            {w.v1} — {w.v2} — {w.v3}
                          </span>
                          {w.ipa && <span className="text-golddark">{w.ipa}</span>}
                          <SpeakButton text={w.v1 || ""} />
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : mode === "fill" ? (
                <>
                  <div className="font-bold mb-2">{w.meaning}</div>
                  <div className="flex flex-col max-w-xs">
                    <span className="text-[0.66rem] text-muted mb-0.5 tracking-wide">TỪ TIẾNG ANH</span>
                    <input
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={effectiveChecked}
                      value={answers[w.id]?.term || ""}
                      onChange={(e) => setAnswer(w.id, "term", e.target.value)}
                      ref={(el) => {
                        if (el) inputRefs.set(w.id, el);
                        else inputRefs.delete(w.id);
                      }}
                      className={`${cx.input} !mb-0 ${
                        effectiveChecked ? (checkMatch(answers[w.id]?.term, w.term) ? "!border-ok !bg-okbg" : "!border-bad !bg-badbg") : ""
                      }`}
                    />
                  </div>
                  {effectiveChecked && (
                    <div className="mt-2 text-[0.84rem] flex items-center gap-2">
                      {checkMatch(answers[w.id]?.term, w.term) ? (
                        <span className="text-ok">✔ Chính xác.</span>
                      ) : (
                        <>
                          <span className="text-bad">✘ Đáp án đúng:</span> <span className="text-muted">{w.term}</span>
                          {w.ipa && <span className="text-golddark">{w.ipa}</span>}
                          <SpeakButton text={w.term || ""} />
                        </>
                      )}
                      {w.example && <span className="text-muted italic">VD: {w.example}</span>}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="font-bold mb-2 flex items-center gap-2 flex-wrap">
                    {w.term}
                    {w.ipa && <span className="text-golddark text-[0.9rem] font-normal">{w.ipa}</span>}
                    <SpeakButton text={w.term || ""} />
                  </div>
                  <div className="flex flex-col gap-1.5 mt-1">
                    {(mcOptions[w.id] || []).map((opt) => {
                      const chosen = answers[w.id]?.mc === opt;
                      let cls = "border-line bg-white";
                      if (chosen) cls = "border-gold bg-goldpale font-semibold";
                      if (effectiveChecked) {
                        if (opt === w.meaning) cls = "border-ok bg-okbg text-ok";
                        else if (chosen) cls = "border-bad bg-badbg text-bad";
                      }
                      return (
                        <button
                          type="button"
                          key={opt}
                          disabled={effectiveChecked}
                          onClick={() => !effectiveChecked && setAnswer(w.id, "mc", opt)}
                          className={`w-full border rounded-lg px-2.5 py-2 text-left cursor-pointer text-[0.88rem] disabled:cursor-default ${cls}`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {!timedMode && checkedGroups[group] && (
        <div className="flex justify-center my-4">
          <div className="w-[110px] h-[110px] rounded-full border-[3px] border-dashed border-golddark flex flex-col items-center justify-center -rotate-[8deg] text-golddark font-serif text-center leading-tight">
            <div className="text-2xl font-bold">
              {checkedGroups[group].score}/{checkedGroups[group].total}
            </div>
            <div className="text-[0.62rem] tracking-widest uppercase mt-0.5">Đã chấm</div>
          </div>
        </div>
      )}

      {!timedMode && (
        <div className="flex gap-2.5 justify-center mt-3.5 flex-wrap">
          <button className={`${cx.btn} ${cx.btnGold}`} disabled={effectiveChecked || grading || answeredInGroup === 0} onClick={grade}>
            {grading ? "Đang chấm..." : answeredInGroup === 0 ? "Hãy trả lời ít nhất 1 câu" : "Kiểm tra đáp án"}
          </button>
          <button
            className={`${cx.btn} ${cx.btnGhost}`}
            disabled={answeredInGroup === 0 && checkedGroups[group] === undefined}
            onClick={resetGroup}
          >
            Làm lại nhóm này
          </button>
        </div>
      )}
      <div className="flex justify-between mt-3.5">
        <button className={`${cx.btn} ${cx.btnGhost}`} disabled={group === 0} onClick={() => goGroup(group - 1)}>
          ◀ Nhóm trước
        </button>
        <button className={`${cx.btn} ${cx.btnGhost}`} disabled={group === totalGroups - 1} onClick={() => goGroup(group + 1)}>
          Nhóm sau ▶
        </button>
      </div>
    </div>
  );
}
