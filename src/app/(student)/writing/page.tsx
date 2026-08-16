"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { cx } from "@/components/ui";
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

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,!?;:()""''""\[\]{}]/g, "").trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/\.\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function sentenceMatchRate(userSentence: string, sampleSentence: string): number {
  const u = norm(userSentence);
  const s = norm(sampleSentence);
  if (!u || !s) return 0;
  const uWords = u.split(/\s+/);
  const sWords = s.split(/\s+/);
  if (sWords.length === 0) return 0;
  const matched = uWords.filter((w) => sWords.includes(w)).length;
  return matched / Math.max(uWords.length, sWords.length);
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
  const category = search.get("category") || "";

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  // Flatten: each sentence in each answer becomes one exercise
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

  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [matchScore, setMatchScore] = useState(0);

  const current = exercises[currentIndex] || null;

  // Overall progress
  const completedCount = submitted ? currentIndex + 1 : currentIndex;
  const totalCount = exercises.length;

  useEffect(() => {
    if (!category) { setLoading(false); return; }
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
    if (!current || !userAnswer.trim()) return;
    const score = sentenceMatchRate(userAnswer, current.targetSentence);
    setMatchScore(score);
    setSubmitted(true);
  }

  function nextSentence() {
    if (currentIndex < exercises.length - 1) {
      setCurrentIndex((i) => i + 1);
      setUserAnswer("");
      setSubmitted(false);
      setMatchScore(0);
    }
  }

  function resetCurrent() {
    setSubmitted(false);
    setUserAnswer("");
    setMatchScore(0);
  }

  if (loading) return <div className={cx.panel}><div className={cx.empty}>Đang tải câu hỏi...</div></div>;

  if (!category) return (
    <div className="max-w-3xl mx-auto">
      <div className={cx.panel}>
        <h2 className={cx.h2}>Luyện viết IELTS</h2>
        <p className={cx.desc}>Thêm <code>?category=Tên thư mục</code> vào URL để bắt đầu.</p>
        <div className="text-sm text-muted">Ví dụ: <code>/writing?category=Vocabulary</code></div>
      </div>
    </div>
  );

  if (exercises.length === 0) return (
    <div className="max-w-3xl mx-auto">
      <div className={cx.panel}>
        <h2 className={cx.h2}>Luyện viết IELTS</h2>
        <p className={cx.desc}>Thư mục này chưa có câu hỏi hoặc câu trả lời mẫu chưa được nhập.</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className={cx.h2}>Luyện viết IELTS</h2>
          <span className="text-xs font-bold text-muted">{completedCount}/{totalCount} câu</span>
        </div>
        <div className="h-2 w-full rounded-full bg-[#EFECFF] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#7865EE] transition-all duration-300"
            style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted">{category}</p>
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
              Câu {current!.sentenceIndex + 1}/{splitSentences(current!.fullAnswer).length} của câu hỏi #{current!.questionId}
            </div>
          </div>
          {current!.sentenceIndex === 0 && current!.fullQuestion && (
            <span className="rounded-full bg-[#F0EDFF] px-2.5 py-1 text-[0.65rem] font-bold text-[#6550DB]">Câu hỏi mới</span>
          )}
        </div>

        {/* Prompt: Vietnamese meaning */}
        <div className="mb-4 rounded-xl border border-line bg-[#FBFAFE] p-4">
          <div className="text-xs font-bold text-muted mb-1">Nghĩa tiếng Việt</div>
          <div className="text-lg font-semibold text-ink leading-relaxed">
            {current?.vnMeaning || "Chưa có nghĩa tiếng Việt"}
          </div>
          {current?.phonetic && (
            <div className="mt-1 font-mono text-sm text-golddark">{current.phonetic}</div>
          )}
        </div>

        {/* Reference: English sentence to write */}
        {!submitted && (
          <div className="mb-4 rounded-xl border border-dashed border-[#CFC7FF] bg-[#F8F6FF] p-3">
            <div className="text-xs font-bold text-muted mb-1">Hãy viết câu tiếng Anh sau</div>
            <div className="text-sm font-medium text-[#6550DB]">{current?.targetSentence}</div>
          </div>
        )}

        {/* Writing area */}
        <div className="mb-4">
          <label className={cx.label}>Nhập câu tiếng Anh của bạn</label>
          <textarea
            className={`${cx.input} !mb-0 min-h-[120px] ${submitted ? "opacity-60" : ""}`}
            placeholder="Gõ câu tiếng Anh tương ứng với nghĩa tiếng Việt..."
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            disabled={submitted}
          />
        </div>

        {!submitted ? (
          <button
            className={`${cx.btn} ${cx.btnGold} w-full`}
            disabled={!userAnswer.trim()}
            onClick={handleSubmit}
          >
            {userAnswer.trim() ? "Kiểm tra" : "Hãy nhập câu trả lời trước"}
          </button>
        ) : (
          <div className="space-y-4">
            {/* Result card */}
            {(() => {
              const score = matchScore;
              let color = "bg-red-50 border-red-300";
              let label = "Chưa khớp";
              let textColor = "text-red-800";
              if (score >= 0.7) { color = "bg-green-50 border-green-300"; label = "Tốt"; textColor = "text-green-800"; }
              else if (score >= 0.4) { color = "bg-yellow-50 border-yellow-300"; label = "Tạm ổn"; textColor = "text-yellow-800"; }

              return (
                <div className={`rounded-xl border p-4 ${color}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-bold uppercase ${textColor}`}>{label}</span>
                    <span className={`text-lg font-bold ${textColor}`}>{Math.round(score * 100)}%</span>
                  </div>
                  <div className="mb-2">
                    <span className="text-xs text-muted">Bạn viết:</span>
                    <div className="text-sm mt-0.5">{userAnswer || <span className="italic">(trống)</span>}</div>
                  </div>
                  <div>
                    <span className="text-xs text-muted">Mẫu:</span>
                    <div className="text-sm font-medium mt-0.5 text-green-700">{current?.targetSentence}</div>
                  </div>
                </div>
              );
            })()}

            {/* Action buttons */}
            <div className="flex gap-3">
              <button className={`${cx.btn} ${cx.btnGhost} flex-1`} onClick={resetCurrent}>
                Làm lại câu này
              </button>
              {currentIndex < exercises.length - 1 && (
                <button className={`${cx.btn} ${cx.btnGold} flex-1`} onClick={nextSentence}>
                  Câu tiếp theo ({currentIndex + 2}/{totalCount}) →
                </button>
              )}
            </div>

            {/* Full answer reference */}
            {current && (
              <details className="rounded-xl border border-line bg-white">
                <summary className="cursor-pointer px-4 py-3 text-xs font-bold text-muted hover:text-ink">
                  Xem câu trả lời mẫu đầy đủ ({splitSentences(current.fullAnswer).length} câu)
                </summary>
                <div className="border-t border-line px-4 py-3">
                  <div className="space-y-2">
                    {splitSentences(current.fullAnswer).map((s, i) => (
                      <div key={i} className={`rounded-lg border p-2.5 text-sm ${i === current.sentenceIndex ? "border-[#7865EE] bg-[#F5F2FF]" : "border-line"}`}>
                        <span className="text-xs font-bold text-muted mr-2">Câu {i + 1}:</span>
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            )}

            {/* Full question context */}
            {current?.fullQuestion && (
              <details className="rounded-xl border border-line bg-[#FBFAFE]">
                <summary className="cursor-pointer px-4 py-3 text-xs font-bold text-muted hover:text-ink">
                  Xem câu hỏi gốc
                </summary>
                <div className="border-t border-line px-4 py-3 text-sm text-muted italic">
                  {current.fullQuestion}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* All-sentences overview */}
      {submitted && (
        <div className={cx.panel}>
          <h3 className="text-sm font-bold text-ink mb-3">Tiến độ các câu</h3>
          <div className="flex flex-wrap gap-2">
            {exercises.map((ex, i) => {
              const done = i < currentIndex;
              const active = i === currentIndex;
              const remaining = i > currentIndex;
              return (
                <button
                  key={`${ex.questionId}-${ex.sentenceIndex}`}
                  disabled={!done && !active}
                  onClick={() => { if (done) { setCurrentIndex(i); setUserAnswer(""); setSubmitted(false); setMatchScore(0); } }}
                  className={`h-8 w-8 rounded-lg text-xs font-bold transition ${
                    active ? "bg-[#7865EE] text-white ring-2 ring-[#7865EE]/30" :
                    done ? "bg-green-100 text-green-700 border border-green-300" :
                    "bg-[#F1EFF8] text-muted cursor-default"
                  }`}
                  title={`Câu ${i + 1}${done ? " ✓" : active ? " (hiện tại)" : ""}`}
                >
                  {done ? "✓" : i + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}