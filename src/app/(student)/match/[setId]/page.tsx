"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { cx } from "@/components/ui";
import StudyModeNav from "@/components/StudyModeNav";
import MobileThumbBar from "@/components/MobileThumbBar";
import { toast } from "@/components/Toast";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import { isLearningDraftFresh, restoreItemsByIds } from "@/lib/learningDraft";
import { useCurrentUserId } from "@/components/UserSessionContext";

type Word = {
  id: number;
  meaning: string;
  term: string | null;
  v1: string | null;
};

type SetDetail = {
  id: number;
  name: string;
  type: "irregular_verb" | "ielts_vocab";
  words: Word[];
};
type MatchDraft = {
  savedAt: number;
  roundWordIds: number[][];
  roundIndex: number;
  matchedIds: number[];
  selectedTerm: number | null;
  selectedMeaning: number | null;
  wrongCount: number;
  wrongWordIds: number[];
  elapsed: number;
};

const ROUND_SIZE = 6;

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function makeRounds(words: Word[]) {
  const shuffled = shuffle(words);
  const rounds: Word[][] = [];
  for (let index = 0; index < shuffled.length; index += ROUND_SIZE) rounds.push(shuffled.slice(index, index + ROUND_SIZE));
  return rounds;
}

function playableWords(set: SetDetail) {
  const answer = (word: Word) => (set.type === "irregular_verb" ? word.v1 : word.term)?.trim().toLocaleLowerCase("vi") || "";
  const meaning = (word: Word) => word.meaning.trim().toLocaleLowerCase("vi");
  const answerCounts = new Map<string, number>();
  const meaningCounts = new Map<string, number>();
  set.words.forEach((word) => {
    const answerKey = answer(word);
    const meaningKey = meaning(word);
    if (answerKey) answerCounts.set(answerKey, (answerCounts.get(answerKey) || 0) + 1);
    if (meaningKey) meaningCounts.set(meaningKey, (meaningCounts.get(meaningKey) || 0) + 1);
  });
  return set.words.filter((word) => {
    const answerKey = answer(word);
    const meaningKey = meaning(word);
    return Boolean(answerKey && meaningKey && answerCounts.get(answerKey) === 1 && meaningCounts.get(meaningKey) === 1);
  });
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function MatchGamePage() {
  const params = useParams<{ setId: string }>();
  const router = useRouter();
  const userId = useCurrentUserId();
  const [set, setSet] = useState<SetDetail | null>(null);
  const [rounds, setRounds] = useState<Word[][]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [matchedIds, setMatchedIds] = useState<number[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<number | null>(null);
  const [selectedMeaning, setSelectedMeaning] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [wrongCount, setWrongCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [resultSaved, setResultSaved] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const wrongAttemptsRef = useRef(0);
  const wrongWordIdsRef = useRef(new Set<number>());
  const startedAtRef = useRef(Date.now());
  const draftHydratedRef = useRef(false);
  const draftKey = `lexora-learning-draft-u${userId}-match-${params.setId}`;

  useUnsavedChangesWarning(
    Boolean(set && !finished && (matchedIds.length > 0 || wrongCount > 0)),
    "Trò chơi đang diễn ra. Tiến độ đã được lưu trên thiết bị để bạn có thể quay lại sau. Bạn vẫn muốn rời đi?"
  );

  useEffect(() => {
    let cancelled = false;
    draftHydratedRef.current = false;
    async function load() {
      setLoadError(false);
      try {
        const response = await fetch(`/api/sets/${params.setId}`);
        if (!response.ok) throw new Error("load failed");
        const data = await response.json();
        if (!data.set) throw new Error("missing set");
        if (!cancelled) {
          const loadedSet: SetDetail = data.set;
          const preparedSet = { ...loadedSet, words: playableWords(loadedSet) };
          setSet(preparedSet);
          let restored = false;
          try {
            const draft = JSON.parse(localStorage.getItem(draftKey) || "null") as MatchDraft | null;
            const flatIds = draft?.roundWordIds.flat() || [];
            const restoredWords = draft ? restoreItemsByIds(preparedSet.words, flatIds) : null;
            const validDraft = draft
              && isLearningDraftFresh(draft.savedAt)
              && restoredWords
              && draft.roundWordIds.every((round) => Array.isArray(round) && round.length > 0)
              && Number.isInteger(draft.roundIndex)
              && draft.roundIndex >= 0
              && draft.roundIndex < draft.roundWordIds.length;
            if (validDraft && draft && restoredWords) {
              const wordsById = new Map(restoredWords.map((word) => [word.id, word]));
              setRounds(draft.roundWordIds.map((round) => round.map((id) => wordsById.get(id) as Word)));
              setRoundIndex(draft.roundIndex);
              setMatchedIds(draft.matchedIds.filter((id) => wordsById.has(id)));
              setSelectedTerm(draft.selectedTerm != null && wordsById.has(draft.selectedTerm) ? draft.selectedTerm : null);
              setSelectedMeaning(draft.selectedMeaning != null && wordsById.has(draft.selectedMeaning) ? draft.selectedMeaning : null);
              const restoredWrongCount = Math.max(0, Number(draft.wrongCount) || 0);
              setWrongCount(restoredWrongCount);
              wrongAttemptsRef.current = restoredWrongCount;
              wrongWordIdsRef.current = new Set(draft.wrongWordIds.filter((id) => wordsById.has(id)));
              const restoredElapsed = Math.max(0, Number(draft.elapsed) || 0);
              setElapsed(restoredElapsed);
              startedAtRef.current = Date.now() - restoredElapsed * 1000;
              toast(`Đã khôi phục trò ghép cặp tại vòng ${draft.roundIndex + 1}/${draft.roundWordIds.length}.`);
              restored = true;
            } else if (draft) localStorage.removeItem(draftKey);
          } catch { try { localStorage.removeItem(draftKey); } catch { /* Storage is optional. */ } }
          if (!restored) {
            setRounds(makeRounds(preparedSet.words));
            setRoundIndex(0);
            setMatchedIds([]);
            setSelectedTerm(null);
            setSelectedMeaning(null);
            setWrongCount(0);
            wrongAttemptsRef.current = 0;
            wrongWordIdsRef.current = new Set();
            startedAtRef.current = Date.now();
          }
          setFeedback(null);
          setFinished(false);
          setResultSaved(false);
          draftHydratedRef.current = true;
        }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [draftKey, params.setId]);

  useEffect(() => {
    if (!draftHydratedRef.current || !set) return;
    if (finished) {
      try { localStorage.removeItem(draftKey); } catch { /* Storage is optional. */ }
      return;
    }
    const hasActivity = matchedIds.length > 0 || wrongCount > 0 || selectedTerm !== null || selectedMeaning !== null;
    if (!hasActivity) {
      try { localStorage.removeItem(draftKey); } catch { /* Storage is optional. */ }
      return;
    }
    if (feedback) return;
    const draft: MatchDraft = {
      savedAt: Date.now(),
      roundWordIds: rounds.map((round) => round.map((word) => word.id)),
      roundIndex,
      matchedIds,
      selectedTerm,
      selectedMeaning,
      wrongCount,
      wrongWordIds: [...wrongWordIdsRef.current],
      elapsed: Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)),
    };
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* Storage is optional. */ }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draftKey, feedback, finished, matchedIds, roundIndex, rounds, selectedMeaning, selectedTerm, set, wrongCount]);

  useEffect(() => {
    if (!set || finished) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [set, finished]);

  const currentWords = rounds[roundIndex] || [];
  const meaningOrder = useMemo(() => shuffle(currentWords), [currentWords]);
  const roundComplete = currentWords.length > 0 && currentWords.every((word) => matchedIds.includes(word.id));
  const score = set ? Math.max(0, set.words.length - wrongCount) : 0;

  async function saveResult() {
    if (!set || savingResult) return;
    setSavingResult(true);
    try {
      const response = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setId: set.id,
          setName: set.name,
          mode: "match",
          score: Math.max(0, set.words.length - wrongAttemptsRef.current),
          total: set.words.length,
          durationSeconds: Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
          wrongWordIds: [...wrongWordIdsRef.current],
          practicedWordIds: set.words.map((word) => word.id),
          wordsPracticed: set.words.length,
        }),
      });
      if (!response.ok) throw new Error("save failed");
      setResultSaved(true);
    } catch {
      toast("Đã hoàn thành trò chơi nhưng chưa lưu được kết quả.");
    } finally {
      setSavingResult(false);
    }
  }

  function evaluate(termId: number, meaningId: number) {
    if (feedback || matchedIds.includes(termId) || matchedIds.includes(meaningId)) return;
    setSelectedTerm(termId);
    setSelectedMeaning(meaningId);
    if (termId === meaningId) {
      setFeedback("correct");
      window.setTimeout(() => {
        const nextMatched = [...matchedIds, termId];
        setMatchedIds(nextMatched);
        setSelectedTerm(null);
        setSelectedMeaning(null);
        setFeedback(null);
        if (set && nextMatched.length === set.words.length) {
          setElapsed(Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)));
          setFinished(true);
          void saveResult();
        }
      }, 350);
    } else {
      wrongAttemptsRef.current += 1;
      wrongWordIdsRef.current.add(termId);
      setWrongCount(wrongAttemptsRef.current);
      setFeedback("wrong");
      window.setTimeout(() => {
        setSelectedTerm(null);
        setSelectedMeaning(null);
        setFeedback(null);
      }, 650);
    }
  }

  function chooseTerm(wordId: number) {
    if (feedback || matchedIds.includes(wordId)) return;
    if (selectedMeaning !== null) evaluate(wordId, selectedMeaning);
    else setSelectedTerm(wordId);
  }

  function chooseMeaning(wordId: number) {
    if (feedback || matchedIds.includes(wordId)) return;
    if (selectedTerm !== null) evaluate(selectedTerm, wordId);
    else setSelectedMeaning(wordId);
  }

  function nextRound() {
    setRoundIndex((value) => Math.min(value + 1, rounds.length - 1));
    setSelectedTerm(null);
    setSelectedMeaning(null);
  }

  function restart() {
    if (!set) return;
    setRounds(makeRounds(set.words));
    setRoundIndex(0);
    setMatchedIds([]);
    setSelectedTerm(null);
    setSelectedMeaning(null);
    setFeedback(null);
    setWrongCount(0);
    setElapsed(0);
    setFinished(false);
    setResultSaved(false);
    wrongAttemptsRef.current = 0;
    wrongWordIdsRef.current = new Set();
    startedAtRef.current = Date.now();
  }

  if (!set && !loadError) return <div className={cx.panel}><div className={cx.empty} role="status">Đang chuẩn bị trò chơi...</div></div>;
  if (loadError || !set) return <div className={cx.panel}><div className={cx.empty}>Không thể tải trò chơi.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>← Chọn bộ khác</button></div></div></div>;
  if (set.words.length < 2) return <div className={cx.panel}><div className={cx.empty}>Cần ít nhất 2 từ để chơi ghép cặp.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>← Chọn bộ khác</button></div></div></div>;

  if (finished) {
    return (
      <div className={cx.panel}>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2"><h2 className={cx.h2}>🧩 Ghép cặp — {set.name}</h2><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>← Chọn bộ khác</button></div>
        <StudyModeNav setId={set.id} active="match" isVerb={set.type === "irregular_verb"} />
        <h2 className={`${cx.h2} text-center`}>🎉 Hoàn thành ghép cặp!</h2>
        <div className="mx-auto my-6 max-w-md rounded-2xl border border-gold bg-goldpale p-6 text-center">
          <div className="font-serif text-4xl font-bold text-golddark">{score}/{set.words.length}</div>
          <div className="mt-2 text-sm text-muted">{wrongCount} lần ghép sai · Hoàn thành trong {formatTime(elapsed)}</div>
          <div className="mt-2 text-xs text-muted" role="status">{resultSaved ? "✓ Kết quả đã được lưu vào lịch sử." : savingResult ? "Đang lưu kết quả..." : "Kết quả chưa được lưu."}</div>
        </div>
        <div className="flex justify-center gap-2 flex-wrap">
          {!resultSaved && !savingResult && <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => void saveResult()}>Lưu lại kết quả</button>}
          <button className={`${cx.btn} ${cx.btnGold}`} onClick={restart}>Chơi lại</button>
          {resultSaved && wrongWordIdsRef.current.size > 0 && <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/review")}>Ôn lại {wrongWordIdsRef.current.size} từ sai</button>}
          <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>Chọn bộ khác</button>
        </div>
      </div>
    );
  }

  const cardClass = (wordId: number, selected: boolean) => {
    if (matchedIds.includes(wordId)) return "opacity-0 pointer-events-none";
    if (selected && feedback === "correct") return "border-ok bg-okbg text-ok";
    if (selected && feedback === "wrong") return "border-bad bg-badbg text-bad";
    if (selected) return "border-gold bg-goldpale text-golddark";
    return "border-line bg-white hover:border-gold";
  };

  return (
    <div className={cx.panel}>
      <div className="mb-2.5 flex items-center justify-between gap-2 flex-wrap">
        <h2 className={cx.h2}>🧩 Ghép cặp — {set.name}</h2>
        <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>← Chọn bộ khác</button>
      </div>
      <StudyModeNav setId={set.id} active="match" isVerb={set.type === "irregular_verb"} />
      <div className={cx.desc}>Chọn một từ tiếng Anh và nghĩa tiếng Việt tương ứng. Bạn có thể chọn bên nào trước cũng được.</div>

      <div className="mb-4 grid grid-cols-3 gap-2 rounded-lg border border-line bg-white p-3 text-center text-xs sm:max-w-md sm:mx-auto">
        <div><b className="block text-base">{roundIndex + 1}/{rounds.length}</b><span className="text-muted">Vòng</span></div>
        <div><b className="block text-base">{wrongCount}</b><span className="text-muted">Lần sai</span></div>
        <div><b className="block text-base">{formatTime(elapsed)}</b><span className="text-muted">Thời gian</span></div>
      </div>

      <div className="mb-3 flex justify-between text-xs text-muted"><span>Từ tiếng Anh</span><span>Nghĩa tiếng Việt</span></div>
      <div className="grid grid-cols-2 gap-3" aria-live="polite">
        <div className="flex flex-col gap-2">
          {currentWords.map((word) => (
            <button
              key={`term-${word.id}`}
              type="button"
              disabled={Boolean(feedback) || matchedIds.includes(word.id)}
              aria-pressed={selectedTerm === word.id}
              className={`min-h-14 rounded-lg border p-2 text-sm font-semibold transition-all ${cardClass(word.id, selectedTerm === word.id)}`}
              onClick={() => chooseTerm(word.id)}
            >
              {set.type === "irregular_verb" ? word.v1 : word.term}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {meaningOrder.map((word) => (
            <button
              key={`meaning-${word.id}`}
              type="button"
              disabled={Boolean(feedback) || matchedIds.includes(word.id)}
              aria-pressed={selectedMeaning === word.id}
              className={`min-h-14 rounded-lg border p-2 text-sm transition-all ${cardClass(word.id, selectedMeaning === word.id)}`}
              onClick={() => chooseMeaning(word.id)}
            >
              {word.meaning}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 min-h-8 text-center text-sm" role="status">
        {feedback === "correct" && <span className="font-medium text-ok">✓ Chính xác!</span>}
        {feedback === "wrong" && <span className="font-medium text-bad">Chưa đúng, thử lại nhé.</span>}
      </div>
      {!feedback && roundComplete && roundIndex < rounds.length - 1 && <MobileThumbBar><button className={`${cx.btn} ${cx.btnGold}`} onClick={nextRound}>Vòng tiếp theo →</button></MobileThumbBar>}
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" aria-label={`Đã ghép ${matchedIds.length} trên ${set.words.length} từ`}>
        <div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${(matchedIds.length / set.words.length) * 100}%` }} />
      </div>
    </div>
  );
}
