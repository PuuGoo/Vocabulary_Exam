"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { cx } from "@/components/ui";
import SpeakButton from "@/components/SpeakButton";
import { toast } from "@/components/Toast";
import { Suspense } from "react";

type Question = {
  id: number;
  vnMeaning: string | null;
  phonetic: string | null;
  question: string;
  answer: string;
};

type SentenceExercise = {
  questionId: number;
  sentenceIndex: number;
  targetSentence: string;
  vnMeaning: string | null;
  phonetic: string | null;
  fullQuestion: string;
  fullAnswer: string;
};

type CategoryOpt = {
  name: string;
  count: number;
};

const DRAFT_KEY_PREFIX = "lexora-writing-draft-";

function stripPunct(s: string) {
  return s.replace(/[.,!?;:()""''\[\]{}«»]/g, "");
}

function norm(s: string) {
  return stripPunct(s).trim().toLowerCase().replace(/\s+/g, " ").trim();
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[^A-Za-z0-9\u00C0-\u1EF9]/g, "").replace(/[.!?]+$/, "").trim())
    .filter((s) => /[A-Za-z\u00C0-\u1EF9]/.test(s));
}

function tokenize(s: string): string[] {
  return stripPunct(s).trim().toLowerCase().split(/\s+/).filter(Boolean);
}
function sentenceMatchScore(userSentence: string, sampleSentence: string): {
  score: number;
  userTokens: { word: string; matched: boolean }[];
  sampleTokens: { word: string; matched: boolean }[];
  missedWords: string[];
  extraWords: string[];
} {
  const u = norm(userSentence);
  const s = norm(sampleSentence);
  if (!u || !s) return { score: 0, userTokens: [], sampleTokens: [], missedWords: [], extraWords: [] };

  const uTokens = tokenize(u);
  const sTokens = tokenize(s);
  const sSet = new Set(sTokens);
  const uSet = new Set(uTokens);

  const userTokens = uTokens.map((w) => ({ word: w, matched: sSet.has(w) }));
  const matchedSet = new Set(userTokens.filter((t) => t.matched).map((t) => t.word));
  const sampleTokens = sTokens.map((w) => ({ word: w, matched: matchedSet.has(w) }));
  const missedWords = sampleTokens.filter((t) => !t.matched).map((t) => t.word);
  const extraWords = userTokens.filter((t) => !t.matched).map((t) => t.word);

  // Fairer scoring: use sample length as denominator, count correct matches in sample tokens.
  // Extra words in user answer get a small penalty (each extra word = 1 point off, capped at half a sample).
  const matchedSampleCount = sampleTokens.filter((t) => t.matched).length;
  const sLen = sTokens.length;
  const extraPenalty = Math.min(extraWords.length, Math.ceil(sLen / 2));
  const score = sLen > 0 ? Math.max(0, (matchedSampleCount - extraPenalty) / sLen) : 0;

  return { score, userTokens, sampleTokens, missedWords, extraWords };
}

function renderHighlightedTokens(tokens: { word: string; matched: boolean }[], className?: string) {
  return tokens.map((t, i) => (
    <span key={i} className={`${t.matched ? "text-green-700" : "text-red-500 line-through"} ${className || ""}`}>
      {i > 0 && " "}{t.word}
    </span>
  ));
}

export default function WritingPage() {
  return (
    <Suspense fallback={<div className={cx.panel}><div className={cx.empty} role="status">Đang tải...</div></div>}>
      <WritingInner />
    </Suspense>
  );
}

function WritingInner() {
  const search = useSearchParams();
  const router = useRouter();
  const category = search.get("category") || "";

  const [categories, setCategories] = useState<CategoryOpt[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [savedAnswers, setSavedAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [matchResult, setMatchResult] = useState<{
    score: number;
    userTokens: { word: string; matched: boolean }[];
    sampleTokens: { word: string; matched: boolean }[];
    missedWords: string[];
    extraWords: string[];
  } | null>(null);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [attempts, setAttempts] = useState<Record<number, number>>({});
  const [showAllDone, setShowAllDone] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [retryMode, setRetryMode] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const resultRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submittedRef = useRef(false);
  const userAnswerRef = useRef(userAnswer);
  const currentIndexRef = useRef(currentIndex);
  const scoresRef = useRef(scores);
  const attemptsRef = useRef(attempts);

  userAnswerRef.current = userAnswer;
  currentIndexRef.current = currentIndex;
  scoresRef.current = scores;
  attemptsRef.current = attempts;
  submittedRef.current = submitted;

  const exercises = useMemo<SentenceExercise[]>(() => {
    const result: SentenceExercise[] = [];
    for (const q of questions) {
      if (!q.answer) continue;
      const sentences = splitSentences(q.answer);
      for (let i = 0; i < sentences.length; i++) {
        result.push({
          questionId: q.id,
          sentenceIndex: i,
          targetSentence: sentences[i],
          vnMeaning: q.vnMeaning,
          phonetic: q.phonetic,
          fullQuestion: q.question,
          fullAnswer: q.answer,
        });
      }
    }
    return result;
  }, [questions]);

  const filteredExercises = useMemo(() => {
    if (!retryMode) return exercises;
    return exercises.filter((_, i) => {
      const s = scores[i];
      return s !== undefined && s < 0.7;
    });
  }, [exercises, scores, retryMode]);

  const displayExercises = retryMode ? filteredExercises : exercises;
  const current = displayExercises[currentIndex] || null;
  const completedCount = Object.keys(scores).length;
  const totalCount = exercises.length;
  const allDone = totalCount > 0 && completedCount === totalCount;
  const wrongCount = Object.entries(scores).filter(([, s]) => s < 0.7).length;
  const draftKey = category ? `${DRAFT_KEY_PREFIX}${category}` : "";

  // Timer
  useEffect(() => {
    if (!category || allDone) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [category, allDone]);

  // Load categories
  useEffect(() => {
    fetch("/api/writing-categories")
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json();
        setCategories(data.categories || []);
      })
      .catch(() => {})
      .finally(() => setCatLoading(false));
  }, []);

  // Load questions when category changes
  useEffect(() => {
    if (!category) { setLoading(false); return; }
    setLoading(true);
    setCurrentIndex(0);
    setUserAnswer("");
    setSubmitted(false);
    setMatchResult(null);
    setScores({});
    setAttempts({});
    setShowAllDone(false);
    setShowAnswer(false);
    setRetryMode(false);
    setElapsed(0);
    fetch(`/api/category-questions?category=${encodeURIComponent(category)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json();
        setQuestions(data.questions || []);
        try {
          const raw = localStorage.getItem(draftKey);
          if (raw) {
            const draft = JSON.parse(raw);
            if (draft && typeof draft.scores === "object" && draft.currentIndex >= 0) {
              setScores(draft.scores || {});
              setAttempts(draft.attempts || {});
              setCurrentIndex(draft.currentIndex);
              setElapsed(draft.elapsed || 0);
            }
          }
        } catch { /* ignore */ }
      })
      .catch(() => toast("Không thể tải câu hỏi."))
      .finally(() => setLoading(false));
  }, [category]);

  // Auto-save draft (debounced for non-submit changes)
  useEffect(() => {
    if (!draftKey || !category || loading || allDone) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          scores,
          attempts,
          currentIndex,
          elapsed,
          savedAt: Date.now(),
        }));
      } catch { /* storage full */ }
    }, 1500);
    return () => clearTimeout(timer);
  }, [draftKey, category, scores, attempts, currentIndex, elapsed, loading, allDone]);

  function saveDraftNow() {
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        scores: scoresRef.current,
        attempts: attemptsRef.current,
        currentIndex: currentIndexRef.current,
        elapsed,
        savedAt: Date.now(),
      }));
    } catch { /* storage full */ }
  }

  const handleSubmit = useCallback(() => {
    if (!current || !userAnswerRef.current.trim() || submittedRef.current) return;
    const result = sentenceMatchScore(userAnswerRef.current, current.targetSentence);
    setMatchResult(result);
    setSubmitted(true);
    submittedRef.current = true;
    // Use original exercises index for scores key, even in retry mode
    const origIdx = retryMode
      ? exercises.findIndex((e) => e.questionId === current.questionId && e.sentenceIndex === current.sentenceIndex)
      : currentIndexRef.current;
    const idx = origIdx >= 0 ? origIdx : currentIndexRef.current;
    setScores((prev) => ({ ...prev, [idx]: result.score }));
    setAttempts((prev) => ({ ...prev, [idx]: (prev[idx] || 0) + 1 }));
    // Update refs immediately then save so F5 never loses progress
    scoresRef.current = { ...scoresRef.current, [idx]: result.score };
    attemptsRef.current = { ...attemptsRef.current, [idx]: (attemptsRef.current[idx] || 0) + 1 };
    saveDraftNow();
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }, [current, retryMode, exercises]);
const nextSentence = useCallback(() => {
    if (currentIndex < displayExercises.length - 1) {
      setSavedAnswers((prev) => ({ ...prev, [currentIndex]: userAnswer }));
      setCurrentIndex((i) => i + 1);
      setSubmitted(false);
      submittedRef.current = false;
      setMatchResult(null);
      setShowAnswer(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [currentIndex, displayExercises.length, userAnswer]);

  const prevSentence = useCallback(() => {
    if (currentIndex > 0) {
      setSavedAnswers((prev) => ({ ...prev, [currentIndex]: userAnswer }));
      setCurrentIndex((i) => i - 1);
      setSubmitted(false);
      submittedRef.current = false;
      setMatchResult(null);
      setShowAnswer(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [currentIndex, userAnswer]);

  const resetCurrent = useCallback(() => {
    setSubmitted(false);
    submittedRef.current = false;
    setUserAnswer("");
    setMatchResult(null);
    setShowAnswer(false);
    setScores((prev) => {
      const next = { ...prev };
      const origIdx = retryMode && current
        ? exercises.findIndex((e) => e.questionId === current.questionId && e.sentenceIndex === current.sentenceIndex)
        : currentIndexRef.current;
      if (origIdx >= 0) delete next[origIdx];
      return next;
    });
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [retryMode, current, exercises, currentIndex]);

  // Restore saved answer when navigating — do NOT auto-submit
  useEffect(() => {
    const saved = savedAnswers[currentIndex];
    if (saved !== undefined) {
      setUserAnswer(saved);
      setSubmitted(false);
      submittedRef.current = false;
      setMatchResult(null);
    } else {
      setUserAnswer("");
      setSubmitted(false);
      submittedRef.current = false;
      setMatchResult(null);
    }
  }, [currentIndex, savedAnswers]);
  const jumpTo = useCallback((index: number) => {
    // Save current answer before navigating
    setSavedAnswers((prev) => ({ ...prev, [currentIndex]: userAnswer }));
    setCurrentIndex(index);
    setSubmitted(false);
    submittedRef.current = false;
    setMatchResult(null);
    setShowAnswer(false);
  }, [currentIndex, userAnswer]);

  function selectCategory(value: string) {
    router.push(`/writing?category=${encodeURIComponent(value)}`);
  }

  function overallScore(): number {
    if (completedCount === 0) return 0;
    return Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / completedCount * 100);
  }

  function totalAttempts(): number {
    return Object.values(attempts).reduce((a, b) => a + b, 0);
  }

  function restartAll() {
    setCurrentIndex(0);
    setUserAnswer("");
    setSubmitted(false);
    submittedRef.current = false;
    setMatchResult(null);
    setScores({});
    setAttempts({});
    setShowAllDone(false);
    setRetryMode(false);
    setElapsed(0);
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
  }

  async function saveResult() {
    if (savingResult || completedCount === 0) return;
    setSavingResult(true);
    try {
      await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setId: null,
          setName: category,
          mode: "writing",
          score: Math.round(overallScore() * totalCount / 100),
          total: totalCount,
          durationSeconds: elapsed,
          wordsPracticed: totalCount,
        }),
      });
    } catch { /* silent */ }
    finally { setSavingResult(false); }
  }

  function startRetry() {
    setRetryMode(true);
    setCurrentIndex(0);
    setUserAnswer("");
    setSubmitted(false);
    submittedRef.current = false;
    setMatchResult(null);
    setShowAllDone(false);
  }

  // Keyboard: Ctrl+Enter submit, Arrow keys navigate
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if (e.key === "Escape" && document.activeElement instanceof HTMLTextAreaElement) {
        (document.activeElement as HTMLTextAreaElement).blur();
        return;
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !submittedRef.current && userAnswerRef.current.trim()) {
        e.preventDefault();
        handleSubmit();
        return;
      }

      // Arrow navigation
      if (e.key === "ArrowRight" && !submittedRef.current && currentIndexRef.current < displayExercises.length - 1) {
        e.preventDefault();
        nextSentence();
        return;
      }
      if (e.key === "ArrowLeft" && !submittedRef.current && currentIndexRef.current > 0) {
        e.preventDefault();
        prevSentence();
        return;
      }
    }
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [handleSubmit, nextSentence, prevSentence, displayExercises.length]);

  function fmtTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  // --- RENDER ---

  if (!category) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className={cx.panel}>
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">✍️</div>
            <h2 className={cx.h2}>Luyện viết IELTS</h2>
            <p className={cx.desc}>Chọn một thư mục câu hỏi để bắt đầu luyện viết.</p>
          </div>
          {catLoading ? (
            <div className={cx.empty}>Đang tải danh mục...</div>
          ) : categories.length === 0 ? (
            <div className={cx.empty}>
              <p>Chưa có thư mục câu hỏi nào.</p>
              <p className="mt-2 text-xs text-muted">Vào <strong>Khu quản trị → Bộ từ vựng</strong>, chọn thư mục con, rồi thêm câu hỏi Speaking.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.name}
                  onClick={() => selectCategory(cat.name)}
                  className="flex min-h-[68px] items-center gap-3 rounded-xl border border-line bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-[#CFC7FF] hover:shadow-sm"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFECFF] text-lg" aria-hidden="true">📁</span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm text-ink">{cat.name}</b>
                    <span className="mt-0.5 block text-xs text-muted">{cat.count} câu hỏi</span>
                  </span>
                  <span className="text-lg text-muted" aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) return <div className={cx.panel}><div className={cx.empty}>Đang tải câu hỏi...</div></div>;

  if (exercises.length === 0) return (
    <div className="max-w-3xl mx-auto">
      <div className={cx.panel}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={cx.h2}>Luyện viết IELTS</h2>
          <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={() => router.push("/writing")}>← Chọn thư mục khác</button>
        </div>
        <p className={cx.desc}>Thư mục này chưa có câu hỏi hoặc câu trả lời mẫu chưa được nhập.</p>
      </div>
    </div>
  );

  if (retryMode && displayExercises.length === 0) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className={cx.panel}>
          <div className="text-center py-6">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-xl font-serif font-bold text-ink">Tất cả đã đúng!</h2>
            <p className="text-muted mt-1">Không còn câu nào dưới 70% để làm lại.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button className={`${cx.btn} ${cx.btnGold}`} onClick={restartAll}>Làm lại toàn bộ</button>
              <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/writing")}>← Chọn thư mục khác</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (allDone && showAllDone) {
    const avg = overallScore();
    const totalAtt = totalAttempts();
    return (
      <div className="max-w-3xl mx-auto">
        <div className={cx.panel}>
          <div className="text-center py-6">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-xl font-serif font-bold text-ink">Hoàn thành!</h2>
            <p className="text-muted mt-1">Bạn đã viết xong {totalCount} câu trong {fmtTime(elapsed)}.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-4">
              <div className="inline-flex items-center gap-3 rounded-2xl border-2 border-gold bg-goldpale/50 px-8 py-4">
                <span className="text-3xl font-bold text-golddark">{avg}%</span>
                <span className="text-sm text-muted">điểm trung bình</span>
              </div>
              <div className="inline-flex items-center gap-3 rounded-2xl border border-line bg-white px-6 py-4">
                <span className="text-2xl font-bold text-[#6550DB]">{totalAtt}</span>
                <span className="text-sm text-muted">lần kiểm tra</span>
              </div>
            </div>
            {wrongCount > 0 && <p className="mt-3 text-sm text-muted">{wrongCount} câu cần cải thiện (dưới 70%)</p>}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button className={`${cx.btn} ${cx.btnGold}`} onClick={restartAll}>Làm lại từ đầu</button>
              {wrongCount > 0 && <button className={`${cx.btn} ${cx.btnGold}`} onClick={startRetry}>Làm lại {wrongCount} câu sai</button>}
              <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/writing")}>← Chọn thư mục khác</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayTotal = displayExercises.length;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Top bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className={cx.h2}>{retryMode ? "Làm lại câu sai" : "Luyện viết"}</h2>
            {retryMode && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">Ôn tập</span>}
            <span className="hidden sm:inline-block rounded-full bg-[#F0EDFF] px-2.5 py-1 text-xs font-bold text-[#6550DB] max-w-[200px] truncate" title={category}>{category}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted font-mono">⏱ {fmtTime(elapsed)}</span>
            <button className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3 !py-1.5 text-xs`} onClick={() => router.push("/writing")}>Đổi thư mục</button>
            <span className="text-xs font-bold text-muted">{completedCount}/{totalCount}</span>
          </div>
        </div>

        <div className="h-2 w-full rounded-full bg-[#EFECFF] overflow-hidden">
          <div className="h-full rounded-full bg-[#7865EE] transition-all duration-300" style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }} />
        </div>

        {/* Score dots */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {exercises.map((ex, i) => {
            const score = scores[i];
            const active = !retryMode && i === currentIndex;
            const done = score !== undefined;
            let bg = "bg-[#F1EFF8] text-muted";
            if (done) {
              bg = score >= 0.7 ? "bg-green-100 text-green-700 border border-green-300" :
                   score >= 0.4 ? "bg-yellow-100 text-yellow-700 border border-yellow-300" :
                   "bg-red-100 text-red-700 border border-red-300";
            }
            let isRetryActive = false;
            if (retryMode && current) {
              isRetryActive = ex.questionId === current.questionId && ex.sentenceIndex === current.sentenceIndex;
            }
            return (
              <button
                key={i}
                onClick={() => jumpTo(i)}
                className={`h-7 min-w-7 rounded-md text-[0.65rem] font-bold transition ${(active || isRetryActive) ? "bg-[#7865EE] text-white ring-2 ring-[#7865EE]/40" : done ? "hover:opacity-80" : "cursor-default"} ${bg}`}
                title={`Câu ${i + 1}${done ? `: ${Math.round(score * 100)}%` : ""}`}
              >
                {done ? `${Math.round(score * 100)}` : i + 1}
              </button>
            );
          })}
        </div>
        {retryMode && <div className="mt-2 text-xs text-muted italic">Ôn tập {displayExercises.length} câu cần cải thiện.</div>}
      </div>

      <div className={cx.panel}>
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EFECFF] text-sm font-bold text-[#6550DB]">{currentIndex + 1}</span>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Viết câu tiếng Anh</span>
            <div className="text-xs text-muted">
              Câu {current!.sentenceIndex + 1}/{splitSentences(current!.fullAnswer).length} · Câu hỏi #{current!.questionId}
              {attempts[currentIndex] > 0 && <span className="ml-2">· {attempts[currentIndex]} lần</span>}
            </div>
          </div>
          {current!.sentenceIndex === 0 && current!.fullQuestion && (
            <span className="rounded-full bg-[#F0EDFF] px-2.5 py-1 text-[0.65rem] font-bold text-[#6550DB]">Chủ đề mới</span>
          )}
        </div>

        <div className="mb-4 rounded-xl border border-line bg-[#FBFAFE] p-4">
          <div className="text-xs font-bold text-muted mb-1">🇻🇳 Nghĩa tiếng Việt</div>
          <div className="text-lg font-semibold text-ink leading-relaxed">
            {current?.vnMeaning ? splitSentences(current.vnMeaning)[current.sentenceIndex] || current.vnMeaning : "Chưa có nghĩa tiếng Việt"}
          </div>
          {current?.phonetic && <div className="mt-1 font-mono text-sm text-golddark">{current.phonetic}</div>}
        </div>

        {!submitted && (
          <div className="mb-4 rounded-xl border border-dashed border-gold bg-goldpale/30 p-3">
            <div className="text-xs font-bold text-muted mb-1">✏️ Dựa vào nghĩa tiếng Việt bên trên, hãy viết câu tiếng Anh</div>
          </div>
        )}

        <div className="mb-4">
          <label className={cx.label}>Nhập câu tiếng Anh của bạn</label>
          <textarea
            ref={textareaRef}
            className={`${cx.input} !mb-0 min-h-[120px] ${submitted ? "opacity-60" : "focus:border-gold focus:ring-2 focus:ring-gold/20"}`}
            placeholder="Gõ câu tiếng Anh tương ứng với nghĩa tiếng Việt..."
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            disabled={submitted}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !submitted && userAnswer.trim()) { e.preventDefault(); handleSubmit(); } }}
          />
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>{userAnswer.trim() ? userAnswer.trim().split(/\s+/).length + " từ" : ""}</span>
            <span>Enter ↵ · Ctrl+Enter ↵ · ← → điều hướng</span>
          </div>
        </div>

        {!submitted ? (
          <button className={`${cx.btn} ${cx.btnGold} w-full`} disabled={!userAnswer.trim()} onClick={handleSubmit}>
            {userAnswer.trim() ? "Kiểm tra ↵" : "Hãy nhập câu trả lời trước"}
          </button>
        ) : (
          <div className="space-y-4" ref={resultRef}>
            {matchResult && (() => {
              const { score, userTokens, sampleTokens, missedWords } = matchResult;
              let color = "bg-red-50 border-red-300";
              let label = "Chưa khớp";
              let textColor = "text-red-800";
              let icon = "✗";
              if (score >= 0.7) { color = "bg-green-50 border-green-300"; label = "Tốt"; textColor = "text-green-800"; icon = "✓"; }
              else if (score >= 0.4) { color = "bg-yellow-50 border-yellow-300"; label = "Tạm ổn"; textColor = "text-yellow-800"; icon = "~"; }

              return (
                <div className={`rounded-xl border p-4 ${color}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2"><span className={`text-lg ${textColor}`}>{icon}</span><span className={`text-xs font-bold uppercase ${textColor}`}>{label}</span></div>
                    <span className={`text-lg font-bold ${textColor}`}>{Math.round(score * 100)}%</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-white/60 p-3">
                      <span className="text-xs font-bold text-muted block mb-1">Bạn viết:</span>
                      <div className="text-sm leading-relaxed">{userTokens.length > 0 ? renderHighlightedTokens(userTokens) : <span className="italic">(trống)</span>}</div>
                    </div>
                    <div className="rounded-lg bg-white/60 p-3">
                      <span className="text-xs font-bold text-muted block mb-1">Mẫu:</span>
                      <div className="text-sm leading-relaxed">{sampleTokens.length > 0 ? renderHighlightedTokens(sampleTokens) : <span className="italic">(trống)</span>}</div>
                    </div>
                  </div>
                  {missedWords.length > 0 && (
                    <div className="mt-3 rounded-lg bg-white/60 p-3">
                      <span className="text-xs font-bold text-muted block mb-1">Từ còn thiếu:</span>
                      <div className="flex flex-wrap gap-1">{missedWords.map((w, i) => <span key={i} className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">{w}</span>)}</div>
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <SpeakButton text={current?.targetSentence || ""} />
                    <span className="text-xs text-muted">Nghe câu mẫu</span>
                  </div>
                </div>
              );
            })()}

            <div className="flex gap-3">
              <button className={`${cx.btn} ${cx.btnGhost} flex-1`} onClick={resetCurrent}>⟲ Làm lại</button>
              {currentIndex < displayTotal - 1 ? (
                <button className={`${cx.btn} ${cx.btnGold} flex-1`} onClick={nextSentence}>Câu tiếp ({currentIndex + 2}/{displayTotal}) →</button>
              ) : (
                <button className={`${cx.btn} ${cx.btnGold} flex-1`} onClick={() => {
                  if (retryMode) {
                    const retryRemaining = displayExercises.some((_, i) => {
                      const origIdx = exercises.findIndex((e) => e.questionId === displayExercises[i].questionId && e.sentenceIndex === displayExercises[i].sentenceIndex);
                      return scores[origIdx] === undefined || scores[origIdx] < 0.7;
                    });
                    if (!retryRemaining) { setRetryMode(false); setShowAllDone(true); }
                    else {
                      const nextIdx = displayExercises.findIndex((_, i) => {
                        const origIdx = exercises.findIndex((e) => e.questionId === displayExercises[i].questionId && e.sentenceIndex === displayExercises[i].sentenceIndex);
                        return scores[origIdx] === undefined || scores[origIdx] < 0.7;
                      });
                      if (nextIdx >= 0) jumpTo(nextIdx);
                    }
                  } else { setShowAllDone(true); setTimeout(() => saveResult(), 100); }
                }}>{retryMode ? "Xem kết quả ôn tập →" : "Xem kết quả →"}</button>
              )}
            </div>

            <button className="text-xs font-bold text-[#6550DB] hover:underline" onClick={() => setShowAnswer(!showAnswer)}>
              {showAnswer ? "Ẩn câu trả lời mẫu" : "Hiện câu trả lời mẫu"}
            </button>

            {showAnswer && current && (
              <div className="rounded-xl border border-line bg-[#FBFAFE]">
                <div className="border-b border-line px-4 py-2 text-xs font-bold text-muted">📖 Câu trả lời mẫu đầy đủ ({splitSentences(current.fullAnswer).length} câu)</div>
                <div className="px-4 py-3">
                  <div className="space-y-2">
                    {splitSentences(current.fullAnswer).map((s, i) => (
                      <div key={i} className={`rounded-lg border p-2.5 text-sm ${i === current.sentenceIndex ? "border-[#7865EE] bg-[#F5F2FF]" : "border-line"}`}>
                        <span className="text-xs font-bold text-muted mr-2">Câu {i + 1}:</span>{s}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {current?.fullQuestion && (
              <details className="rounded-xl border border-line bg-white">
                <summary className="cursor-pointer px-4 py-3 text-xs font-bold text-muted hover:text-ink">📝 Xem câu hỏi gốc</summary>
                <div className="border-t border-line px-4 py-3 text-sm text-muted italic">{current.fullQuestion}</div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}