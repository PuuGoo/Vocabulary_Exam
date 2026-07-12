"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { cx } from "@/components/ui";
import SpeakButton from "@/components/SpeakButton";

type Word = {
  id: number;
  meaning: string;
  v1?: string | null;
  v2?: string | null;
  v3?: string | null;
  term?: string | null;
  example?: string | null;
  wtype?: string | null;
};
type SetDetail = { id: number; name: string; type: "irregular_verb" | "ielts_vocab"; words: Word[] };

const GROUP_SIZE = 10;

function norm(s: string | undefined | null) {
  return (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}
function checkMatch(userVal: string | undefined, answerKey: string | null | undefined) {
  const u = norm(userVal);
  if (!u) return false;
  return (answerKey || "").split("/").map(norm).includes(u);
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function fmtClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function QuizPlayerPage() {
  return (
    <Suspense fallback={null}>
      <QuizPlayerInner />
    </Suspense>
  );
}

function QuizPlayerInner() {
  const params = useParams<{ setId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const mode = (search.get("mode") as "fill" | "mc") || "fill";
  const timedMode = search.get("timed") === "1";
  const minutes = Number(search.get("minutes") || 15);

  const [set, setSet] = useState<SetDetail | null>(null);
  const [group, setGroup] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Record<string, string>>>({});
  const [mcOptions, setMcOptions] = useState<Record<number, string[]>>({});

  // normal (per-group) grading
  const [checked, setChecked] = useState(false);
  const [groupScore, setGroupScore] = useState<{ score: number; total: number } | null>(null);

  // timed mode grading (whole-set, single submit)
  const [secondsLeft, setSecondsLeft] = useState(minutes * 60);
  const [timedSubmitted, setTimedSubmitted] = useState(false);
  const [timedScore, setTimedScore] = useState<{ score: number; total: number } | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const submittedRef = useRef(false);

  useEffect(() => {
    fetch(`/api/sets/${params.setId}`)
      .then((r) => r.json())
      .then((d) => setSet(d.set));
  }, [params.setId]);

  const totalGroups = set ? Math.ceil(set.words.length / GROUP_SIZE) : 0;
  const start = group * GROUP_SIZE;
  const end = set ? Math.min(start + GROUP_SIZE, set.words.length) : 0;
  const isVerb = set?.type === "irregular_verb";
  const effectiveChecked = timedMode ? timedSubmitted : checked;

  const currentWords = useMemo(() => (set ? set.words.slice(start, end) : []), [set, start, end]);

  // build MC options for the words in the current group, once
  useEffect(() => {
    if (!set || isVerb || mode !== "mc") return;
    const allMeanings = set.words.map((w) => w.meaning);
    setMcOptions((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const w of currentWords) {
        if (!next[w.id]) {
          const distractors = shuffle(allMeanings.filter((m) => m !== w.meaning)).slice(0, 3);
          next[w.id] = shuffle([w.meaning, ...distractors]);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [set, currentWords, isVerb, mode]);

  // countdown timer for timed mode
  useEffect(() => {
    if (!timedMode || !set || timedSubmitted) return;
    if (secondsLeft <= 0) {
      submitTimed();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timedMode, set, secondsLeft, timedSubmitted]);

  function setAnswer(wordId: number, part: string, value: string) {
    setAnswers((prev) => ({ ...prev, [wordId]: { ...prev[wordId], [part]: value } }));
  }

  function resetGroup() {
    setAnswers((prev) => {
      const next = { ...prev };
      currentWords.forEach((w) => delete next[w.id]);
      return next;
    });
    setChecked(false);
    setGroupScore(null);
  }

  function goGroup(g: number) {
    setGroup(g);
    if (!timedMode) {
      setChecked(false);
      setGroupScore(null);
    }
  }

  function isWordCorrect(w: Word): boolean {
    if (isVerb) {
      const a = answers[w.id] || {};
      return checkMatch(a.v1, w.v1) && checkMatch(a.v2, w.v2) && checkMatch(a.v3, w.v3);
    } else if (mode === "fill") {
      return checkMatch(answers[w.id]?.term, w.term);
    } else {
      return answers[w.id]?.mc === w.meaning;
    }
  }

  async function postResult(score: number, total: number, durationSeconds?: number) {
    if (!set) return;
    const wrongWordIds = set.words
      .slice(timedMode ? 0 : start, timedMode ? set.words.length : end)
      .filter((w) => !isWordCorrect(w))
      .map((w) => w.id);
    await fetch("/api/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        setId: set.id,
        setName: set.name,
        mode,
        score,
        total,
        timed: timedMode,
        durationSeconds,
        wrongWordIds,
      }),
    });
  }

  async function grade() {
    if (!set) return;
    let correct = 0;
    let total = 0;
    for (const w of currentWords) {
      if (isVerb) {
        total += 3;
        const a = answers[w.id] || {};
        correct += (checkMatch(a.v1, w.v1) ? 1 : 0) + (checkMatch(a.v2, w.v2) ? 1 : 0) + (checkMatch(a.v3, w.v3) ? 1 : 0);
      } else if (mode === "fill") {
        total += 1;
        correct += checkMatch(answers[w.id]?.term, w.term) ? 1 : 0;
      } else {
        total += 1;
        correct += answers[w.id]?.mc === w.meaning ? 1 : 0;
      }
    }
    setChecked(true);
    setGroupScore({ score: correct, total });
    await postResult(correct, total);
  }

  async function submitTimed() {
    if (!set || submittedRef.current) return;
    submittedRef.current = true;
    let correct = 0;
    let total = 0;
    for (const w of set.words) {
      if (isVerb) {
        total += 3;
        const a = answers[w.id] || {};
        correct += (checkMatch(a.v1, w.v1) ? 1 : 0) + (checkMatch(a.v2, w.v2) ? 1 : 0) + (checkMatch(a.v3, w.v3) ? 1 : 0);
      } else if (mode === "fill") {
        total += 1;
        correct += checkMatch(answers[w.id]?.term, w.term) ? 1 : 0;
      } else {
        total += 1;
        correct += answers[w.id]?.mc === w.meaning ? 1 : 0;
      }
    }
    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);
    setTimedSubmitted(true);
    setTimedScore({ score: correct, total });
    await postResult(correct, total, durationSeconds);
  }

  if (!set) return <div className={cx.panel}><div className={cx.empty}>Đang tải bài kiểm tra...</div></div>;

  return (
    <div className={cx.panel}>
      <div className="flex justify-between items-center mb-2.5 flex-wrap gap-2">
        <h2 className={cx.h2}>
          {set.name} {timedMode && <span className={cx.badgeGold}>Thi thử có tính giờ</span>}
        </h2>
        <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>
          ← Chọn bộ khác
        </button>
      </div>

      {timedMode && (
        <div className="flex items-center justify-between gap-3 flex-wrap bg-goldpale rounded-lg px-4 py-3 mb-4">
          <div className="font-serif text-lg">
            ⏱ Thời gian còn lại: <span className={secondsLeft <= 60 ? "text-bad font-bold" : "font-bold"}>{fmtClock(secondsLeft)}</span>
          </div>
          {!timedSubmitted ? (
            <button className={`${cx.btn} ${cx.btnGold}`} onClick={submitTimed}>
              Nộp bài thi
            </button>
          ) : (
            <div className="font-serif text-lg">
              Kết quả: <b>{timedScore?.score}</b>/{timedScore?.total}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-center mb-4">
        {Array.from({ length: totalGroups }).map((_, g) => {
          const s2 = g * GROUP_SIZE + 1;
          const e2 = Math.min((g + 1) * GROUP_SIZE, set.words.length);
          return (
            <button
              key={g}
              onClick={() => goGroup(g)}
              className={`px-3 py-1.5 rounded-full text-[0.8rem] border ${
                g === group ? "bg-gold text-ink border-gold font-semibold" : "bg-white border-line"
              }`}
            >
              {s2}-{e2}
            </button>
          );
        })}
      </div>

      <div className="text-[0.82rem] text-muted text-center mb-3.5">
        Nhóm {group + 1} / {totalGroups} — mục {start + 1} đến {end}{" "}
        {mode === "mc" ? "· Trắc nghiệm" : isVerb ? "" : "· Điền từ"}
      </div>

      <div>
        {currentWords.map((w, idx) => (
          <div key={w.id} className="grid grid-cols-[30px_1fr] gap-2.5 items-start py-3.5 border-b border-dashed border-line last:border-none">
            <div className="text-muted text-[0.88rem] text-right pt-1">{start + idx + 1}.</div>
            <div>
              {isVerb ? (
                <>
                  <div className="font-bold mb-2">{w.meaning}</div>
                  <div className="flex gap-2 flex-wrap">
                    {(["v1", "v2", "v3"] as const).map((part) => {
                      const val = answers[w.id]?.[part] || "";
                      const ok = effectiveChecked ? checkMatch(val, w[part]) : null;
                      return (
                        <div key={part} className="flex flex-col flex-1 min-w-[100px]">
                          <span className="text-[0.66rem] text-muted mb-0.5 tracking-wide">{part.toUpperCase()}</span>
                          <input
                            type="text"
                            disabled={effectiveChecked}
                            value={val}
                            onChange={(e) => setAnswer(w.id, part, e.target.value)}
                            className={`${cx.input} !mb-0 ${
                              effectiveChecked ? (ok ? "!border-ok !bg-okbg" : "!border-bad !bg-badbg") : ""
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {effectiveChecked && (
                    <div className="mt-2 text-[0.84rem] flex items-center gap-2 flex-wrap">
                      {isWordCorrect(w) ? (
                        <span className="text-ok">✔ Chính xác cả 3.</span>
                      ) : (
                        <>
                          <span className="text-bad">✘ Đáp án đúng:</span>{" "}
                          <span className="text-muted">
                            {w.v1} — {w.v2} — {w.v3}
                          </span>
                          <SpeakButton text={w.v1 || ""} />
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : mode === "fill" ? (
                <>
                  <div className="font-bold mb-2">{w.meaning}</div>
                  <div className="flex flex-col max-w-xs">
                    <span className="text-[0.66rem] text-muted mb-0.5 tracking-wide">TỪ TIẾNG ANH</span>
                    <input
                      type="text"
                      disabled={effectiveChecked}
                      value={answers[w.id]?.term || ""}
                      onChange={(e) => setAnswer(w.id, "term", e.target.value)}
                      className={`${cx.input} !mb-0 ${
                        effectiveChecked ? (checkMatch(answers[w.id]?.term, w.term) ? "!border-ok !bg-okbg" : "!border-bad !bg-badbg") : ""
                      }`}
                    />
                  </div>
                  {effectiveChecked && (
                    <div className="mt-2 text-[0.84rem] flex items-center gap-2">
                      {checkMatch(answers[w.id]?.term, w.term) ? (
                        <span className="text-ok">✔ Chính xác.</span>
                      ) : (
                        <>
                          <span className="text-bad">✘ Đáp án đúng:</span> <span className="text-muted">{w.term}</span>
                          <SpeakButton text={w.term || ""} />
                        </>
                      )}
                      {w.example && <span className="text-muted italic">VD: {w.example}</span>}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="font-bold mb-2 flex items-center gap-2">
                    {w.term}
                    <SpeakButton text={w.term || ""} />
                  </div>
                  <div className="flex flex-col gap-1.5 mt-1">
                    {(mcOptions[w.id] || []).map((opt) => {
                      const chosen = answers[w.id]?.mc === opt;
                      let cls = "border-line bg-white";
                      if (chosen) cls = "border-gold bg-goldpale font-semibold";
                      if (effectiveChecked) {
                        if (opt === w.meaning) cls = "border-ok bg-okbg text-ok";
                        else if (chosen) cls = "border-bad bg-badbg text-bad";
                      }
                      return (
                        <div
                          key={opt}
                          onClick={() => !effectiveChecked && setAnswer(w.id, "mc", opt)}
                          className={`border rounded-lg px-2.5 py-2 cursor-pointer text-[0.88rem] ${cls}`}
                        >
                          {opt}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {!timedMode && checked && groupScore && (
        <div className="flex justify-center my-4">
          <div className="w-[110px] h-[110px] rounded-full border-[3px] border-dashed border-golddark flex flex-col items-center justify-center -rotate-[8deg] text-golddark font-serif text-center leading-tight">
            <div className="text-2xl font-bold">
              {groupScore.score}/{groupScore.total}
            </div>
            <div className="text-[0.62rem] tracking-widest uppercase mt-0.5">Đã chấm</div>
          </div>
        </div>
      )}

      {!timedMode && (
        <div className="flex gap-2.5 justify-center mt-3.5 flex-wrap">
          <button className={`${cx.btn} ${cx.btnGold}`} disabled={checked} onClick={grade}>
            Kiểm tra đáp án
          </button>
          <button className={`${cx.btn} ${cx.btnGhost}`} onClick={resetGroup}>
            Làm lại nhóm này
          </button>
        </div>
      )}
      <div className="flex justify-between mt-3.5">
        <button className={`${cx.btn} ${cx.btnGhost}`} disabled={group === 0} onClick={() => goGroup(group - 1)}>
          ◀ Nhóm trước
        </button>
        <button className={`${cx.btn} ${cx.btnGhost}`} disabled={group === totalGroups - 1} onClick={() => goGroup(group + 1)}>
          Nhóm sau ▶
        </button>
      </div>
    </div>
  );
}
