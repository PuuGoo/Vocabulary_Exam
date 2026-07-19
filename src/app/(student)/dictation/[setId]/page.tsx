"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { cx } from "@/components/ui";
import StudyModeNav from "@/components/StudyModeNav";
import { toast } from "@/components/Toast";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";

type Word = {
  id: number;
  meaning: string;
  term: string | null;
  v1: string | null;
  ipa: string | null;
  example: string | null;
};

type SetDetail = {
  id: number;
  name: string;
  type: "irregular_verb" | "ielts_vocab";
  words: Word[];
};

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

function matches(value: string, expected: string) {
  const answer = normalize(value);
  return Boolean(answer && expected.split("/").some((option) => normalize(option) === answer));
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function DictationPage() {
  const params = useParams<{ setId: string }>();
  const router = useRouter();
  const [set, setSet] = useState<SetDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [countChoice, setCountChoice] = useState("10");
  const [speed, setSpeed] = useState("0.85");
  const [sessionWords, setSessionWords] = useState<Word[]>([]);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongWordIds, setWrongWordIds] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [resultSaved, setResultSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const startedAtRef = useRef(Date.now());

  useUnsavedChangesWarning(
    started && !finished && (index > 0 || checked || answer.trim().length > 0),
    "Bài luyện nghe đang diễn ra. Rời trang sẽ làm mất kết quả hiện tại. Bạn vẫn muốn rời đi?"
  );

  useEffect(() => {
    setSpeechSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    let cancelled = false;
    async function load() {
      setLoadError(false);
      try {
        const response = await fetch(`/api/sets/${params.setId}`);
        if (!response.ok) throw new Error("load failed");
        const data = await response.json();
        if (!data.set) throw new Error("missing set");
        const loaded: SetDetail = data.set;
        loaded.words = loaded.words.filter((word) => Boolean((loaded.type === "irregular_verb" ? word.v1 : word.term)?.trim()));
        if (!cancelled) setSet(loaded);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [params.setId]);

  useEffect(() => {
    if (!started || finished) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [started, finished]);

  const word = sessionWords[index];
  const expected = word && set ? (set.type === "irregular_verb" ? word.v1 : word.term) || "" : "";
  const answerCorrect = checked && matches(answer, expected);

  function speak() {
    if (!word || !speechSupported) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(expected.split("/")[0].trim());
    utterance.lang = "en-US";
    utterance.rate = Number(speed);
    window.speechSynthesis.speak(utterance);
  }

  useEffect(() => {
    if (!started || finished || !word) return;
    const timer = window.setTimeout(() => {
      speak();
      inputRef.current?.focus();
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, finished, index, word?.id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!started || finished) return;
      if (checked && (event.key === "Enter" || event.key === "ArrowRight")) {
        event.preventDefault();
        next();
      } else if (event.ctrlKey && event.code === "Space") {
        event.preventDefault();
        speak();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, finished, word?.id, speed, checked, index]);

  useEffect(() => {
    if (checked) nextButtonRef.current?.focus();
  }, [checked]);

  function start() {
    if (!set || !speechSupported || set.words.length === 0) return;
    const requested = countChoice === "all" ? set.words.length : Number(countChoice);
    setSessionWords(shuffle(set.words).slice(0, requested));
    setStarted(true);
    setIndex(0);
    setAnswer("");
    setChecked(false);
    setCorrectCount(0);
    setWrongWordIds([]);
    setElapsed(0);
    setFinished(false);
    setResultSaved(false);
    startedAtRef.current = Date.now();
  }

  function checkAnswer() {
    if (!answer.trim() || checked) return;
    const correct = matches(answer, expected);
    setChecked(true);
    if (correct) setCorrectCount((value) => value + 1);
    else setWrongWordIds((current) => current.includes(word.id) ? current : [...current, word.id]);
  }

  async function saveResult(finalElapsed = elapsed) {
    if (!set || savingResult) return;
    setSavingResult(true);
    try {
      const response = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setId: set.id,
          setName: set.name,
          mode: "dictation",
          score: correctCount,
          total: sessionWords.length,
          durationSeconds: Math.max(1, finalElapsed),
          wrongWordIds,
          wordsPracticed: sessionWords.length,
        }),
      });
      if (!response.ok) throw new Error("save failed");
      setResultSaved(true);
    } catch {
      toast("Đã hoàn thành nhưng chưa lưu được kết quả.");
    } finally {
      setSavingResult(false);
    }
  }

  function next() {
    if (!checked) return;
    if (index === sessionWords.length - 1) {
      const finalElapsed = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      setElapsed(finalElapsed);
      setFinished(true);
      window.speechSynthesis?.cancel();
      void saveResult(finalElapsed);
      return;
    }
    setIndex((value) => value + 1);
    setAnswer("");
    setChecked(false);
  }

  if (!set && !loadError) return <div className={cx.panel}><div className={cx.empty} role="status">Đang chuẩn bị bài nghe...</div></div>;
  if (loadError || !set) return <div className={cx.panel}><div className={cx.empty}>Không thể tải bài luyện nghe.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>← Chọn bộ khác</button></div></div></div>;

  if (!started) {
    return (
      <div className={cx.panel}>
        <div className="mb-2.5 flex items-center justify-between gap-2 flex-wrap">
          <h2 className={cx.h2}>🎧 Nghe & viết — {set.name}</h2>
          <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>← Chọn bộ khác</button>
        </div>
        <StudyModeNav setId={set.id} active="dictation" isVerb={set.type === "irregular_verb"} />
        <div className={cx.desc}>Nghe cách phát âm rồi gõ lại chính xác từ tiếng Anh bạn vừa nghe.</div>
        {!speechSupported ? (
          <div className={cx.empty}>Trình duyệt này không hỗ trợ đọc văn bản. Hãy mở bằng Chrome, Edge hoặc Safari phiên bản mới.</div>
        ) : set.words.length === 0 ? (
          <div className={cx.empty}>Bộ từ chưa có nội dung phù hợp để luyện nghe.</div>
        ) : (
          <div className="mx-auto max-w-md rounded-xl border border-line bg-white p-5">
            <label className={cx.label} htmlFor="dictation-count">Số từ trong lượt luyện</label>
            <select id="dictation-count" className={cx.input} value={countChoice} onChange={(event) => setCountChoice(event.target.value)}>
              <option value="10">10 từ</option>
              <option value="20">20 từ</option>
              <option value="all">Toàn bộ ({set.words.length} từ)</option>
            </select>
            <label className={cx.label} htmlFor="dictation-speed">Tốc độ đọc</label>
            <select id="dictation-speed" className={cx.input} value={speed} onChange={(event) => setSpeed(event.target.value)}>
              <option value="0.65">Chậm</option>
              <option value="0.85">Vừa</option>
              <option value="1">Tự nhiên</option>
            </select>
            <button className={`${cx.btn} ${cx.btnGold} w-full`} onClick={start}>Bắt đầu luyện nghe</button>
          </div>
        )}
      </div>
    );
  }

  if (finished) {
    return (
      <div className={cx.panel}>
        <h2 className={`${cx.h2} text-center`}>🎉 Hoàn thành bài nghe!</h2>
        <div className="mx-auto my-6 max-w-md rounded-2xl border border-gold bg-goldpale p-6 text-center">
          <div className="font-serif text-4xl font-bold text-golddark">{correctCount}/{sessionWords.length}</div>
          <div className="mt-2 text-sm text-muted">{Math.round((correctCount / sessionWords.length) * 100)}% chính xác · {formatTime(elapsed)}</div>
          <div className="mt-2 text-xs text-muted" role="status">{resultSaved ? "✓ Kết quả đã được lưu vào lịch sử." : savingResult ? "Đang lưu kết quả..." : "Kết quả chưa được lưu."}</div>
        </div>
        <div className="flex justify-center gap-2 flex-wrap">
          {!resultSaved && !savingResult && <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => void saveResult()}>Lưu lại kết quả</button>}
          <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => setStarted(false)}>Luyện lượt mới</button>
          <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>Chọn bộ khác</button>
        </div>
      </div>
    );
  }

  return (
    <div className={cx.panel}>
      <div className="mb-2.5 flex items-center justify-between gap-2 flex-wrap">
        <h2 className={cx.h2}>🎧 Nghe & viết — {set.name}</h2>
        <div className="text-sm text-muted">{index + 1}/{sessionWords.length} · {formatTime(elapsed)}</div>
      </div>
      <StudyModeNav setId={set.id} active="dictation" isVerb={set.type === "irregular_verb"} />
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${((index + (checked ? 1 : 0)) / sessionWords.length) * 100}%` }} />
      </div>

      <div className="mx-auto max-w-xl rounded-2xl border border-line bg-white p-5 text-center sm:p-8">
        <button type="button" className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-gold bg-goldpale text-3xl hover:bg-gold/30" onClick={speak} aria-label="Nghe lại từ">🔊</button>
        <div className="mt-3 text-xs text-muted">Nghe lại: <kbd className="rounded border border-line px-1.5 py-0.5">Ctrl + Space</kbd></div>
        <div className="mt-5 text-sm"><span className="text-muted">Gợi ý nghĩa:</span> <b>{word.meaning}</b></div>
        <label className="sr-only" htmlFor="dictation-answer">Nhập từ tiếng Anh nghe được</label>
        <input
          ref={inputRef}
          id="dictation-answer"
          className={`${cx.input} mx-auto mt-4 max-w-sm text-center text-lg ${checked ? answerCorrect ? "!border-ok !bg-okbg" : "!border-bad !bg-badbg" : ""}`}
          autoComplete="off"
          spellCheck={false}
          disabled={checked}
          placeholder="Gõ từ bạn nghe được..."
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              if (checked) next();
              else checkAnswer();
            }
          }}
        />
        {checked && (
          <div className={`mb-4 text-sm ${answerCorrect ? "text-ok" : "text-bad"}`} role="status">
            {answerCorrect ? "✓ Chính xác!" : <>Chưa đúng. Đáp án: <b>{expected}</b>{word.ipa && <span className="ml-2 text-golddark">{word.ipa}</span>}</>}
            {word.example && <div className="mt-2 text-xs italic text-muted">VD: {word.example}</div>}
            <div className="mt-2 text-xs font-normal text-muted">Nhấn Enter hoặc → để sang từ tiếp theo.</div>
          </div>
        )}
        {!checked ? (
          <button className={`${cx.btn} ${cx.btnGold}`} disabled={!answer.trim()} onClick={checkAnswer}>Kiểm tra</button>
        ) : (
          <button ref={nextButtonRef} className={`${cx.btn} ${cx.btnGold}`} onClick={next}>
            {index === sessionWords.length - 1 ? "Xem kết quả" : "Từ tiếp theo →"}
            <kbd className="ml-2 rounded border border-current/30 px-1.5 py-0.5 text-[0.68rem]">Enter</kbd>
          </button>
        )}
      </div>
    </div>
  );
}
