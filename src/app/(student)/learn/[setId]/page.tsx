"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { TouchEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import SpeakButton from "@/components/SpeakButton";
import VerbIpa from "@/components/VerbIpa";
import { toast } from "@/components/Toast";

type Word = {
  id: number; meaning: string; term?: string | null; example?: string | null;
  wtype?: string | null; ipa?: string | null; v1?: string | null; v2?: string | null; v3?: string | null;
  ipaV1?: string | null; ipaV2?: string | null; ipaV3?: string | null;
};
type SetDetail = { id: number; name: string; type: "irregular_verb" | "ielts_vocab"; words: Word[] };
type UndoState = {
  token: string; message: string; known: Record<number, boolean>; order: Word[]; index: number; flipped: boolean;
};

function shuffle<T>(arr: T[]) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function Shortcut({ children }: { children: string }) {
  return <kbd className="ml-2 inline-flex min-w-6 items-center justify-center rounded-md border border-[#DCD8F3] bg-[#F8F7FF] px-1.5 py-0.5 text-[0.68rem] font-semibold text-[#6550DB]">{children}</kbd>;
}
function ActionLabel({ icon, children }: { icon: string; children: ReactNode }) {
  return <span className="flex items-center gap-2"><span aria-hidden="true" className="w-5 text-center text-base">{icon}</span><span>{children}</span></span>;
}

export default function LearnPage() {
  const params = useParams<{ setId: string }>(); const router = useRouter();
  const [set, setSet] = useState<SetDetail | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const [order, setOrder] = useState<Word[]>([]); const [index, setIndex] = useState(0); const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Record<number, boolean>>({}); const [mode, setMode] = useState<"all"|"unknown"|"unrated">("all");
  const [menuOpen, setMenuOpen] = useState(false); const [jump, setJump] = useState(""); const [saving, setSaving] = useState(false);
  const [bookmarks, setBookmarks] = useState<Record<number, number>>({}); const [undo, setUndo] = useState<UndoState | null>(null);
  const [swipe, setSwipe] = useState(0); const swipeRef = useRef<{x:number;y:number;t:number}|null>(null); const suppressClick = useRef(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const savingRef = useRef(false);
  const sessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null); const menuRef = useRef<HTMLDivElement>(null); const jumpInputRef = useRef<HTMLInputElement>(null);

  async function loadSet() {
    setLoading(true); setError(false);
    try {
      const [a,b,c] = await Promise.all([fetch(`/api/sets/${params.setId}`), fetch("/api/bookmarks").catch(() => null), fetch("/api/study-sessions").catch(() => null)]);
      if (!a.ok) throw new Error(); const data = await a.json(); if (!data.set) throw new Error();
      let resumeIndex = 0;
      if (c?.ok) {
        const sessions = await c.json(); const saved = (sessions.sessions || []).find((x: {setId:number}) => x.setId === data.set.id);
        const found = saved ? data.set.words.findIndex((x: Word) => x.id === saved.wordId) : -1; if (found > 0) resumeIndex = found;
      }
      setSet(data.set); setOrder(data.set.words); setKnown(data.progress || {}); setIndex(resumeIndex); setFlipped(false);
      if (b?.ok) { const d = await b.json(); setBookmarks(Object.fromEntries((d.bookmarks || []).map((x: {wordId:number;id:number}) => [x.wordId,x.id]))); }
    } catch { setError(true); } finally { setLoading(false); }
  }
  useEffect(() => { void loadSet(); }, [params.setId]);
  useEffect(() => { const old = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = old; }; }, []);
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const word = order[index]; const total = order.length; const isVerb = set?.type === "irregular_verb";
  const unknown = set ? set.words.filter(w => known[w.id] === false).length : 0;
  const mastered = set ? set.words.filter(w => known[w.id] === true).length : 0;
  const unrated = set ? set.words.length - unknown - mastered : 0;
  useEffect(() => {
    if (!set || !word) return;
    if (sessionTimer.current) clearTimeout(sessionTimer.current);
    const position = set.words.findIndex(x => x.id === word.id) + 1; if (position < 1) return;
    sessionTimer.current = setTimeout(() => { void fetch("/api/study-sessions", { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({setId:set.id,wordId:word.id,position}) }).catch(() => undefined); }, 500);
    return () => { if (sessionTimer.current) clearTimeout(sessionTimer.current); };
  }, [set, word]);
  const go = (n:number) => { if (!total) return; setIndex(Math.min(Math.max(n,0), total-1)); setFlipped(false); };
  const next = () => go(index + 1); const prev = () => go(index - 1);
  const filtered = (m: "all"|"unknown"|"unrated") => set?.words.filter(w => m === "all" || (m === "unknown" ? known[w.id] === false : known[w.id] === undefined)) || [];
  const chooseMode = (m: "all"|"unknown"|"unrated") => { setMode(m); setOrder(m === "all" ? (set?.words || []) : filtered(m)); setIndex(0); setFlipped(false); setMenuOpen(false); };
  const restart = () => { setOrder(filtered(mode)); setIndex(0); setFlipped(false); setMenuOpen(false); };
  const reshuffle = () => { setOrder(shuffle(filtered(mode))); setIndex(0); setFlipped(false); setMenuOpen(false); };

  async function mark(learned: boolean) {
    if (!set || !word || !flipped || savingRef.current) return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(18);
    const previous = { known, order, index, flipped }; const marked = word; savingRef.current = true; setSaving(true);
    setKnown(v => ({ ...v, [marked.id]: learned }));
    if (mode !== "all" && (mode === "unrated" || learned)) {
      setOrder(v => {
        const nextOrder = v.filter(x => x.id !== marked.id);
        setIndex(i => Math.min(i, Math.max(0, nextOrder.length - 1)));
        return nextOrder;
      });
    } else {
      setIndex(i => Math.min(i + 1, Math.max(0, total - 1)));
    }
    setFlipped(false);
    try {
      const res = await fetch("/api/mistakes", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({wordId:marked.id,setId:set.id,learned}) });
      if (!res.ok) throw new Error(); const data = await res.json();
      if (undoTimer.current) clearTimeout(undoTimer.current);
      setUndo({ token: data.undoToken, message: learned ? "Đã đánh dấu Đã nhớ" : "Đã đánh dấu Chưa nhớ", ...previous });
      undoTimer.current = setTimeout(() => setUndo(null), 5000);
    } catch {
      setKnown(previous.known); setOrder(previous.order); setIndex(previous.index); setFlipped(previous.flipped);
      toast("Không thể lưu đánh giá. Thẻ đã được khôi phục.");
    } finally { savingRef.current = false; setSaving(false); }
  }
  async function undoLast() {
    if (!undo) return; const current = undo; setUndo(null); if (undoTimer.current) clearTimeout(undoTimer.current);
    const res = await fetch("/api/mistakes", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({undoToken:current.token}) });
    if (!res.ok) { toast("Hoàn tác đã hết hạn hoặc không thành công."); return; }
    setKnown(current.known); setOrder(current.order); setIndex(current.index); setFlipped(current.flipped); toast("Đã hoàn tác đánh giá");
  }
  async function toggleBookmark() {
    if (!word || saving) return; const id = bookmarks[word.id]; setSaving(true);
    try {
      const res = await fetch(id ? `/api/bookmarks/${id}` : "/api/bookmarks", { method:id ? "DELETE" : "POST", headers:id ? undefined : {"Content-Type":"application/json"}, body:id ? undefined : JSON.stringify({wordId:word.id}) });
      if (!res.ok) throw new Error(); if (id) setBookmarks(v => { const n={...v}; delete n[word.id]; return n; }); else { const d=await res.json(); setBookmarks(v=>({...v,[word.id]:d.bookmark.id})); }
    } catch { toast("Không thể cập nhật sổ tay."); } finally { setSaving(false); }
  }
  function touchStart(e: TouchEvent<HTMLDivElement>) { if (e.touches.length===1 && !(e.target as HTMLElement).closest("button")) swipeRef.current={x:e.touches[0].clientX,y:e.touches[0].clientY,t:Date.now()}; }
  function touchMove(e: TouchEvent<HTMLDivElement>) { const s=swipeRef.current; if(!s||e.touches.length!==1)return; const dx=e.touches[0].clientX-s.x,dy=e.touches[0].clientY-s.y; if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>8)setSwipe(Math.max(-110,Math.min(110,dx))); }
  function touchEnd(e: TouchEvent<HTMLDivElement>) { const s=swipeRef.current; if(!s)return; const dx=e.changedTouches[0].clientX-s.x,dy=e.changedTouches[0].clientY-s.y; if(Math.abs(dx)>Math.abs(dy)*1.25&&Math.abs(dx)>45){suppressClick.current=true;dx<0?next():prev();} swipeRef.current=null;setSwipe(0); }
  function openMenuFromKeyboard() {
    setMenuOpen(true);
    window.setTimeout(() => menuRef.current?.querySelector<HTMLElement>("[data-menu-item]")?.focus(), 0);
  }
  function closeMenuAndRestoreFocus() {
    setMenuOpen(false);
    window.setTimeout(() => menuButtonRef.current?.focus(), 0);
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const isTyping = Boolean(target?.closest("input,textarea,select,[contenteditable=true]"));
      const pressed = e.key.toLowerCase();

      if (!isTyping && (pressed === "m" || e.key === ".")) {
        e.preventDefault();
        if (menuOpen) closeMenuAndRestoreFocus(); else openMenuFromKeyboard();
        return;
      }
      if (menuOpen) {
        if (e.key === "Escape") { e.preventDefault(); closeMenuAndRestoreFocus(); return; }
        if (isTyping) return;
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[data-menu-item]:not(:disabled)") || []);
        const activeIndex = items.indexOf(document.activeElement as HTMLElement);
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
          e.preventDefault();
          const nextIndex = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? (activeIndex + 1 + items.length) % items.length : (activeIndex - 1 + items.length) % items.length;
          items[nextIndex]?.focus();
          return;
        }
        if (pressed === "b") { e.preventDefault(); void toggleBookmark(); setMenuOpen(false); }
        else if (pressed === "a") { e.preventDefault(); chooseMode("all"); }
        else if (pressed === "u" && unknown > 0) { e.preventDefault(); chooseMode("unknown"); }
        else if (pressed === "n" && unrated > 0) { e.preventDefault(); chooseMode("unrated"); }
        else if (pressed === "j") { e.preventDefault(); jumpInputRef.current?.focus(); }
        else if (pressed === "r") { e.preventDefault(); restart(); }
        else if (pressed === "s") { e.preventDefault(); reshuffle(); }
        else if (pressed === "f") { e.preventDefault(); router.push(`/quiz/${set?.id}?mode=fill`); }
        else if (pressed === "q" && !isVerb) { e.preventDefault(); router.push(`/quiz/${set?.id}?mode=mc`); }
        else if (pressed === "d") { e.preventDefault(); router.push(`/dictation/${set?.id}`); }
        else if (pressed === "g") { e.preventDefault(); router.push(`/match/${set?.id}`); }
        else if (pressed === "t") { e.preventDefault(); router.push(`/quiz/${set?.id}?mode=fill&timed=1&minutes=15`); }
        else if (pressed === "x") { e.preventDefault(); router.push("/study"); }
        return;
      }
      if (isTyping || target?.closest("button,a")) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); setFlipped(f=>!f); }
      else if (e.key === "1" && flipped) { e.preventDefault(); void mark(false); }
      else if (e.key === "2" && flipped) { e.preventDefault(); void mark(true); }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  if (loading) return <main className="fixed inset-0 z-[80] grid place-items-center bg-[#F8F8FC] text-muted">Đang tải bộ từ…</main>;
  if (error || !set) return <main className="fixed inset-0 z-[80] grid place-items-center bg-[#F8F8FC] p-6 text-center"><div>Không thể tải bộ từ.<div className="mt-4 flex gap-2 justify-center"><button className="rounded-xl bg-[#7865EE] px-4 py-2 text-white" onClick={()=>void loadSet()}>Thử lại</button><button className="rounded-xl border px-4 py-2" onClick={()=>router.push("/study")}>Chọn bộ khác</button></div></div></main>;
  if (!word) return <main className="fixed inset-0 z-[80] grid place-items-center bg-[#F8F8FC] p-6 text-center"><div><div className="text-3xl">🎉</div><p className="mt-2 font-semibold">Bạn đã hoàn thành lượt ôn này.</p><p className="mt-1 text-sm text-[#8B899F]">Đánh giá vừa rồi vẫn có thể hoàn tác trong 5 giây.</p><button className="mt-4 rounded-xl border bg-white px-4 py-2" onClick={()=>chooseMode("all")}>Xem tất cả từ</button></div>{undo&&<div className="lexora-undo-snackbar fixed inset-x-3 bottom-[max(20px,env(safe-area-inset-bottom))] z-[100] mx-auto flex max-w-md items-center justify-between gap-3 overflow-hidden rounded-2xl bg-[#242337] px-4 py-3 text-left text-sm text-white shadow-2xl"><span>{undo.message}</span><button onClick={()=>void undoLast()} className="rounded-lg bg-white/15 px-3 py-1.5 font-semibold text-white hover:bg-white/25">Hoàn tác</button><span aria-hidden="true" className="lexora-undo-timer absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[#AFA2FF]"/></div>}</main>;

  const answer = isVerb ? `${word.v1 || ""} — ${word.v2 || ""} — ${word.v3 || ""}` : word.term || "";
  return <main className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-[#F8F8FC] text-[#242337]">
    <header className="relative shrink-0 border-b border-[#EBEAF2] bg-white/95 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3"><button onClick={()=>router.push("/study")} className="rounded-xl border px-3 py-2 text-sm">← Thoát</button><div className="min-w-0 text-center"><div className="truncate text-sm font-bold">{set.name}</div><div className="text-xs text-[#8B899F]">Thẻ {index+1}/{total}</div></div><div aria-hidden="true" className="w-10" /></div>
      <div className="mx-auto mt-3 h-1.5 max-w-4xl overflow-hidden rounded-full bg-[#EBEAF2]"><div className="h-full rounded-full bg-[#7865EE] transition-[width] duration-300" style={{width:`${total?((index+1)/total)*100:0}%`}} /></div>
      <button ref={menuButtonRef} type="button" aria-label="Mở Quick Actions" aria-haspopup="menu" aria-expanded={menuOpen} aria-controls="flashcard-quick-menu" aria-keyshortcuts="M ." title="Mở thao tác nhanh (phím M hoặc dấu chấm)" onClick={()=>setMenuOpen(v=>!v)} className="flashcard-dock-trigger"><span aria-hidden="true">⚡</span><span className="hidden sm:inline"><Shortcut>M</Shortcut></span></button>
      {menuOpen && <button type="button" aria-label="Đóng menu tùy chọn" className="fixed inset-0 z-[85] cursor-default" onClick={()=>setMenuOpen(false)} />}
      {menuOpen && <div ref={menuRef} id="flashcard-quick-menu" role="menu" aria-label="Quick Actions" className="flashcard-dock-panel max-h-[calc(100dvh-90px)] w-[min(21rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-[#EBEAF2] bg-white p-3 shadow-xl">
        <button data-menu-item role="menuitem" aria-keyshortcuts="B" className="mb-3 flex min-h-11 w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-[#F8F7FF] focus:bg-[#F0EDFF]" onClick={()=>{void toggleBookmark();setMenuOpen(false);}}><ActionLabel icon={bookmarks[word.id] ? "★" : "☆"}>{bookmarks[word.id] ? "Bỏ khỏi sổ tay" : "Lưu từ vào sổ tay"}</ActionLabel><Shortcut>B</Shortcut></button>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8B899F]">Lọc lượt học</div>
        <div className="grid gap-1">
          <button data-menu-item role="menuitem" aria-keyshortcuts="A" className="flex min-h-10 items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-[#F0EDFF] focus:bg-[#F0EDFF]" onClick={()=>chooseMode("all")}><ActionLabel icon="▦">Tất cả từ</ActionLabel><Shortcut>A</Shortcut></button>
          <button data-menu-item role="menuitem" aria-keyshortcuts="U" disabled={unknown===0} className="flex min-h-10 items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-[#F0EDFF] focus:bg-[#F0EDFF] disabled:cursor-not-allowed disabled:opacity-40" onClick={()=>chooseMode("unknown")}><ActionLabel icon="◌">Chưa nhớ ({unknown})</ActionLabel><Shortcut>U</Shortcut></button>
          <button data-menu-item role="menuitem" aria-keyshortcuts="N" disabled={unrated===0} className="flex min-h-10 items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-[#F0EDFF] focus:bg-[#F0EDFF] disabled:cursor-not-allowed disabled:opacity-40" onClick={()=>chooseMode("unrated")}><ActionLabel icon="◍">Chưa đánh giá ({unrated})</ActionLabel><Shortcut>N</Shortcut></button>
        </div>
        <div className="my-3 flex gap-2"><div className="relative min-w-0 flex-1"><input ref={jumpInputRef} aria-label="Số thẻ, phím tắt J" value={jump} onChange={e=>setJump(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){const n=Number(jump);if(n)go(n-1);setJump("");setMenuOpen(false);}}} placeholder="Đi tới thẻ…" type="number" className="h-11 w-full rounded-lg border py-2 pl-3 pr-9 text-sm"/><span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"><Shortcut>J</Shortcut></span></div><button data-menu-item role="menuitem" className="rounded-lg bg-[#7865EE] px-3 text-sm font-semibold text-white" onClick={()=>{const n=Number(jump);if(n)go(n-1);setJump("");setMenuOpen(false);}}>Đi</button></div>
        <div className="grid grid-cols-2 gap-2"><button data-menu-item role="menuitem" aria-keyshortcuts="R" className="flex min-h-11 items-center justify-center rounded-lg border px-2 py-2 text-sm hover:bg-[#F8F7FF]" onClick={restart}><ActionLabel icon="↺">Học lại</ActionLabel><Shortcut>R</Shortcut></button><button data-menu-item role="menuitem" aria-keyshortcuts="S" className="flex min-h-11 items-center justify-center rounded-lg border px-2 py-2 text-sm hover:bg-[#F8F7FF]" onClick={reshuffle}><ActionLabel icon="⤨">Xáo trộn</ActionLabel><Shortcut>S</Shortcut></button></div>
        <div className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-[#8B899F]">Chuyển chế độ</div>
        <div className="grid gap-1">
          <button data-menu-item role="menuitem" aria-keyshortcuts="F" className="flex min-h-10 items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-[#F0EDFF] focus:bg-[#F0EDFF]" onClick={()=>router.push(`/quiz/${set.id}?mode=fill`)}><ActionLabel icon="✎">Điền từ tiếng Anh</ActionLabel><Shortcut>F</Shortcut></button>
          {!isVerb && <button data-menu-item role="menuitem" aria-keyshortcuts="Q" className="flex min-h-10 items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-[#F0EDFF] focus:bg-[#F0EDFF]" onClick={()=>router.push(`/quiz/${set.id}?mode=mc`)}><ActionLabel icon="☑">Trắc nghiệm</ActionLabel><Shortcut>Q</Shortcut></button>}
          <button data-menu-item role="menuitem" aria-keyshortcuts="D" className="flex min-h-10 items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-[#F0EDFF] focus:bg-[#F0EDFF]" onClick={()=>router.push(`/dictation/${set.id}`)}><ActionLabel icon="♬">Nghe và viết</ActionLabel><Shortcut>D</Shortcut></button>
          <button data-menu-item role="menuitem" aria-keyshortcuts="G" className="flex min-h-10 items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-[#F0EDFF] focus:bg-[#F0EDFF]" onClick={()=>router.push(`/match/${set.id}`)}><ActionLabel icon="⌘">Ghép cặp</ActionLabel><Shortcut>G</Shortcut></button>
          <button data-menu-item role="menuitem" aria-keyshortcuts="T" className="flex min-h-10 items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-[#F0EDFF] focus:bg-[#F0EDFF]" onClick={()=>router.push(`/quiz/${set.id}?mode=fill&timed=1&minutes=15`)}><ActionLabel icon="◷">Thi thử tính giờ</ActionLabel><Shortcut>T</Shortcut></button>
          <button data-menu-item role="menuitem" aria-keyshortcuts="X" className="mt-1 flex min-h-10 items-center justify-between rounded-lg border-t border-[#EBEAF2] px-3 py-2 text-left text-sm text-[#7A4350] hover:bg-[#FFF4F5] focus:bg-[#FFF4F5]" onClick={()=>router.push("/study")}><ActionLabel icon="←">Thoát về danh sách bộ từ</ActionLabel><Shortcut>X</Shortcut></button>
        </div>
        <div className="mt-3 border-t border-[#EBEAF2] pt-3 text-[0.72rem] leading-5 text-[#8B899F]"><b className="text-[#5E5B75]">Điều khiển:</b> <Shortcut>↑↓</Shortcut> chọn · <Shortcut>Enter</Shortcut> mở · <Shortcut>Esc</Shortcut> đóng</div>
      </div>}
    </header>
    <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-3 py-3 sm:px-6">
      <div role="button" tabIndex={0} aria-label={flipped ? "Ẩn đáp án" : "Lật thẻ để xem đáp án"} aria-pressed={flipped} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}setFlipped(f=>!f);}} onTouchStart={touchStart} onTouchMove={touchMove} onTouchEnd={touchEnd} onTouchCancel={()=>{swipeRef.current=null;setSwipe(0);}} style={{transform:`translateX(${swipe}px) rotate(${swipe/35}deg)`,transition:swipe?"none":"transform 180ms ease-out"}} className="relative h-[min(58vh,540px)] min-h-[270px] w-full max-w-3xl cursor-pointer select-none rounded-3xl outline-none [perspective:1200px] focus-visible:ring-2 focus-visible:ring-[#7865EE] focus-visible:ring-offset-4">
        <div className={`flashcard-flipper relative h-full w-full ${flipped?"is-flipped":""}`}>
          <article className="flashcard-face absolute inset-0 flex h-full flex-col items-center justify-center overflow-y-auto rounded-3xl border border-[#EBEAF2] bg-white p-6 text-center shadow-[0_14px_40px_rgba(36,35,55,0.08)] sm:p-10"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8B899F]">Nghĩa tiếng Việt</div><div className="mt-4 font-serif text-3xl font-bold sm:text-5xl">{word.meaning}</div><div className="mt-5 text-sm text-[#8B899F]">Chạm vào thẻ để xem đáp án</div></article>
          <article className="flashcard-face flashcard-back absolute inset-0 flex h-full flex-col items-center justify-center overflow-y-auto rounded-3xl border border-[#7865EE]/20 bg-white p-6 text-center shadow-[0_14px_40px_rgba(36,35,55,0.08)] sm:p-10"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8B899F]">{isVerb?"V1 — V2 — V3":"Từ tiếng Anh"}</div><div className="mt-4 flex flex-wrap items-center justify-center gap-3 font-serif text-3xl font-bold sm:text-5xl">{answer}<SpeakButton text={isVerb?word.v1||"":word.term||""}/></div>{isVerb?<VerbIpa ipaV1={word.ipaV1} ipaV2={word.ipaV2} ipaV3={word.ipaV3} className="mt-3 text-lg"/>:word.ipa&&<div className="mt-2 text-xl text-[#765FD5]">{word.ipa}</div>}{!isVerb&&word.wtype&&<div className="mt-2 text-sm text-[#8B899F]">({word.wtype})</div>}{!isVerb&&word.example&&<div className="mt-4 max-w-xl text-sm italic text-[#8B899F]">“{word.example}”</div>}</article>
        </div>
      </div>
      <p className="text-center text-xs text-[#8B899F] sm:hidden">Vuốt sang trái/phải để chuyển thẻ</p>
    </section>
    <footer className="shrink-0 border-t border-[#EBEAF2] bg-white px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
      <div className="mx-auto max-w-2xl">{flipped?<div className="grid grid-cols-2 gap-3"><button disabled={saving} onClick={()=>void mark(false)} className="min-h-[52px] rounded-2xl border border-[#F0B7B7] bg-[#FFF1F1] px-3 text-sm font-bold text-[#B64242] active:scale-[.98]">Chưa nhớ <span className="hidden text-xs font-normal sm:inline">· phím 1</span></button><button disabled={saving} onClick={()=>void mark(true)} className="min-h-[52px] rounded-2xl border border-[#B6DEC8] bg-[#EEFBF3] px-3 text-sm font-bold text-[#277A4B] active:scale-[.98]">Đã nhớ <span className="hidden text-xs font-normal sm:inline">· phím 2</span></button></div>:<button onClick={()=>setFlipped(true)} className="min-h-[52px] w-full rounded-2xl bg-[#7865EE] px-4 text-sm font-bold text-white">Lật thẻ để đánh giá</button>}{saving&&<div className="mt-1 text-center text-xs text-[#8B899F]">Đang lưu…</div>}</div>
    </footer>
    {undo&&<div className="lexora-undo-snackbar fixed inset-x-3 bottom-[calc(92px+env(safe-area-inset-bottom))] z-[100] mx-auto flex max-w-md items-center justify-between gap-3 overflow-hidden rounded-2xl bg-[#242337] px-4 py-3 text-sm text-white shadow-2xl"><span>{undo.message}</span><button onClick={()=>void undoLast()} className="rounded-lg bg-white/15 px-3 py-1.5 font-semibold text-white hover:bg-white/25">Hoàn tác</button><span aria-hidden="true" className="lexora-undo-timer absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[#AFA2FF]"/></div>}
  </main>;
}
