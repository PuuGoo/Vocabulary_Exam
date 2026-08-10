"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SpeakButton from "@/components/SpeakButton";
import StudyModeNav from "@/components/StudyModeNav";
import { toast } from "@/components/Toast";
import { cx } from "@/components/ui";
import MobileThumbBar from "@/components/MobileThumbBar";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import { isLearningDraftFresh, restoreItemsByIds } from "@/lib/learningDraft";
import { useCurrentUserId } from "@/components/UserSessionContext";

type Word = { id: number; meaning: string; term: string | null; example: string | null; ipa: string | null };
type SetDetail = { id: number; name: string; type: string; words: Word[] };
type Token = { id: number; text: string };
type RoundResult = { wordId: number; perfect: boolean };
type SentenceDraft = {
  savedAt: number;
  questionIds: number[];
  index: number;
  selectedIds: number[];
  availableIds: number[];
  feedback: "correct" | "incorrect" | null;
  hadMistake: boolean;
  hints: number;
  results: RoundResult[];
  elapsed: number;
};

function tokenize(sentence: string): Token[] {
  return sentence.trim().split(/\s+/).filter(Boolean).map((text, id) => ({ id, text }));
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  if (result.length > 1 && result.every((item, index) => item === items[index])) [result[0], result[1]] = [result[1], result[0]];
  return result;
}

export default function SentencePage() {
  const params = useParams<{ setId: string }>();
  const router = useRouter();
  const userId = useCurrentUserId();
  const [set, setSet] = useState<SetDetail | null>(null);
  const [questions, setQuestions] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [index, setIndex] = useState(0);
  const [available, setAvailable] = useState<Token[]>([]);
  const [selected, setSelected] = useState<Token[]>([]);
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [hadMistake, setHadMistake] = useState(false);
  const [hints, setHints] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const startedAtRef = useRef(Date.now());
  const saveAttemptedRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const restoredRoundRef = useRef(false);
  const draftKey = `lexora-learning-draft-u${userId}-sentence-${params.setId}`;

  useUnsavedChangesWarning(
    questions.length > 0 && index < questions.length && (index > 0 || selected.length > 0 || results.length > 0),
    "Bài xếp câu đang diễn ra. Tiến độ đã được lưu trên thiết bị để bạn có thể quay lại sau. Bạn vẫn muốn rời đi?"
  );

  useEffect(() => {
    let active = true;
    draftHydratedRef.current = false;
    setLoading(true);
    setLoadError(false);
    fetch(`/api/sets/${params.setId}`)
      .then(async (res) => { if (!res.ok) throw new Error("load failed"); return res.json(); })
      .then((data) => {
        if (!active) return;
        const detail: SetDetail = data.set;
        const eligible = detail.words.filter((word) => {
          const length = word.example ? tokenize(word.example).length : 0;
          return length >= 3 && length <= 24;
        });
        setSet(detail);
        let restored = false;
        try {
          const draft = JSON.parse(localStorage.getItem(draftKey) || "null") as SentenceDraft | null;
          const restoredQuestions = draft ? restoreItemsByIds(eligible, draft.questionIds) : null;
          const validDraft = draft
            && isLearningDraftFresh(draft.savedAt)
            && restoredQuestions
            && Number.isInteger(draft.index)
            && draft.index >= 0
            && draft.index < restoredQuestions.length;
          if (validDraft && restoredQuestions) {
            const tokens = tokenize(restoredQuestions[draft.index].example || "");
            const tokensById = new Map(tokens.map((token) => [token.id, token]));
            const restoredSelected = draft.selectedIds.map((id) => tokensById.get(id)).filter((token): token is Token => Boolean(token));
            const restoredAvailable = draft.availableIds.map((id) => tokensById.get(id)).filter((token): token is Token => Boolean(token));
            if (restoredSelected.length + restoredAvailable.length === tokens.length) {
              restoredRoundRef.current = true;
              setQuestions(restoredQuestions);
              setIndex(draft.index);
              setSelected(restoredSelected);
              setAvailable(restoredAvailable);
              setFeedback(draft.feedback === "correct" || draft.feedback === "incorrect" ? draft.feedback : null);
              setHadMistake(Boolean(draft.hadMistake));
              setHints(Math.max(0, Number(draft.hints) || 0));
              setResults(Array.isArray(draft.results) ? draft.results : []);
              startedAtRef.current = Date.now() - Math.max(0, Number(draft.elapsed) || 0) * 1000;
              toast(`Đã khôi phục bài xếp câu tại câu ${draft.index + 1}/${restoredQuestions.length}.`);
              restored = true;
            }
          } else if (draft) localStorage.removeItem(draftKey);
        } catch { try { localStorage.removeItem(draftKey); } catch { /* Storage is optional. */ } }
        if (!restored) setQuestions(shuffle(eligible).slice(0, 10));
        setLoading(false);
        if (!restored) startedAtRef.current = Date.now();
        draftHydratedRef.current = true;
      })
      .catch(() => { if (active) { setLoadError(true); setLoading(false); } });
    return () => { active = false; };
  }, [draftKey, params.setId, loadAttempt]);

  const question = questions[index];
  const answerTokens = useMemo(() => question?.example ? tokenize(question.example) : [], [question]);
  const finished = questions.length > 0 && index >= questions.length;

  const prepareRound = useCallback((word?: Word) => {
    const tokens = word?.example ? tokenize(word.example) : [];
    setAvailable(shuffle(tokens));
    setSelected([]);
    setFeedback(null);
    setHadMistake(false);
    setHints(0);
  }, []);

  useEffect(() => {
    if (restoredRoundRef.current) { restoredRoundRef.current = false; return; }
    if (question) prepareRound(question);
  }, [prepareRound, question]);

  useEffect(() => {
    if (!draftHydratedRef.current) return;
    if (finished) {
      try { localStorage.removeItem(draftKey); } catch { /* Storage is optional. */ }
      return;
    }
    if (!question || (index === 0 && selected.length === 0 && results.length === 0)) return;
    const draft: SentenceDraft = {
      savedAt: Date.now(),
      questionIds: questions.map((item) => item.id),
      index,
      selectedIds: selected.map((token) => token.id),
      availableIds: available.map((token) => token.id),
      feedback,
      hadMistake,
      hints,
      results,
      elapsed: Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)),
    };
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* Storage is optional. */ }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [available, draftKey, feedback, finished, hadMistake, hints, index, question, questions, results, selected]);

  function choose(token: Token) {
    if (feedback === "correct") return;
    setAvailable((current) => current.filter((item) => item.id !== token.id));
    setSelected((current) => [...current, token]);
    setFeedback(null);
  }

  function undo(token: Token) {
    if (feedback === "correct") return;
    setSelected((current) => current.filter((item) => item.id !== token.id));
    setAvailable((current) => [...current, token]);
    setFeedback(null);
  }

  const check = useCallback(() => {
    if (!question || selected.length !== answerTokens.length) return;
    const correct = selected.every((token, tokenIndex) => token.id === answerTokens[tokenIndex].id);
    if (correct) setFeedback("correct");
    else { setFeedback("incorrect"); setHadMistake(true); }
  }, [answerTokens, question, selected]);

  function useHint() {
    if (!question || feedback === "correct") return;
    const nextIndex = selected.length;
    const expected = answerTokens[nextIndex];
    if (!expected) return;
    const incorrectPosition = selected.findIndex((token, tokenIndex) => token.id !== answerTokens[tokenIndex]?.id);
    if (incorrectPosition >= 0) {
      const returned = selected.slice(incorrectPosition);
      setSelected((current) => current.slice(0, incorrectPosition));
      setAvailable((current) => [...current, ...returned]);
    } else {
      setAvailable((current) => current.filter((token) => token.id !== expected.id));
      setSelected((current) => [...current, expected]);
    }
    setHints((current) => current + 1);
    setFeedback(null);
  }

  function nextQuestion() {
    if (!question || feedback !== "correct") return;
    setResults((current) => [...current, { wordId: question.id, perfect: !hadMistake && hints === 0 }]);
    setIndex((current) => current + 1);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "Backspace" && selected.length > 0 && feedback !== "correct") { event.preventDefault(); undo(selected[selected.length - 1]); }
      else if (event.key.toLocaleLowerCase() === "h") { event.preventDefault(); useHint(); }
      else if (event.key === "Enter") { event.preventDefault(); feedback === "correct" ? nextQuestion() : check(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    if (!finished || !set || saving || saved || saveAttemptedRef.current) return;
    saveAttemptedRef.current = true;
    setSaving(true);
    const perfect = results.filter((result) => result.perfect).length;
    fetch("/api/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        setId: set.id,
        setName: set.name,
        mode: "sentence",
        score: perfect,
        total: results.length,
        durationSeconds: Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)),
        wrongWordIds: results.filter((result) => !result.perfect).map((result) => result.wordId),
        practicedWordIds: results.map((result) => result.wordId),
        wordsPracticed: results.length,
      }),
    }).then((res) => { if (!res.ok) throw new Error("save failed"); setSaved(true); })
      .catch(() => toast("Đã hoàn thành nhưng chưa thể lưu kết quả."))
      .finally(() => setSaving(false));
  }, [finished, results, saved, saving, set]);

  function beginQuestionRound(nextQuestions: Word[]) {
    if (nextQuestions.length === 0) return;
    setQuestions(nextQuestions);
    setIndex(0);
    setResults([]);
    setSaved(false);
    saveAttemptedRef.current = false;
    startedAtRef.current = Date.now();
  }

  if (loading) return <div className={cx.panel}><div className={cx.empty} role="status">Đang chuẩn bị câu ví dụ...</div></div>;
  if (loadError || !set) return <div className={cx.panel}><div className={cx.empty}>Không thể tải bài luyện.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setLoadAttempt((value) => value + 1)}>Thử lại</button></div></div></div>;

  return (
    <div className={cx.panel}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={cx.h2}>🧩 Xếp câu — {set.name}</h2>
        <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>← Chọn bộ khác</button>
      </div>
      <StudyModeNav setId={set.id} active="sentence" isVerb={set.type === "irregular_verb"} />

      {questions.length === 0 ? (
        <div className={cx.empty}>Bộ từ này chưa có câu ví dụ phù hợp để luyện xếp câu.</div>
      ) : finished ? (
        <section className="rounded-xl border border-gold bg-goldpale/40 p-6 text-center">
          <div className="text-4xl" aria-hidden="true">🎉</div>
          <h3 className="mt-2 font-serif text-xl font-bold">Hoàn thành bài xếp câu</h3>
          <p className="mt-2 text-sm text-muted">Hoàn thành ngay lần đầu {results.filter((result) => result.perfect).length}/{results.length} câu.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {results.some((result) => !result.perfect) && <button disabled={saving} className={`${cx.btn} ${cx.btnGold}`} onClick={() => { const weakIds = new Set(results.filter((result) => !result.perfect).map((result) => result.wordId)); beginQuestionRound(questions.filter((item) => weakIds.has(item.id))); }}>Làm lại {results.filter((result) => !result.perfect).length} câu cần cải thiện</button>}
            <button disabled={saving} className={`${cx.btn} ${results.some((result) => !result.perfect) ? cx.btnGhost : cx.btnGold}`} onClick={() => beginQuestionRound(shuffle(set.words.filter((word) => word.example && tokenize(word.example).length >= 3 && tokenize(word.example).length <= 24)).slice(0, 10))}>Luyện lượt mới</button>
            <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push(`/pronunciation/${set.id}`)}>Luyện phát âm</button>
          </div>
          <div className="mt-3 text-xs text-muted" role="status">{saving ? "Đang lưu kết quả..." : saved ? "✓ Đã lưu vào lịch sử học" : ""}</div>
        </section>
      ) : question ? (
        <>
          <div className="mb-2 flex justify-between text-xs text-muted"><span>Câu {index + 1}/{questions.length}</span><span>{results.filter((result) => result.perfect).length} câu hoàn hảo</span></div>
          <div className="mb-5 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${index / questions.length * 100}%` }} /></div>
          <section className="rounded-xl border border-line bg-white p-4 sm:p-5">
            <div className="text-center">
              <div className="text-xs uppercase tracking-widest text-muted">Từ cần luyện</div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 font-serif text-2xl font-bold">{question.term}<SpeakButton text={question.term || ""} /></div>
              <div className="mt-1 text-sm text-muted">{question.meaning}</div>
            </div>

            <div className={`mt-6 min-h-20 rounded-xl border-2 border-dashed p-3 ${feedback === "correct" ? "border-ok bg-okbg" : feedback === "incorrect" ? "border-bad bg-badbg" : "border-gold/50 bg-gold/5"}`} aria-label="Câu đang xếp">
              <div className="flex min-h-12 flex-wrap content-start gap-2">
                {selected.length === 0 && <span className="m-auto text-sm text-muted">Chọn các từ bên dưới để tạo câu</span>}
                {selected.map((token) => <button type="button" key={token.id} className="rounded-lg border border-gold bg-goldpale px-3 py-2 text-sm" onClick={() => undo(token)}>{token.text}</button>)}
              </div>
            </div>

            <div className="mt-4 flex min-h-16 flex-wrap content-start justify-center gap-2" aria-label="Các từ có thể chọn">
              {available.map((token) => <button type="button" key={token.id} className="rounded-lg border border-line bg-white px-3 py-2 text-sm hover:border-gold hover:bg-goldpale/40" onClick={() => choose(token)}>{token.text}</button>)}
            </div>

            {feedback === "correct" && <div className="mt-4 rounded-lg bg-okbg p-3 text-center text-sm font-medium text-ok">✓ Chính xác! {hints > 0 ? `Bạn đã dùng ${hints} gợi ý.` : "Bạn đã tự xếp đúng câu."}</div>}
            {feedback === "incorrect" && <div className="mt-4 rounded-lg bg-badbg p-3 text-center text-sm text-bad">Thứ tự chưa đúng. Bấm vào từ trong câu để đưa xuống và sửa lại.</div>}
          </section>
          <MobileThumbBar>
            {feedback === "correct" ? (
              <button className={`${cx.btn} ${cx.btnGold}`} onClick={nextQuestion}>Câu tiếp theo <kbd className="ml-1 rounded border border-current/30 px-1.5 py-0.5 text-[0.68rem]">Enter</kbd></button>
            ) : (
              <>
                <button className={`${cx.btn} ${cx.btnGhost}`} disabled={selected.length === 0} onClick={() => undo(selected[selected.length - 1])}>↶ Hoàn tác <kbd className="ml-1 rounded border border-line px-1 text-[0.65rem]">⌫</kbd></button>
                <button className={`${cx.btn} ${cx.btnGhost}`} onClick={useHint}>💡 Gợi ý <kbd className="ml-1 rounded border border-line px-1 text-[0.65rem]">H</kbd></button>
                <button className={`${cx.btn} ${cx.btnGold}`} disabled={selected.length !== answerTokens.length} onClick={check}>Kiểm tra <kbd className="ml-1 rounded border border-current/30 px-1 text-[0.65rem]">Enter</kbd></button>
              </>
            )}
          </MobileThumbBar>
        </>
      ) : null}
    </div>
  );
}
