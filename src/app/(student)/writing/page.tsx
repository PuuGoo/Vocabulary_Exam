"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sentenceResults, setSentenceResults] = useState<{ user: string; sample: string; match: number }[]>([]);

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

  const current = questions[currentIndex] || null;

  function handleSubmit() {
    if (!current || !userAnswer.trim()) return;
    const userSentences = splitSentences(userAnswer);
    const sampleSentences = splitSentences(current.answer);

    const results = sampleSentences.map((sample) => {
      let bestMatch = 0;
      let bestUser = "";
      for (const user of userSentences) {
        const rate = sentenceMatchRate(user, sample);
        if (rate > bestMatch) {
          bestMatch = rate;
          bestUser = user;
        }
      }
      return { user: bestUser, sample, match: bestMatch };
    });

    setSentenceResults(results);
    setSubmitted(true);
  }

  function nextQuestion() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setUserAnswer("");
      setSubmitted(false);
      setSentenceResults([]);
    }
  }

  if (loading) return <div className={cx.panel}><div className={cx.empty}>Đang tải câu hỏi...</div></div>;

  if (!category) return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Luyện viết IELTS</h2>
      <p className={cx.desc}>Chọn một thư mục từ trang <strong>Quản lý bộ từ</strong> để bắt đầu luyện viết.</p>
      <div className="text-sm text-muted">Vào <strong>Khu quản trị → Bộ từ vựng</strong>, chọn thư mục con, rồi thêm câu hỏi Speaking. Sau đó quay lại đây và thêm <code>?category=Tên thư mục</code> vào URL.</div>
    </div>
  );

  if (questions.length === 0) return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Luyện viết IELTS</h2>
      <p className={cx.desc}>Thư mục này chưa có câu hỏi nào.</p>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className={cx.h2}>Luyện viết IELTS</h2>
          <p className="text-xs text-muted">Câu {currentIndex + 1}/{questions.length} · {category}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-xs text-muted">{questions.length} câu hỏi</span>
        </div>
      </div>

      <div className={cx.panel}>
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#EFECFF] text-xs font-bold text-[#6550DB]">{currentIndex + 1}</span>
          <span className="text-xs font-bold text-muted uppercase tracking-wider">Đề bài</span>
        </div>

        {/* Vietnamese meaning as question */}
        <div className="mb-4 rounded-xl border border-line bg-[#FBFAFE] p-4">
          <div className="text-xs font-bold text-muted mb-1">Nghĩa tiếng Việt</div>
          <div className="text-lg font-semibold text-ink leading-relaxed">
            {current?.vnMeaning || "Chưa có nghĩa tiếng Việt"}
          </div>
          {current?.phonetic && (
            <div className="mt-1 font-mono text-sm text-golddark">{current.phonetic}</div>
          )}
        </div>

        {current?.question && (
          <div className="mb-4 rounded-xl border border-dashed border-line bg-white p-3">
            <div className="text-xs font-bold text-muted mb-1">Câu hỏi gốc (tham khảo)</div>
            <div className="text-sm text-muted italic">{current.question}</div>
          </div>
        )}

        {/* Writing area */}
        <div className="mb-4">
          <label className={cx.label}>Viết câu trả lời của bạn (tiếng Anh)</label>
          <textarea
            className={`${cx.input} !mb-0 min-h-[200px]`}
            placeholder="Viết câu trả lời bằng tiếng Anh. Mỗi câu cách nhau bằng dấu chấm..."
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            disabled={submitted}
          />
          <div className="mt-1 text-right text-xs text-muted">
            {userAnswer.trim() ? splitSentences(userAnswer).length + " câu" : ""}
          </div>
        </div>

        {!submitted ? (
          <button
            className={`${cx.btn} ${cx.btnGold} w-full`}
            disabled={!userAnswer.trim()}
            onClick={handleSubmit}
          >
            {userAnswer.trim() ? "Kiểm tra câu trả lời" : "Hãy viết câu trả lời trước"}
          </button>
        ) : (
          <div className="space-y-4">
            {/* Results */}
            <div className="rounded-xl border border-line bg-[#FBFAFE] p-4">
              <div className="mb-3 text-xs font-bold text-muted uppercase tracking-wider">Kết quả đối chiếu</div>
              {sentenceResults.length === 0 ? (
                <p className="text-sm text-muted">Không tìm thấy câu nào để đối chiếu.</p>
              ) : (
                <div className="space-y-3">
                  {sentenceResults.map((r, i) => {
                    const score = r.match;
                    let color = "bg-red-100 border-red-300 text-red-800";
                    let label = "Chưa khớp";
                    if (score >= 0.7) { color = "bg-green-100 border-green-300 text-green-800"; label = "Tốt"; }
                    else if (score >= 0.4) { color = "bg-yellow-100 border-yellow-300 text-yellow-800"; label = "Tạm ổn"; }

                    return (
                      <div key={i} className={`rounded-lg border p-3 ${color}`}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-bold uppercase">Câu {i + 1} · {label}</span>
                          <span className="text-xs font-bold">{Math.round(score * 100)}%</span>
                        </div>
                        <div className="mb-1">
                          <span className="text-xs text-muted">Bạn viết:</span>
                          <div className="text-sm">{r.user || <span className="italic">(không tìm thấy)</span>}</div>
                        </div>
                        <div>
                          <span className="text-xs text-muted">Mẫu:</span>
                          <div className="text-sm font-medium">{r.sample}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Full sample answer */}
            <div className="rounded-xl border border-dashed border-gold bg-goldpale/30 p-4">
              <div className="mb-1 text-xs font-bold uppercase tracking-wider text-golddark">Câu trả lời mẫu</div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{current?.answer}</div>
            </div>

            {/* Score summary */}
            <div className="rounded-xl border border-line bg-white p-4 text-center">
              <div className="text-2xl font-bold text-[#6550DB]">
                {sentenceResults.length > 0
                  ? Math.round(sentenceResults.reduce((sum, r) => sum + r.match, 0) / sentenceResults.length * 100)
                  : 0}%
              </div>
              <div className="text-xs text-muted mt-1">Điểm tổng hợp</div>
            </div>

            <div className="flex gap-3">
              <button className={`${cx.btn} ${cx.btnGhost} flex-1`} onClick={() => { setSubmitted(false); setUserAnswer(""); setSentenceResults([]); }}>
                Làm lại câu này
              </button>
              {currentIndex < questions.length - 1 && (
                <button className={`${cx.btn} ${cx.btnGold} flex-1`} onClick={nextQuestion}>
                  Câu tiếp theo →
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}