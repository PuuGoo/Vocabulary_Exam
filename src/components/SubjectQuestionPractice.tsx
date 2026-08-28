"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/ui";

export type SubjectQuestion = {
  id: number;
  question: string;
  answer: string;
  questionType: "multiple_choice" | "essay";
  options: string[];
  correctOption: string | null;
  correctOptions: string[];
  explanation: string;
};

type Mode = "overview" | "multiple_choice" | "essay" | "final";

export default function SubjectQuestionPractice({ category, questions, speakingCount = 0, spellCheckEnabled, onSpellCheckChange }: { category: string; questions: SubjectQuestion[]; speakingCount?: number; spellCheckEnabled: boolean; onSpellCheckChange: (enabled: boolean) => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("overview");
  const multipleChoice = useMemo(() => questions.filter((question) => question.questionType === "multiple_choice"), [questions]);
  const essays = useMemo(() => questions.filter((question) => question.questionType === "essay"), [questions]);
  const finalQuestions = useMemo(() => multipleChoice.slice(-10), [multipleChoice]);

  if (mode === "multiple_choice") return <MultipleChoiceQuiz title="Luyện trắc nghiệm" questions={multipleChoice} onBack={() => setMode("overview")} />;
  if (mode === "final") return <MultipleChoiceQuiz title={`Bài tổng hợp · ${finalQuestions.length} câu trắc nghiệm cuối`} questions={finalQuestions} onBack={() => setMode("overview")} />;
  if (mode === "essay") return <EssayPractice questions={essays} onBack={() => setMode("overview")} spellCheckEnabled={spellCheckEnabled} onSpellCheckChange={onSpellCheckChange} />;

  return <div className="mx-auto max-w-4xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="mb-1 text-xs font-bold uppercase tracking-wider text-[#6550DB]">Môn học</p><h1 className="text-2xl font-extrabold text-ink">{category}</h1><p className="mt-1 text-sm text-muted">Chọn dạng bài bạn muốn luyện tập.</p></div>
      <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/writing")}>Đổi thư mục</button>
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {speakingCount > 0 && <ModeCard title="IELTS Speaking" count={speakingCount} detail="Tiếp tục chế độ luyện viết và trả lời Speaking hiện có." action="Luyện Speaking" disabled={false} onClick={() => router.push(`/writing?category=${encodeURIComponent(category)}&mode=ielts`)} />}
      <ModeCard title="Trắc nghiệm A–D" count={multipleChoice.length} detail="Làm toàn bộ câu hỏi và xem giải thích đáp án." action="Bắt đầu làm" disabled={!multipleChoice.length} onClick={() => setMode("multiple_choice")} />
      <ModeCard title="Tự luận" count={essays.length} detail="Viết câu trả lời rồi đối chiếu với đáp án mẫu." action="Bắt đầu viết" disabled={!essays.length} onClick={() => setMode("essay")} />
      <ModeCard title="Bài tổng hợp cuối" count={finalQuestions.length} detail="Bài kiểm tra lấy tối đa 10 câu trắc nghiệm cuối trong thư mục." action="Làm bài tổng hợp" disabled={!finalQuestions.length} featured onClick={() => setMode("final")} />
    </div>
  </div>;
}

function ModeCard({ title, count, detail, action, disabled, featured, onClick }: { title: string; count: number; detail: string; action: string; disabled: boolean; featured?: boolean; onClick: () => void }) {
  return <article className={`flex min-h-56 flex-col rounded-2xl border p-5 ${featured ? "border-[#BDB3FF] bg-[#F7F5FF]" : "border-line bg-white"}`}>
    <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${featured ? "bg-[#7865EE] text-white" : "bg-[#EFECFF] text-[#6550DB]"}`}>{count} câu</span>
    <h2 className="mt-4 text-lg font-extrabold text-ink">{title}</h2><p className="mt-2 flex-1 text-sm leading-6 text-muted">{detail}</p>
    <button disabled={disabled} onClick={onClick} className={`${cx.btn} ${featured ? cx.btnGold : cx.btnGhost} mt-4 w-full disabled:cursor-not-allowed disabled:opacity-40`}>{disabled ? "Chưa có câu hỏi" : action}</button>
  </article>;
}

function MultipleChoiceQuiz({ title, questions, onBack }: { title: string; questions: SubjectQuestion[]; onBack: () => void }) {
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const [submitted, setSubmitted] = useState(false);
  const score = questions.filter((question) => { const expected = question.correctOptions?.length ? question.correctOptions : question.correctOption ? [question.correctOption] : []; const selected = answers[question.id] || []; return expected.length === selected.length && expected.every((value) => selected.includes(value)); }).length;
  function restart() { setAnswers({}); setSubmitted(false); window.scrollTo({ top: 0, behavior: "smooth" }); }

  return <div className="mx-auto max-w-3xl space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-extrabold text-ink">{title}</h1><p className="mt-1 text-xs text-muted">Đã chọn {Object.keys(answers).length}/{questions.length} câu</p></div><button className={`${cx.btn} ${cx.btnGhost}`} onClick={onBack}>← Chọn dạng khác</button></div>
    {submitted && <div className={`rounded-2xl border p-5 text-center ${score === questions.length ? "border-green-300 bg-green-50" : "border-[#CFC7FF] bg-[#F5F2FF]"}`}><p className="text-sm font-bold text-muted">Kết quả</p><p className="mt-1 text-4xl font-extrabold text-[#6550DB]">{score}/{questions.length}</p><p className="mt-1 text-sm text-muted">{Math.round(score / Math.max(1, questions.length) * 100)}% câu trả lời đúng</p></div>}
    {questions.map((question, questionIndex) => <article key={question.id} className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-4 flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EFECFF] text-xs font-extrabold text-[#6550DB]">{questionIndex + 1}</span><h2 className="pt-1 text-sm font-bold leading-6 text-ink whitespace-pre-wrap">{question.question}</h2></div>
      <div className="grid gap-2">{question.options.map((option, optionIndex) => {
        const letter = String.fromCharCode(65 + optionIndex); const selectedAnswers = answers[question.id] || [];
        const selected = selectedAnswers.includes(letter);
        const correctAnswers = question.correctOptions?.length ? question.correctOptions : question.correctOption ? [question.correctOption] : [];
        const correct = submitted && correctAnswers.includes(letter);
        const wrong = submitted && selected && !correct;
        return <button key={letter} disabled={submitted} onClick={() => setAnswers((current) => ({ ...current, [question.id]: selected ? selectedAnswers.filter((value) => value !== letter) : [...selectedAnswers, letter] }))} className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition ${correct ? "border-green-400 bg-green-50 text-green-800" : wrong ? "border-red-400 bg-red-50 text-red-800" : selected ? "border-[#7865EE] bg-[#F5F2FF]" : "border-line hover:border-[#BDB3FF] hover:bg-[#FBFAFE]"}`}><b className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white">{letter}</b><span>{option}</span></button>;
      })}</div>
      {submitted && (question.explanation || question.answer) && <div className="mt-3 rounded-xl border border-dashed border-gold bg-goldpale/30 p-3 text-sm leading-6"><b className="block text-xs uppercase text-golddark">Giải thích đáp án</b>{question.explanation || question.answer}</div>}
    </article>)}
    <div className="sticky bottom-3 flex gap-2 rounded-2xl border border-line bg-white/95 p-3 shadow-lg backdrop-blur">{submitted ? <><button className={`${cx.btn} ${cx.btnGold} flex-1`} onClick={restart}>Làm lại</button><button className={`${cx.btn} ${cx.btnGhost} flex-1`} onClick={onBack}>Hoàn thành</button></> : <button className={`${cx.btn} ${cx.btnGold} w-full`} disabled={Object.keys(answers).length !== questions.length} onClick={() => { setSubmitted(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{Object.keys(answers).length === questions.length ? "Nộp bài và xem điểm" : `Còn ${questions.length - Object.keys(answers).length} câu chưa chọn`}</button>}</div>
  </div>;
}

function EssayPractice({ questions, onBack, spellCheckEnabled, onSpellCheckChange }: { questions: SubjectQuestion[]; onBack: () => void; spellCheckEnabled: boolean; onSpellCheckChange: (enabled: boolean) => void }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const current = questions[index];
  return <div className="mx-auto max-w-3xl space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-extrabold text-ink">Luyện tự luận</h1><p className="mt-1 text-xs text-muted">Câu {index + 1}/{questions.length}</p></div><div className="flex items-center gap-2"><button type="button" role="switch" aria-checked={spellCheckEnabled} onClick={() => onSpellCheckChange(!spellCheckEnabled)} className={`min-h-10 rounded-lg border px-3 text-xs font-bold ${spellCheckEnabled ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-line bg-white text-muted"}`}>Chính tả: {spellCheckEnabled ? "Bật" : "Tắt"}</button><button className={`${cx.btn} ${cx.btnGhost}`} onClick={onBack}>← Chọn dạng khác</button></div></div>
    <div className="h-2 overflow-hidden rounded-full bg-[#EFECFF]"><div className="h-full rounded-full bg-[#7865EE] transition-all" style={{ width: `${(index + 1) / questions.length * 100}%` }} /></div>
    <article className={cx.panel}><span className="text-xs font-bold uppercase tracking-wider text-[#6550DB]">Câu tự luận {index + 1}</span><h2 className="mt-3 text-lg font-bold leading-7 text-ink whitespace-pre-wrap">{current.question}</h2><label className="mt-5 block"><span className={cx.label}>Bài làm của bạn</span><textarea className={`${cx.input} !mb-0 min-h-48`} placeholder="Nhập câu trả lời..." value={answers[current.id] || ""} onChange={(event) => setAnswers((value) => ({ ...value, [current.id]: event.target.value }))} spellCheck={spellCheckEnabled} lang="vi" /></label>
      {!revealed[current.id] ? <button disabled={!answers[current.id]?.trim()} className={`${cx.btn} ${cx.btnGold} mt-4 w-full`} onClick={() => setRevealed((value) => ({ ...value, [current.id]: true }))}>Hoàn thành và xem đáp án mẫu</button> : <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4"><b className="text-xs uppercase tracking-wider text-green-800">Đáp án mẫu</b><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-green-950">{current.answer || "Chưa có đáp án mẫu."}</p></div>}
    </article>
    <div className="flex gap-2"><button disabled={index === 0} className={`${cx.btn} ${cx.btnGhost} flex-1`} onClick={() => setIndex((value) => value - 1)}>← Câu trước</button>{index < questions.length - 1 ? <button className={`${cx.btn} ${cx.btnGold} flex-1`} onClick={() => setIndex((value) => value + 1)}>Câu tiếp →</button> : <button className={`${cx.btn} ${cx.btnGold} flex-1`} onClick={onBack}>Hoàn thành</button>}</div>
  </div>;
}
