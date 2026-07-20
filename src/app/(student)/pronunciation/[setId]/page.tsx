"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import StudyModeNav from "@/components/StudyModeNav";
import { toast } from "@/components/Toast";
import { cx } from "@/components/ui";

type Word = {
  id: number;
  meaning: string;
  term: string | null;
  v1: string | null;
  v2: string | null;
  v3: string | null;
  ipa: string | null;
  wtype: string | null;
};
type SetDetail = { id: number; name: string; type: string; words: Word[] };
type SpeechResultEvent = Event & { results: { [index: number]: { [index: number]: { transcript: string; confidence: number } } } };
type SpeechErrorEvent = Event & { error?: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type RecognitionConstructor = new () => SpeechRecognitionLike;

function clean(value: string) {
  return value.toLocaleLowerCase("en").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();
}

function levenshtein(a: string, b: string) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
}

function similarity(target: string, transcript: string) {
  const expected = clean(target.split("/")[0]);
  const heard = clean(transcript);
  if (!expected || !heard) return 0;
  if (heard.split(" ").includes(expected) || heard === expected) return 100;
  return Math.max(0, Math.round((1 - levenshtein(expected, heard) / Math.max(expected.length, heard.length)) * 100));
}

export default function PronunciationPage() {
  const params = useParams<{ setId: string }>();
  const router = useRouter();
  const [set, setSet] = useState<SetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [index, setIndex] = useState(0);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [supported, setSupported] = useState(true);
  const [ratings, setRatings] = useState<Array<{ wordId: number; good: boolean }>>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const startedAtRef = useRef(Date.now());
  const saveAttemptedRef = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    fetch(`/api/sets/${params.setId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        return res.json();
      })
      .then((data) => { if (active) { setSet(data.set); setLoading(false); startedAtRef.current = Date.now(); } })
      .catch(() => { if (active) { setLoadError(true); setLoading(false); } });
    const browserWindow = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    setSupported(Boolean(browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition));
    return () => { active = false; recognitionRef.current?.stop(); window.speechSynthesis?.cancel(); };
  }, [params.setId, loadAttempt]);

  const word = set?.words[index];
  const target = word ? (set?.type === "irregular_verb" ? word.v1 || "" : word.term || "") : "";
  const finished = !!set && set.words.length > 0 && index >= set.words.length;

  const speak = useCallback((rate: number) => {
    if (!target || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(target.split("/")[0].trim());
    utterance.lang = "en-US";
    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
  }, [target]);

  const startListening = useCallback(() => {
    const browserWindow = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setSupported(false);
      toast("Trình duyệt này chưa hỗ trợ nhận diện giọng nói.");
      return;
    }
    recognitionRef.current?.stop();
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const heard = event.results[0]?.[0]?.transcript || "";
      setTranscript(heard);
      setScore(similarity(target, heard));
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") toast("Hãy cho phép trình duyệt sử dụng micro để luyện phát âm.");
      else if (event.error !== "no-speech") toast("Chưa nghe rõ giọng nói. Hãy thử lại ở nơi yên tĩnh hơn.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setTranscript("");
    setScore(null);
    setListening(true);
    try { recognition.start(); } catch { setListening(false); }
  }, [target]);

  const rateWord = useCallback((good: boolean) => {
    if (!word) return;
    setRatings((current) => [...current, { wordId: word.id, good }]);
    setIndex((current) => current + 1);
    setTranscript("");
    setScore(null);
    recognitionRef.current?.stop();
  }, [word]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const targetElement = event.target as HTMLElement | null;
      if (targetElement && ["INPUT", "TEXTAREA", "SELECT"].includes(targetElement.tagName)) return;
      if (event.key.toLocaleLowerCase() === "r" && !listening && word) { event.preventDefault(); startListening(); }
      else if (event.key === "1" && word) { event.preventDefault(); rateWord(false); }
      else if (event.key === "2" && word) { event.preventDefault(); rateWord(true); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [listening, rateWord, startListening, word]);

  useEffect(() => {
    if (!finished || saved || saving || !set || saveAttemptedRef.current) return;
    saveAttemptedRef.current = true;
    setSaving(true);
    const good = ratings.filter((item) => item.good).length;
    fetch("/api/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        setId: set.id,
        setName: set.name,
        mode: "pronunciation",
        score: good,
        total: ratings.length,
        durationSeconds: Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)),
        wrongWordIds: ratings.filter((item) => !item.good).map((item) => item.wordId),
        practicedWordIds: ratings.map((item) => item.wordId),
        wordsPracticed: ratings.length,
      }),
    }).then((res) => {
      if (!res.ok) throw new Error("save failed");
      setSaved(true);
    }).catch(() => toast("Đã hoàn thành nhưng chưa thể lưu kết quả.")).finally(() => setSaving(false));
  }, [finished, ratings, saved, saving, set]);

  if (loading) return <div className={cx.panel}><div className={cx.empty} role="status">Đang tải bài luyện phát âm...</div></div>;
  if (loadError || !set) return <div className={cx.panel}><div className={cx.empty}>Không thể tải bộ từ.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setLoadAttempt((value) => value + 1)}>Thử lại</button></div></div></div>;
  if (set.words.length === 0) return <div className={cx.panel}><StudyModeNav setId={set.id} active="pronunciation" isVerb={set.type === "irregular_verb"} /><div className={cx.empty}>Bộ từ này chưa có từ để luyện.</div></div>;

  const goodCount = ratings.filter((item) => item.good).length;
  return (
    <div className={cx.panel}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={cx.h2}>🎙️ Luyện phát âm — {set.name}</h2>
        <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>← Chọn bộ khác</button>
      </div>
      <StudyModeNav setId={set.id} active="pronunciation" isVerb={set.type === "irregular_verb"} />

      {finished ? (
        <section className="rounded-xl border border-gold bg-goldpale/40 p-6 text-center">
          <div className="text-4xl" aria-hidden="true">👏</div>
          <h3 className="mt-2 font-serif text-xl font-bold">Hoàn thành bài luyện</h3>
          <p className="mt-2 text-sm text-muted">Bạn tự đánh giá phát âm tốt {goodCount}/{ratings.length} từ.</p>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-gold" style={{ width: `${ratings.length ? goodCount / ratings.length * 100 : 0}%` }} /></div>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => { setIndex(0); setRatings([]); setSaved(false); saveAttemptedRef.current = false; startedAtRef.current = Date.now(); }}>Luyện lại</button>
            <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push(`/dictation/${set.id}`)}>Chuyển sang nghe & viết</button>
          </div>
          <div className="mt-3 text-xs text-muted" role="status">{saving ? "Đang lưu kết quả..." : saved ? "✓ Đã lưu vào lịch sử học" : ""}</div>
        </section>
      ) : word ? (
        <>
          <div className="mb-2 flex justify-between text-xs text-muted"><span>Từ {index + 1}/{set.words.length}</span><span>{goodCount} phát âm tốt</span></div>
          <div className="mb-5 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${index / set.words.length * 100}%` }} /></div>
          <section className="rounded-2xl border border-line bg-white px-5 py-8 text-center">
            <div className="text-xs uppercase tracking-widest text-muted">Đọc to từ sau</div>
            <div className="mt-3 font-serif text-3xl font-bold">{target}</div>
            {word.ipa && <div className="mt-1 text-lg text-golddark">{word.ipa}</div>}
            <div className="mt-2 text-sm text-muted">{word.wtype ? `(${word.wtype}) · ` : ""}{word.meaning}</div>
            {set.type === "irregular_verb" && <div className="mt-2 text-xs text-muted">Các dạng: {word.v1} — {word.v2} — {word.v3}</div>}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => speak(0.9)}>🔊 Nghe mẫu</button>
              <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => speak(0.65)}>🐢 Nghe chậm</button>
              <button className={`${cx.btn} ${cx.btnGold} min-w-36`} disabled={!supported || listening} onClick={startListening}>{listening ? "● Đang nghe..." : "🎙️ Thu giọng nói"} <kbd className="ml-1 rounded border border-current/30 px-1 text-[0.65rem]">R</kbd></button>
            </div>
            {!supported && <div className="mt-4 rounded-lg bg-goldpale px-3 py-2 text-xs text-golddark">Trình duyệt chưa hỗ trợ nhận diện giọng nói. Bạn vẫn có thể nghe mẫu rồi tự đánh giá bên dưới.</div>}
            {transcript && score !== null && (
              <div className={`mx-auto mt-5 max-w-md rounded-xl border p-4 ${score >= 85 ? "border-ok bg-okbg" : score >= 60 ? "border-gold bg-goldpale/50" : "border-bad/40 bg-badbg"}`}>
                <div className="text-xs text-muted">Máy nghe được</div>
                <div className="mt-1 font-semibold">“{transcript}”</div>
                <div className={`mt-2 text-sm font-bold ${score >= 85 ? "text-ok" : score >= 60 ? "text-golddark" : "text-bad"}`}>{score}% · {score >= 85 ? "Rất tốt" : score >= 60 ? "Gần đúng, thử thêm một lần" : "Cần luyện thêm"}</div>
              </div>
            )}
          </section>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button className={`${cx.btn} ${cx.btnGhost} border-bad/50 text-bad`} disabled={listening} onClick={() => rateWord(false)}>Cần luyện thêm <kbd className="ml-1 rounded border border-current/30 px-1.5 py-0.5 text-[0.68rem]">1</kbd></button>
            <button className={`${cx.btn} ${cx.btnGold}`} disabled={listening} onClick={() => rateWord(true)}>Phát âm ổn <kbd className="ml-1 rounded border border-current/30 px-1.5 py-0.5 text-[0.68rem]">2</kbd></button>
          </div>
        </>
      ) : null}
    </div>
  );
}
