"use client";

import { useEffect, useMemo, useState, useRef } from "react";
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

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,!?;:()""''""\[\]{}]/g, "").trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/\.\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function sentenceMatchScore(userSentence: string, sampleSentence: string): { score: number; matchedWords: string[]; missedWords: string[] } {
  const u = norm(userSentence);
  const s = norm(sampleSentence);
  if (!u || !s) return { score: 0, matchedWords: [], missedWords: [] };
  const uWords = [...new Set(u.split(/\s+/))];
  const sWords = [...new Set(s.split(/\s+/))];
  if (sWords.length === 0) return { score: 0, matchedWords: [], missedWords: [] };
  const matched = uWords.filter((w) => sWords.includes(w));
  const missed = sWords.filter((w) => !uWords.includes(w));
  const score = matched.length / Math.max(uWords.length, sWords.length);
  return { score, matchedWords: matched, missedWords: missed };
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
  const [submitted, setSubmitted] = useState(false);
  const [matchResult, setMatchResult] = useState<{ score: number; matchedWords: string[]; missedWords: string[] } | null>(null);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [showAllDone, setShowAllDone] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  const resultRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const current = exercises[currentIndex] || null;
  const completedCount = Object.keys(scores).length;
  const totalCount = exercises.length;
  const allDone = totalCount > 0 && completedCount === totalCount;

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
    setShowAllDone(false);
    setShowAnswer(false);
    fetch(`/api/category-questions?category=${encodeURIComponent(category)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json();
        setQuestions(data.questions || []);
      })
      .catch(() => toast("Không thể tải câu hỏi."))
      .finally(() => setLoading(false));
  }, [category]);

  function handleSubmit() {
    if (!current || !userAnswer.trim() || submitted) return;
    const result = sentenceMatchScore(userAnswer, current.targetSentence);
    setMatchResult(result);
    setSubmitted(true);
    setScores((prev) => ({ ...prev, [currentIndex]: result.score }));
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  function nextSentence() {
    if (currentIndex < exercises.length - 1) {
      setCurrentIndex((i) => i + 1);
      setUserAnswer("");
      setSubmitted(false);
      setMatchResult(null);
      setShowAnswer(false);
      textareaRef.current?.focus();
    }
  }

  function resetCurrent() {
    setSubmitted(false);
    setUserAnswer("");
    setMatchResult(null);
    setShowAnswer(false);
    setScores((prev) => { const next = { ...prev }; delete next[currentIndex]; return next; });
    textareaRef.current?.focus();
  }

  function jumpTo(index: number) {
    setCurrentIndex(index);
    setUserAnswer("");
    setSubmitted(false);
    setMatchResult(null);
    setShowAnswer(false);
  }

  function selectCategory(value: string) {
    router.push(`/writing?category=${encodeURIComponent(value)}`);
  }

  function overallScore(): number {
    if (completedCount === 0) return 0;
    return Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / completedCount * 100);
  }

  function restartAll() {
    jumpTo(0);
    setScores({});
    setShowAllDone(false);
  }

  // --- RENDER ---

  // Category selection screen
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

  // All done celebration
  if (allDone && showAllDone) {
    const avg = overallScore();
    const wrongCount = Object.entries(scores).filter(([, s]) => s < 0.7).length;
    return (
      <div className="max-w-3xl mx-auto">
        <div className={cx.panel}>
          <div className="text-center py-6">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-xl font-serif font-bold text-ink">Hoàn thành!</h2>
            <p className="text-muted mt-1">Bạn đã viết xong {totalCount} câu.</p>
            <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border-2 border-gold bg-goldpale/50 px-8 py-4">
              <span className="text-3xl font-bold text-golddark">{avg}%</span>
              <span className="text-sm text-muted">điểm trung bình</span>
            </div>
            {wrongCount > 0 && (
              <p className="mt-3 text-sm text-muted">{wrongCount} câu cần cải thiện (dưới 70%)</p>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button className={`${cx.btn} ${cx.btnGold}`} onClick={restartAll}>
                Làm lại từ đầu
              </button>
              <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/writing")}>
                ← Chọn thư mục khác
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Top bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className={cx.h2}>Luyện viết</h2>
            <span className="hidden sm:inline-block rounded-full bg-[#F0EDFF] px-2.5 py-1 text-xs font-bold text-[#6550DB] max-w-[200px] truncate" title={category}>{category}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button className={`${cx.btn} ${cx.btnGhost} !min-h-9 !px-3 !py-1.5 text-xs`} onClick={() => router.push("/writing")}>
              Đổi thư mục
            </button>
            <span className="text-xs font-bold text-muted">{completedCount}/{totalCount}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-[#EFECFF] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#7865EE] transition-all duration-300"
            style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
          />
        </div>

        {/* Score dots */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {exercises.map((ex, i) => {
            const score = scores[i];
            const active = i === currentIndex;
            const done = score !== undefined;
            let bg = "bg-[#F1EFF8] text-muted";
            if (done) {
              bg = score >= 0.7 ? "bg-green-100 text-green-700 border border-green-300" :
                   score >= 0.4 ? "bg-yellow-100 text-yellow-700 border border-yellow-300" :
                   "bg-red-100 text-red-700 border border-red-300";
            }
            return (
              <button
                key={i}
                onClick={() => { if (done || i === currentIndex) jumpTo(i); }}
                className={`h-7 min-w-7 rounded-md text-[0.65rem] font-bold transition ${active ? "ring-2 ring-[#7865EE]/40 bg-[#7865EE] text-white" : done ? "hover:opacity-80" : "cursor-default"} ${bg}`}
                title={`Câu ${i + 1}${done ? `: ${Math.round(score * 100)}%` : ""}`}
              >
                {done ? `${Math.round(score * 100)}` : i + 1}
              </button>
            );
          })}
        </div>
      </div>

      <div className={cx.panel}>
        {/* Header */}
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EFECFF] text-sm font-bold text-[#6550DB]">
            {currentIndex + 1}
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Viết câu tiếng Anh</span>
            <div className="text-xs text-muted">
              Câu {current!.sentenceIndex + 1}/{splitSentences(current!.fullAnswer).length} · Câu hỏi #{current!.questionId}
            </div>
          </div>
          {current!.sentenceIndex === 0 && current!.fullQuestion && (
            <span className="rounded-full bg-[#F0EDFF] px-2.5 py-1 text-[0.65rem] font-bold text-[#6550DB]">Chủ đề mới</span>
          )}
        </div>

        {/* Vietnamese meaning prompt */}
        <div className="mb-4 rounded-xl border border-line bg-[#FBFAFE] p-4">
          <div className="text-xs font-bold text-muted mb-1">🇻🇳 Nghĩa tiếng Việt</div>
          <div className="text-lg font-semibold text-ink leading-relaxed">
            {current?.vnMeaning ? splitSentences(current.vnMeaning)[current.sentenceIndex] || current.vnMeaning : "Chưa có nghĩa tiếng Việt"}
          </div>
          {current?.phonetic && (
            <div className="mt-1 font-mono text-sm text-golddark">{current.phonetic}</div>
          )}
        </div>

        {/* Instruction */}
        {!submitted && (
          <div className="mb-4 rounded-xl border border-dashed border-gold bg-goldpale/30 p-3">
            <div className="text-xs font-bold text-muted mb-1">✏️ Dựa vào nghĩa tiếng Việt bên trên, hãy viết câu tiếng Anh</div>
          </div>
        )}

        {/* Writing area */}
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
            <span>Enter ↵ để kiểm tra</span>
          </div>
        </div>

        {!submitted ? (
          <button
            className={`${cx.btn} ${cx.btnGold} w-full`}
            disabled={!userAnswer.trim()}
            onClick={handleSubmit}
          >
            {userAnswer.trim() ? "Kiểm tra ↵" : "Hãy nhập câu trả lời trước"}
          </button>
        ) : (
          <div className="space-y-4" ref={resultRef}>
            {/* Result card */}
            {matchResult && (() => {
              const { score, matchedWords, missedWords } = matchResult;
              let color = "bg-red-50 border-red-300";
              let label = "Chưa khớp";
              let textColor = "text-red-800";
              let icon = "✗";
              if (score >= 0.7) { color = "bg-green-50 border-green-300"; label = "Tốt"; textColor = "text-green-800"; icon = "✓"; }
              else if (score >= 0.4) { color = "bg-yellow-50 border-yellow-300"; label = "Tạm ổn"; textColor = "text-yellow-800"; icon = "~"; }

              return (
                <div className={`rounded-xl border p-4 ${color}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-lg ${textColor}`}>{icon}</span>
                      <span className={`text-xs font-bold uppercase ${textColor}`}>{label}</span>
                    </div>
                    <span className={`text-lg font-bold ${textColor}`}>{Math.round(score * 100)}%</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-white/60 p-3">
                      <span className="text-xs font-bold text-muted block mb-1">Bạn viết:</span>
                      <div className="text-sm">{userAnswer || <span className="italic">(trống)</span>}</div>
                    </div>
                    <div className="rounded-lg bg-white/60 p-3">
                      <span className="text-xs font-bold text-muted block mb-1">Mẫu:</span>
                      <div className="text-sm font-medium text-green-700">{current?.targetSentence}</div>
                    </div>
                  </div>
                  {missedWords.length > 0 && (
                    <div className="mt-3 rounded-lg bg-white/60 p-3">
                      <span className="text-xs font-bold text-muted block mb-1">Từ còn thiếu:</span>
                      <div className="flex flex-wrap gap-1">
                        {missedWords.map((w, i) => (
                          <span key={i} className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">{w}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Speak sample */}
                  <div className="mt-3 flex items-center gap-2">
                    <SpeakButton text={current?.targetSentence || ""} />
                    <span className="text-xs text-muted">Nghe câu mẫu</span>
                  </div>
                </div>
              );
            })()}

            {/* Action buttons */}
            <div className="flex gap-3">
              <button className={`${cx.btn} ${cx.btnGhost} flex-1`} onClick={resetCurrent}>
                ⟲ Làm lại
              </button>
              {currentIndex < exercises.length - 1 ? (
                <button className={`${cx.btn} ${cx.btnGold} flex-1`} onClick={nextSentence}>
                  Câu tiếp ({currentIndex + 2}/{totalCount}) →
                </button>
              ) : (
                <button className={`${cx.btn} ${cx.btnGold} flex-1`} onClick={() => setShowAllDone(true)}>
                  Xem kết quả →
                </button>
              )}
            </div>

            {/* Toggle answer */}
            <button
              className="text-xs font-bold text-[#6550DB] hover:underline"
              onClick={() => setShowAnswer(!showAnswer)}
            >
              {showAnswer ? "Ẩn câu trả lời mẫu" : "Hiện câu trả lời mẫu"}
            </button>

            {/* Full answer reference */}
            {showAnswer && current && (
              <div className="rounded-xl border border-line bg-[#FBFAFE]">
                <div className="border-b border-line px-4 py-2 text-xs font-bold text-muted">
                  📖 Câu trả lời mẫu đầy đủ ({splitSentences(current.fullAnswer).length} câu)
                </div>
                <div className="px-4 py-3">
                  <div className="space-y-2">
                    {splitSentences(current.fullAnswer).map((s, i) => (
                      <div key={i} className={`rounded-lg border p-2.5 text-sm ${i === current.sentenceIndex ? "border-[#7865EE] bg-[#F5F2FF]" : "border-line"}`}>
                        <span className="text-xs font-bold text-muted mr-2">Câu {i + 1}:</span>
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Full question context */}
            {current?.fullQuestion && (
              <details className="rounded-xl border border-line bg-white">
                <summary className="cursor-pointer px-4 py-3 text-xs font-bold text-muted hover:text-ink">
                  📝 Xem câu hỏi gốc
                </summary>
                <div className="border-t border-line px-4 py-3 text-sm text-muted italic">
                  {current.fullQuestion}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}