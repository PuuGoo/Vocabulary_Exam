"use client";

import { useMemo, useState } from "react";
import FillFocusSession from "@/components/FillFocusSession";
import LearningQuickDock from "@/components/LearningQuickDock";
import StudyModeNav from "@/components/StudyModeNav";
import LearnExperience from "@/components/learning/LearnExperience";
import SubjectQuestionPractice, { type SubjectQuestion } from "@/components/SubjectQuestionPractice";
import { gradeLanguageAnswer } from "@/lib/languageAnswer";
import { getLanguageConfig, getWordDisplayForms, type FillTarget } from "@/lib/languages";

type Word = { id: number; meaning: string; term: string | null; alternateTerm?:string|null; pronunciation?:string|null; example: string | null; examplePronunciation?:string|null; exampleMeaning?:string|null; wtype: string | null; ipa: string | null; level?:string|null; classifier?:string|null; v1: string | null; v2: string | null; v3: string | null };
type Question = { id: number; question: string; answer: string; vnMeaning: string | null; phonetic: string | null; questionType: string; options: string[]; correctOption: string | null; correctOptions: string[]; explanation: string };
type FolderCrumb = { name: string; relativePath: string };
export type ShareGuestPayload = { targetType: "vocab_set" | "question_collection" | "category_hub"; title: string; count: number; setType?: string; languageCode?:string; translationLanguageCode?:string; languageSettings?:unknown; allowedModes: string[]; words?: Word[]; questions?: Question[]; sets?: Array<{ id: number; name: string; category?: string | null }>; documents?: Array<{ id: number; title: string; fileName: string; category?: string }>; collections?: Array<{ key: string; count: number }>; collection?: string | null; folder?: string; root?: { name: string; path: string }; currentFolder?: { name: string; relativePath: string; breadcrumbs: FolderCrumb[] }; folders?: Array<{ name: string; relativePath: string; count: number }> };

const labels: Record<string, string> = { learn: "Học bài", fill: "Điền từ", mc: "Trắc nghiệm", match: "Ghép cặp", dictation: "Nghe & viết", pronunciation: "Luyện phát âm", sentence: "Xếp câu", timed: "Thi thử tính giờ", practice: "Luyện câu hỏi", multiple_choice: "Trắc nghiệm", speaking: "Speaking", shuffle: "Xáo trộn câu hỏi" };

export default function ShareGuestExperience({ token, initialMode, initialTarget = "term", payload }: { token: string; initialMode: string; initialTarget?: FillTarget; payload: ShareGuestPayload }) {
  const [mode, setMode] = useState(initialMode && payload.allowedModes.includes(initialMode) ? initialMode : payload.allowedModes.includes("learn") ? "learn" : payload.allowedModes[0] || "learn");
  const [fillTarget, setFillTarget] = useState<FillTarget>(initialTarget);
  const [index, setIndex] = useState(0);
  const words = payload.words || [];
  const questions = payload.questions || [];
  const modeItems = useMemo(() => payload.allowedModes.filter((item) => labels[item]), [payload.allowedModes]);
  function selectMode(next: string, target: FillTarget = "term") { setMode(next); setFillTarget(target); setIndex(0); window.history.replaceState(null, "", `/s/${encodeURIComponent(token)}?mode=${encodeURIComponent(next)}${next === "fill" && target === "pronunciation" ? "&target=pronunciation" : ""}`); }
  if (payload.targetType === "category_hub") return <CategoryShareHub token={token} payload={payload} />;
  if (payload.targetType === "vocab_set" && mode === "learn") {
    return <LearnExperience
      initialSet={{ name: payload.title, type: payload.setType === "irregular_verb" ? "irregular_verb" : payload.setType === "language_vocab" ? "language_vocab" : "ielts_vocab", languageCode:payload.languageCode, languageSettings:payload.languageSettings, words }}
      sourceKey={`share:${payload.targetType}:${payload.title}:${payload.count}`}
      allowedModes={modeItems}
      onSelectMode={selectMode}
      onExit={() => window.history.length > 1 ? window.history.back() : location.assign("/")}
      onLoginRequest={() => location.assign(`/login?next=/s/${encodeURIComponent(token)}?mode=learn`)}
    />;
  }
  if (payload.targetType === "question_collection" && (payload.collection === "quiz" || payload.collection === "essay")) {
    const practiceQuestions: SubjectQuestion[] = questions.map((question) => ({
      id: question.id,
      question: question.question,
      answer: question.answer,
      questionType: question.questionType === "true_false" ? "true_false" : question.questionType === "essay" ? "essay" : "multiple_choice",
      options: question.options,
      correctOption: question.correctOption,
      correctOptions: question.correctOptions,
      explanation: question.explanation,
    }));
    const folderQuery = payload.folder ? `?folder=${encodeURIComponent(payload.folder)}` : "";
    return <main className="min-h-screen bg-[#FAF9FD] px-4 py-6 text-ink"><SubjectQuestionPractice category={payload.title} questions={practiceQuestions} initialMode={payload.collection === "essay" ? "essay" : "multiple_choice"} spellCheckEnabled={true} onSpellCheckChange={() => undefined} onExit={() => location.assign(`/s/${encodeURIComponent(token)}${folderQuery}`)} /></main>;
  }
  const sharedSet = { id:0, name:payload.title, type:payload.setType, languageCode:payload.languageCode, languageSettings:payload.languageSettings, words };
  return <main className="min-h-screen bg-[#FAF9FD] text-ink"><header className="border-b border-line bg-white px-4 py-2"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3"><div className="min-w-0"><div className="text-sm font-extrabold tracking-wide">Lexora</div><h1 className="max-w-[70vw] truncate text-base font-extrabold">{payload.title}</h1></div><a className="min-h-10 shrink-0 rounded-lg border border-line px-3 py-2 text-xs font-bold" href={`/login?next=/s/${encodeURIComponent(token)}`}>Đăng nhập</a></div></header><div className="mx-auto max-w-5xl px-4 py-2"><StudyModeNav setId={0} active={mode as any} languageCode={payload.languageCode} fillTarget={fillTarget} availableModes={modeItems} onSelectMode={selectMode} /><LearningQuickDock availableModes={modeItems} currentMode={mode} onSelect={selectMode} guest />{payload.targetType === "vocab_set" ? mode === "fill" ? <FillFocusSession set={sharedSet} userId={0} sessionKind="practice" retest={false} quickMode={true} mistakeIdByWordId={{}} totalWordCount={words.length} rangeFrom={1} rangeTo={words.length} hasRange={false} onApplyRange={() => undefined} onChooseSet={() => selectMode("learn")} persist={false} chrome="compact" fillTarget={fillTarget} /> : <SharedWordMode mode={mode} words={words} set={sharedSet} index={index} setIndex={setIndex} /> : <SharedSpeakingMode questions={questions} index={index} setIndex={setIndex} />}<p className="mt-4 text-center text-xs text-muted">Bạn có thể học mà không cần tài khoản. <a className="font-bold text-golddark" href={`/login?next=/s/${encodeURIComponent(token)}`}>Đăng nhập để lưu tiến độ</a></p></div></main>;
}

function CategoryShareHub({ token, payload }: { token: string; payload: ShareGuestPayload }) {
  const collectionMeta: Record<string, { icon: string; label: string; mode: string }> = { quiz: { icon: "☑️", label: "Bộ trắc nghiệm", mode: "multiple_choice" }, essay: { icon: "✍️", label: "Bộ tự luận", mode: "practice" }, speaking: { icon: "🎙️", label: "Bộ Speaking", mode: "speaking" } };
  const current = payload.currentFolder;
  const folderParam = current?.relativePath ? `&folder=${encodeURIComponent(current.relativePath)}` : "";
  const folderHref = (relativePath: string) => `/s/${encodeURIComponent(token)}${relativePath ? `?folder=${encodeURIComponent(relativePath)}` : ""}`;
  return <main className="min-h-screen bg-[#FAF9FD] text-ink"><header className="border-b border-line bg-white px-4 py-3"><div className="mx-auto flex max-w-5xl items-center justify-between"><b>Lexora</b><a className="rounded-lg border border-line px-3 py-2 text-xs font-bold" href={`/login?next=/s/${encodeURIComponent(token)}`}>Đăng nhập</a></div></header><section className="mx-auto max-w-5xl px-4 py-8"><p className="text-xs font-bold uppercase tracking-wider text-[#7865EE]">Được chia sẻ qua Lexora</p>{current?.breadcrumbs?.length ? <nav className="mt-3 flex flex-wrap items-center gap-1.5 text-sm" aria-label="Đường dẫn thư mục">{current.breadcrumbs.map((crumb, index) => <span key={crumb.relativePath || "root"} className="flex items-center gap-1.5">{index > 0 && <span className="text-muted">›</span>}<a aria-current={index === current.breadcrumbs.length - 1 ? "page" : undefined} className={index === current.breadcrumbs.length - 1 ? "font-bold text-ink" : "font-semibold text-[#6550DB] hover:underline"} href={folderHref(crumb.relativePath)}>{crumb.name}</a></span>)}</nav> : null}<h1 className="mt-2 font-serif text-3xl font-extrabold">{current?.name || payload.title}</h1><p className="mt-2 text-sm text-muted">Chọn thư mục hoặc nội dung học. Không cần đăng nhập.</p>{current?.relativePath && <a className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-line bg-white px-3 text-sm font-bold" href={folderHref(current.breadcrumbs.at(-2)?.relativePath || "")}>← Quay lại</a>}<div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {(payload.folders || []).map((folder) => <a key={`folder-${folder.relativePath}`} className="rounded-2xl border border-line bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#BDB2FF]" href={folderHref(folder.relativePath)}><span className="text-xl" aria-hidden="true">📁</span><b className="mt-3 block text-base">{folder.name}</b><span className="mt-1 block text-xs text-muted">{folder.count} mục</span></a>)}
    {(payload.sets || []).map((set) => <a key={`set-${set.id}`} className="rounded-2xl border border-line bg-white p-5 shadow-sm transition hover:border-[#BDB2FF] hover:-translate-y-0.5" href={`/s/${encodeURIComponent(token)}?set=${set.id}&mode=learn`}><span className="text-xl" aria-hidden="true">📚</span><b className="mt-3 block text-base">{set.name}</b><span className="mt-1 block text-xs text-muted">Bộ từ vựng · Bắt đầu học</span></a>)}
    {(payload.collections || []).map((collection) => { const meta = collectionMeta[collection.key]; return meta ? <a key={collection.key} className="rounded-2xl border border-line bg-white p-5 shadow-sm transition hover:border-[#BDB2FF] hover:-translate-y-0.5" href={`/s/${encodeURIComponent(token)}?collection=${collection.key}&mode=${meta.mode}${folderParam}`}><span className="text-xl" aria-hidden="true">{meta.icon}</span><b className="mt-3 block text-base">{meta.label}</b><span className="mt-1 block text-xs text-muted">{collection.count} câu · Bắt đầu</span></a> : null; })}
    {(payload.documents || []).map((document) => <a key={`document-${document.id}`} className="rounded-2xl border border-line bg-white p-5 shadow-sm transition hover:border-[#BDB2FF] hover:-translate-y-0.5" href={`/api/share/${encodeURIComponent(token)}/documents/${document.id}`} target="_blank" rel="noopener noreferrer"><span className="text-xl" aria-hidden="true">📄</span><b className="mt-3 block truncate text-base">{document.title || document.fileName}</b><span className="mt-1 block text-xs text-muted">Tài liệu · Mở file</span></a>)}
  </div></section></main>;
}

function SharedWordMode({ mode, words, set, index, setIndex }: { mode: string; words: Word[]; set: {languageCode?:string;languageSettings?:unknown}; index: number; setIndex: (value: number) => void }) {
  const word = words[index]; const [answer, setAnswer] = useState(""); const [checked, setChecked] = useState(false);
  if (!word) return <Empty />;
  const next = () => { setAnswer(""); setChecked(false); setIndex(Math.min(words.length - 1, index + 1)); };
  if (mode === "match") return <section className="mx-auto mt-5 max-w-2xl rounded-2xl border border-line bg-white p-5"><h2 className="font-serif text-xl font-bold">Ghép cặp tự luyện</h2><p className="mt-2 text-sm text-muted">Lần lượt nhớ nghĩa của từng từ rồi bấm hiện đáp án.</p><div className="mt-5 grid gap-2 sm:grid-cols-2">{words.slice(0, 20).map((item) => <button type="button" key={item.id} onClick={(event) => { const target = event.currentTarget; target.textContent = `${item.term || ""} — ${item.meaning}`; }} className="min-h-12 rounded-lg border border-line px-3 text-left text-sm font-bold">{item.term}</button>)}</div></section>;
  const isFill = ["fill", "dictation", "pronunciation", "sentence", "timed"].includes(mode);
  const grade = gradeLanguageAnswer({set,word,userAnswer:answer}); const display=getWordDisplayForms(word,set);
  return <section className="mx-auto mt-5 max-w-2xl rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-8"><div className="flex items-center justify-between text-xs font-bold text-muted"><span>{labels[mode] || "Học bài"}</span><span>{index + 1}/{words.length}</span></div><div className="mt-8 text-center"><p className="text-xs font-bold uppercase tracking-wider text-muted">{isFill ? word.meaning : getLanguageConfig(set.languageCode).termLabel}</p><h2 className="mt-3 font-serif text-3xl font-extrabold">{isFill ? "" : display.primary}</h2>{!isFill && word.example && <p className="mt-4 text-sm italic text-muted">{word.example}</p>}{isFill && word.example && <p className="mt-4 text-sm italic text-muted">{word.example.replace(new RegExp(word.term || "^$", "gi"), "______")}</p>}</div>{isFill && <input autoFocus lang={set.languageCode||"en"} spellCheck={false} autoCapitalize="off" className="mt-8 min-h-12 w-full rounded-lg border border-line px-4 text-base outline-none focus:border-gold" autoComplete="off" value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && answer.trim()) { event.preventDefault(); setChecked(true); } }} placeholder={`Nhập ${getLanguageConfig(set.languageCode).termLabel.toLowerCase()}`} />}{checked && <div className={`mt-3 rounded-lg p-3 text-sm ${grade.correct ? "bg-okbg text-ok" : "bg-badbg text-bad"}`}>{grade.correct ? "Chính xác" : `Đáp án: ${grade.acceptedAnswers.join(" / ")}`}</div>}{!isFill && <div className="mt-8 rounded-xl bg-[#F8F7FF] p-4 text-center"><div className="font-serif text-2xl font-bold">{display.primary}</div>{display.secondary&&<div className="mt-1 text-sm text-muted">{display.secondary}</div>}<div className="mt-2 text-sm text-muted">{word.meaning}</div></div>}<button type="button" disabled={isFill && (!checked || !answer.trim())} onClick={next} className="mt-6 min-h-12 w-full rounded-lg bg-ink text-sm font-bold text-white">{index === words.length - 1 ? "Hoàn thành" : "Tiếp theo →"}</button></section>;
}

function SharedSpeakingMode({ questions, index, setIndex }: { questions: Question[]; index: number; setIndex: (value: number) => void }) {
  const question = questions[index]; const [answer, setAnswer] = useState(""); const [checked, setChecked] = useState(false); if (!question) return <Empty />;
  return <section className="mx-auto mt-5 max-w-2xl rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-8"><div className="flex items-center justify-between text-xs font-bold text-muted"><span>Speaking</span><span>{index + 1}/{questions.length}</span></div><h2 className="mt-8 whitespace-pre-wrap text-lg font-bold">{question.question}</h2>{question.vnMeaning && <p className="mt-3 text-sm text-muted">{question.vnMeaning}</p>}<textarea autoFocus className="mt-6 min-h-32 w-full rounded-lg border border-line px-4 py-3 text-base" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Ghi chú câu trả lời của bạn" />{checked && <div className="mt-4 rounded-lg bg-okbg p-3 text-sm text-ok"><b className="block">Đáp án tham khảo</b>{question.answer}</div>}<button type="button" disabled={!answer.trim()} onClick={() => checked ? (setAnswer(""), setChecked(false), setIndex(Math.min(questions.length - 1, index + 1))) : setChecked(true)} className="mt-6 min-h-12 w-full rounded-lg bg-ink text-sm font-bold text-white">{checked ? index === questions.length - 1 ? "Hoàn thành" : "Tiếp theo →" : "Hoàn thành câu"}</button></section>;
}

function Empty() { return <section className="mx-auto mt-5 max-w-2xl rounded-xl border border-line bg-white p-6 text-center text-sm text-muted">Nội dung này chưa có dữ liệu để luyện.</section>; }
