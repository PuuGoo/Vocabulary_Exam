"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { toast } from "@/components/Toast";
import { cx } from "@/components/ui";
import { formatTimer, nextPomodoroPhase, PomodoroPhase, remainingSeconds } from "@/lib/pomodoro";

const STORAGE_KEY = "ivc_pomodoro_v1";
type Settings = { focus: number; short: number; long: number };
type SavedState = { phase: PomodoroPhase; remaining: number; running: boolean; endAt: number | null; task: string; completedFocus: number; todayCount: number; today: string; settings: Settings };
const defaults: SavedState = { phase: "focus", remaining: 25 * 60, running: false, endAt: null, task: "Học từ vựng", completedFocus: 0, todayCount: 0, today: "", settings: { focus: 25, short: 5, long: 20 } };

function todayKey() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function duration(phase: PomodoroPhase, settings: Settings) { return (phase === "focus" ? settings.focus : phase === "short_break" ? settings.short : settings.long) * 60; }
const phaseLabels: Record<PomodoroPhase, string> = { focus: "Tập trung", short_break: "Nghỉ ngắn", long_break: "Nghỉ dài" };

function ring() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    [0, 0.22].forEach((delay, index) => {
      const oscillator = context.createOscillator(); const gain = context.createGain();
      oscillator.frequency.value = index ? 880 : 660; gain.gain.setValueAtTime(0.12, context.currentTime + delay); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + delay + 0.35);
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(context.currentTime + delay); oscillator.stop(context.currentTime + delay + 0.36);
    });
    window.setTimeout(() => void context.close(), 900);
  } catch { /* Audio is optional. */ }
}

export default function PomodoroTimer() {
  const [state, setState] = useState<SavedState>(defaults);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const originalTitle = useRef("");

  useEffect(() => {
    originalTitle.current = document.title;
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as SavedState | null;
      if (parsed) {
        const normalized = { ...defaults, ...parsed, settings: { ...defaults.settings, ...parsed.settings } };
        if (normalized.today !== todayKey()) { normalized.today = todayKey(); normalized.todayCount = 0; }
        if (normalized.running && normalized.endAt) {
          normalized.remaining = remainingSeconds(normalized.endAt);
          if (normalized.remaining === 0) {
            const next = nextPomodoroPhase(normalized.phase, normalized.completedFocus);
            if (normalized.phase === "focus") normalized.todayCount += 1;
            normalized.phase = next.phase; normalized.completedFocus = next.completedFocus; normalized.running = false; normalized.endAt = null; normalized.remaining = duration(next.phase, normalized.settings);
          }
        }
        setState(normalized);
      } else setState({ ...defaults, today: todayKey() });
    } catch { setState({ ...defaults, today: todayKey() }); }
    setHydrated(true);
    return () => { document.title = originalTitle.current; };
  }, []);

  useEffect(() => { if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state, hydrated]);
  function finishPhase() {
    setState((current) => {
      const next = nextPomodoroPhase(current.phase, current.completedFocus);
      const focusFinished = current.phase === "focus";
      const message = focusFinished ? `Hoàn thành Pomodoro! Đến giờ ${next.phase === "long_break" ? "nghỉ dài" : "nghỉ ngắn"}.` : "Hết giờ nghỉ. Sẵn sàng tập trung trở lại!";
      window.setTimeout(() => { ring(); toast(message); if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("IELTS Vocab · Pomodoro", { body: message }); }, 0);
      return { ...current, phase: next.phase, completedFocus: next.completedFocus, todayCount: current.todayCount + (focusFinished ? 1 : 0), remaining: duration(next.phase, current.settings), running: false, endAt: null };
    });
  }

  useEffect(() => {
    if (!state.running || !state.endAt) { if (hydrated) document.title = originalTitle.current; return; }
    document.title = `${formatTimer(state.remaining)} · ${phaseLabels[state.phase]}`;
    const timer = window.setInterval(() => {
      setState((current) => {
        if (!current.running || !current.endAt) return current;
        const remaining = remainingSeconds(current.endAt);
        return remaining === current.remaining ? current : { ...current, remaining };
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, [state.running, state.endAt, state.remaining, state.phase, hydrated]);
  useEffect(() => { if (state.running && state.remaining === 0) finishPhase(); }, [state.running, state.remaining]);

  function toggle() {
    setState((current) => current.running && current.endAt
      ? { ...current, running: false, endAt: null, remaining: remainingSeconds(current.endAt) }
      : { ...current, running: true, endAt: Date.now() + current.remaining * 1000 });
  }
  function reset() { setState((current) => ({ ...current, running: false, endAt: null, remaining: duration(current.phase, current.settings) })); }
  function skip() { setState((current) => { const phase: PomodoroPhase = current.phase === "focus" ? "short_break" : "focus"; return { ...current, phase, running: false, endAt: null, remaining: duration(phase, current.settings) }; }); }
  function changeSetting(key: keyof Settings, value: number) { setState((current) => { const settings = { ...current.settings, [key]: value }; return { ...current, settings, ...(!current.running ? { remaining: duration(current.phase, settings) } : {}) }; }); }
  const total = duration(state.phase, state.settings);
  const percent = Math.min(100, Math.max(0, ((total - state.remaining) / total) * 100));
  const cycleProgress = state.phase === "long_break" ? 4 : state.completedFocus % 4;

  return <>
    <button type="button" onClick={() => setOpen(true)} className={`rounded-md border px-2.5 py-1.5 text-[0.8rem] font-semibold transition-colors ${state.running ? "border-gold bg-gold text-[#211807] hover:bg-[#d6ad49]" : "border-white/45 bg-white/10 text-white hover:border-gold hover:bg-white/15"}`} title={`Pomodoro · ${phaseLabels[state.phase]} ${formatTimer(state.remaining)}`} aria-label={`Mở đồng hồ Pomodoro, còn ${formatTimer(state.remaining)}`}><span aria-hidden="true">🍅</span><span className="hidden md:inline"> {state.running ? formatTimer(state.remaining) : "Pomodoro"}</span></button>
    {open && <Modal title="Đồng hồ Pomodoro" onClose={() => setOpen(false)}>
      <div className="text-center"><div className={`mx-auto mb-3 inline-flex rounded-full px-3 py-1 text-[0.75rem] font-semibold ${state.phase === "focus" ? "bg-badbg text-bad" : "bg-[#e5f4ea] text-ok"}`}>{phaseLabels[state.phase]}</div>
        <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-full p-3" style={{ background: `conic-gradient(#a87913 ${percent}%, #e3dccb ${percent}% 100%)` }}><div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white"><div className="font-serif text-5xl font-bold tabular-nums text-ink">{formatTimer(state.remaining)}</div><div className="mt-2 max-w-36 truncate text-[0.76rem] font-medium text-inksoft">{state.task || "Chưa chọn nhiệm vụ"}</div></div></div>
        <div className="mt-4 flex justify-center gap-2">{[0,1,2,3].map((dot) => <span key={dot} className={`h-2.5 w-2.5 rounded-full ${dot < cycleProgress ? "bg-[#9a6b08]" : "bg-[#c9c0ad]"}`} />)}</div><div className="mt-1 text-[0.72rem] font-medium text-inksoft">{cycleProgress}/4 trước kỳ nghỉ dài · {state.todayCount} Pomodoro hôm nay</div>
      </div>
      <label className="mt-5 block"><span className={`${cx.label} !text-ink`}>Nhiệm vụ đang làm</span><input className={cx.input} maxLength={120} value={state.task} onChange={(event) => setState((current) => ({ ...current, task: event.target.value }))} placeholder="VD: Học 20 từ Unit 5" /></label>
      <div className="grid grid-cols-3 gap-2"><label><span className={`${cx.label} !text-ink`}>Tập trung</span><select disabled={state.running} className={cx.input} value={state.settings.focus} onChange={(event) => changeSetting("focus", Number(event.target.value))}>{[25,50].map((value) => <option key={value} value={value}>{value} phút</option>)}</select></label><label><span className={`${cx.label} !text-ink`}>Nghỉ ngắn</span><select disabled={state.running} className={cx.input} value={state.settings.short} onChange={(event) => changeSetting("short", Number(event.target.value))}>{[3,5].map((value) => <option key={value} value={value}>{value} phút</option>)}</select></label><label><span className={`${cx.label} !text-ink`}>Nghỉ dài</span><select disabled={state.running} className={cx.input} value={state.settings.long} onChange={(event) => changeSetting("long", Number(event.target.value))}>{[15,20,30].map((value) => <option key={value} value={value}>{value} phút</option>)}</select></label></div>
      <div className="mt-2 flex flex-wrap justify-center gap-2"><button className={`${cx.btn} ${cx.btnGold} min-w-28`} onClick={toggle}>{state.running ? "Tạm dừng" : state.remaining < total ? "Tiếp tục" : "Bắt đầu"}</button><button className={`${cx.btn} ${cx.btnGhost}`} onClick={reset}>Đặt lại</button><button className={`${cx.btn} ${cx.btnGhost}`} onClick={skip}>Bỏ qua phiên</button></div>
      <div className="mt-4 rounded-lg border border-[#e3dccb] bg-[#faf8f2] p-3 text-[0.78rem] leading-relaxed text-inksoft"><b className="text-ink">Mẹo tập trung:</b> tắt thông báo điện thoại, chỉ giữ một nhiệm vụ và ghi lại ý nghĩ gây xao nhãng để xử lý sau khi chuông reo.{typeof Notification !== "undefined" && Notification.permission === "default" && <button className="ml-1 font-semibold text-[#765008] underline-offset-2 hover:underline" onClick={() => void Notification.requestPermission()}>Bật thông báo trình duyệt</button>}</div>
    </Modal>}
  </>;
}
