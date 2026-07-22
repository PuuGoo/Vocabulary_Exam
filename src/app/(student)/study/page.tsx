"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";
import Modal from "@/components/Modal";

type SetSummary = { id: number; name: string; type: string; count: number; className?: string | null };
type GoalSummary = { dailyWords: number; todayWords: number; streak: number; completed: boolean };

export default function StudyPage() {
  const router = useRouter();
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [timedSetId, setTimedSetId] = useState<number | null>(null);
  const [minutes, setMinutes] = useState("15");
  const [quickCount, setQuickCount] = useState("10");
  const [sessionPositionBySetId, setSessionPositionBySetId] = useState<Record<number, number>>({});
  const [goal, setGoal] = useState<GoalSummary | null>(null);

  const filteredSets = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("vi");
    return (sets || []).filter((set) => !query || `${set.name} ${set.className || ""}`.toLocaleLowerCase("vi").includes(query));
  }, [sets, searchQuery]);
  const timedSet = sets?.find((set) => set.id === timedSetId) || null;

  async function loadSets() {
    setLoadError(false); setSets(null);
    try {
      const response = await fetch("/api/sets");
      if (!response.ok) throw new Error();
      const data = await response.json();
      setSets(data.sets || []);
      void fetch("/api/study-sessions").then(async (result) => {
        if (!result.ok) return;
        const sessionData = await result.json();
        setSessionPositionBySetId(Object.fromEntries((sessionData.sessions || []).map((item: { setId: number; position: number }) => [item.setId, item.position])));
      }).catch(() => undefined);
      void fetch("/api/goals").then(async (result) => { if (result.ok) setGoal(await result.json()); }).catch(() => undefined);
    } catch { setSets([]); setLoadError(true); }
  }

  useEffect(() => { void loadSets(); }, []);

  function requireWords(setId: number) {
    const set = sets?.find((item) => item.id === setId);
    if (!set?.count) { toast("Bộ từ này chưa có từ nào."); return null; }
    return set;
  }
  function startQuiz(setId: number, mode: "fill" | "mc") { if (requireWords(setId)) router.push(`/quiz/${setId}?mode=${mode}`); }
  function startTimed(setId: number) {
    if (!requireWords(setId)) return;
    const duration = Number(minutes);
    if (!Number.isInteger(duration) || duration < 1 || duration > 120) return toast("Thời gian thi phải từ 1 đến 120 phút.");
    router.push(`/quiz/${setId}?mode=fill&timed=1&minutes=${duration}`);
  }

  return <div className="lexora-page-enter space-y-7">
    <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-sm font-semibold text-gold">Học tập của tôi</p><h1 className="text-[clamp(1.8rem,4vw,2.5rem)] font-extrabold tracking-[-0.045em]">Bắt đầu buổi học tiếp theo.</h1><p className="mt-2 max-w-2xl text-[0.95rem] leading-6 text-muted">Ôn tập có trọng tâm hoặc chọn một bộ từ và luyện theo cách phù hợp với bạn.</p></div>{sets && <div className="self-start rounded-full border border-line bg-white px-3 py-2 text-xs font-bold text-muted sm:self-auto">{sets.length} bộ từ có sẵn</div>}</section>

    <section className="lexora-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <LaunchCard href="/smart-review" icon="↻" title="Ôn tập thông minh" detail="Ôn các từ đến hạn hôm nay" tone="purple" action="Bắt đầu ôn" />
      <LaunchCard href="/daily-challenge" icon="✦" title="Thử thách hằng ngày" detail="10 câu hỏi · nhận điểm kinh nghiệm" tone="orange" action="Tham gia ngay" />
      <LaunchCard href="/mixed-practice" icon="◎" title="Luyện tập trộn lẫn" detail="Luân phiên chủ đề và dạng câu hỏi" tone="green" action="Tạo lượt học" />
      <article className="lexora-card flex min-h-[154px] flex-col justify-between p-5 transition hover:-translate-y-1 hover:shadow-[0_10px_25px_rgba(43,39,74,0.07)]"><div className="flex items-start justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#FFF8DF] font-bold text-[#A87C12]">⚡</span><select aria-label="Số từ luyện nhanh" className="rounded-[9px] border border-line bg-white px-2 py-1.5 text-xs font-bold" value={quickCount} onChange={(event) => setQuickCount(event.target.value)}><option value="5">5 từ</option><option value="10">10 từ</option><option value="20">20 từ</option></select></div><div className="mt-4"><h2 className="text-sm font-extrabold">Luyện nhanh</h2><p className="mt-1 text-xs text-muted">Ưu tiên từ yếu và dễ quên</p><button onClick={() => router.push(`/quiz/quick?quick=1&count=${quickCount}&mode=fill`)} className="mt-4 text-xs font-bold text-gold hover:underline">Luyện ngay →</button></div></article>
    </section>

    {goal && <section className="lexora-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] text-lg ${goal.completed ? "bg-[#E7F7F2] text-[#398B73]" : "bg-[#EFECFF] text-[#6550DB]"}`}>{goal.completed ? "✓" : "✦"}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div><b className="text-sm">{goal.completed ? "Đã hoàn thành mục tiêu hôm nay" : "Mục tiêu học hôm nay"}</b><p className="mt-1 text-xs text-muted">{goal.todayWords}/{goal.dailyWords} từ · chuỗi {goal.streak} ngày</p></div><Link href="/progress" className="text-xs font-bold text-gold hover:underline">Xem tiến độ</Link></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#F0EEF7]"><div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${Math.min(100, (goal.todayWords / Math.max(1, goal.dailyWords)) * 100)}%` }} /></div></div></section>}

    <section>
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-lg font-extrabold tracking-[-0.02em]">Bộ từ của bạn</h2><p className="mt-1 text-xs text-muted">Chọn một bộ từ, sau đó chọn chế độ luyện tập.</p></div>{sets && sets.length > 0 && <label className="relative block w-full sm:w-72"><span className="sr-only">Tìm bộ từ</span><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">⌕</span><input type="search" className="h-10 w-full rounded-[11px] border border-line bg-white pl-9 pr-3 text-sm outline-none focus:border-gold" placeholder="Tìm kiếm bộ từ..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></label>}</div>
      {sets === null ? <div className="grid gap-4 md:grid-cols-2">{[1,2,3,4].map((item) => <div key={item} className="lexora-card lexora-skeleton h-48" />)}</div>
        : loadError ? <EmptyState title="Không thể tải bộ từ" detail="Kết nối có thể đã bị gián đoạn." action="Thử lại" onAction={() => void loadSets()} />
        : sets.length === 0 ? <EmptyState title="Chưa có bộ từ nào" detail="Hãy nhờ giáo viên hoặc quản trị viên thêm bộ từ vựng." />
        : filteredSets.length === 0 ? <EmptyState title="Không tìm thấy bộ từ phù hợp" detail="Hãy thử một từ khóa khác." action="Xóa tìm kiếm" onAction={() => setSearchQuery("")} />
        : <div className="grid items-start gap-4 md:grid-cols-2">{filteredSets.map((set) => <CollectionCard key={set.id} set={set} position={sessionPositionBySetId[set.id] || 0} onLearn={() => { if (requireWords(set.id)) router.push(`/learn/${set.id}`); }} onFill={() => startQuiz(set.id, "fill")} onMc={() => startQuiz(set.id, "mc")} onRoute={(route) => { if (requireWords(set.id)) router.push(`/${route}/${set.id}`); }} onTimed={() => setTimedSetId(set.id)} />)}</div>}
    </section>

    {timedSet && <Modal title={`Thi thử tính giờ · ${timedSet.name}`} onClose={() => setTimedSetId(null)}><p className="mb-5 text-sm leading-6 text-muted">Bài thi sẽ tự động nộp khi hết giờ. Bạn vẫn có thể hoàn thành sớm.</p><label className={cx.label} htmlFor="timed-minutes">Thời gian làm bài (phút)</label><input id="timed-minutes" type="number" min={1} max={120} className={`${cx.input} max-w-32`} value={minutes} onChange={(event) => setMinutes(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") startTimed(timedSet.id); }} autoFocus /><div className="flex gap-2"><button className={`${cx.btn} ${cx.btnGold}`} onClick={() => startTimed(timedSet.id)}>Bắt đầu thi</button><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setTimedSetId(null)}>Hủy</button></div></Modal>}
  </div>;
}

function LaunchCard({ href, icon, title, detail, tone, action }: { href: string; icon: string; title: string; detail: string; tone: "purple" | "orange" | "green"; action: string }) {
  const tones = { purple: "bg-[#EFECFF] text-[#6550DB]", orange: "bg-[#FFF0E8] text-[#D87855]", green: "bg-[#E7F7F2] text-[#398B73]" };
  return <Link href={href} className="lexora-card flex min-h-[154px] flex-col justify-between p-5 transition hover:-translate-y-1 hover:border-[#D8D2FF] hover:shadow-[0_10px_25px_rgba(43,39,74,0.07)]"><span className={`flex h-10 w-10 items-center justify-center rounded-[12px] font-bold ${tones[tone]}`}>{icon}</span><div className="mt-4"><h2 className="text-sm font-extrabold">{title}</h2><p className="mt-1 text-xs text-muted">{detail}</p><span className="mt-4 block text-xs font-bold text-gold">{action} →</span></div></Link>;
}

function CollectionCard({ set, position, onLearn, onFill, onMc, onRoute, onTimed }: { set: SetSummary; position: number; onLearn: () => void; onFill: () => void; onMc: () => void; onRoute: (route: string) => void; onTimed: () => void }) {
  const empty = set.count === 0;
  const modeClass = "rounded-[10px] border border-line bg-white px-3 py-2.5 text-left text-xs font-bold text-ink transition hover:border-[#CFC7FF] hover:bg-[#F8F7FC] disabled:cursor-not-allowed disabled:opacity-40";
  return <article className="lexora-card overflow-hidden"><div className="p-5"><div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#EFECFF] text-xs font-extrabold text-[#6550DB]">{set.type === "irregular_verb" ? "V123" : "Aa"}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3 className="line-clamp-2 text-sm font-extrabold leading-5">{set.name}</h3><span className="shrink-0 rounded-full bg-[#F7F6FA] px-2 py-1 text-[0.65rem] font-bold text-muted">{set.count} từ</span></div><p className="mt-1.5 text-xs text-muted">{set.type === "irregular_verb" ? "Động từ bất quy tắc" : "Từ vựng IELTS"}{set.className ? ` · ${set.className}` : ""}</p>{position > 1 && <p className="mt-2 text-[0.68rem] font-semibold text-[#6550DB]">Tiếp tục từ thẻ {position}</p>}</div></div><button disabled={empty} onClick={onLearn} className="mt-5 h-10 w-full rounded-[11px] bg-gold text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-golddark disabled:cursor-not-allowed disabled:opacity-40">{empty ? "Chưa có từ" : position > 1 ? "Tiếp tục học" : "Bắt đầu học"}</button></div><details className="group border-t border-line"><summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-xs font-bold text-muted transition hover:bg-[#FBFAFE] hover:text-ink">Chế độ luyện tập <span className="transition group-open:rotate-180">⌄</span></summary><div className="grid gap-2 border-t border-line bg-[#FBFAFE] p-4 sm:grid-cols-2"><button disabled={empty} onClick={onFill} className={modeClass}>{set.type === "irregular_verb" ? "Điền V1 / V2 / V3" : "Điền từ tiếng Anh"}</button>{set.type !== "irregular_verb" && <button disabled={empty} onClick={onMc} className={modeClass}>Trắc nghiệm</button>}<button disabled={empty} onClick={() => onRoute("match")} className={modeClass}>Ghép cặp</button><button disabled={empty} onClick={() => onRoute("dictation")} className={modeClass}>Nghe và viết</button><button disabled={empty} onClick={() => onRoute("listen")} className={modeClass}>Nghe rảnh tay</button><button disabled={empty} onClick={() => onRoute("pronunciation")} className={modeClass}>Luyện phát âm</button>{set.type !== "irregular_verb" && <button disabled={empty} onClick={() => onRoute("sentence")} className={modeClass}>Xếp câu</button>}<button disabled={empty} onClick={onTimed} className={modeClass}>Thi thử tính giờ</button></div></details></article>;
}

function EmptyState({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) { return <div className="lexora-card px-5 py-12 text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#EFECFF] text-gold">⌕</div><h3 className="mt-4 text-sm font-extrabold">{title}</h3><p className="mt-1 text-xs text-muted">{detail}</p>{action && onAction && <button onClick={onAction} className="mt-4 rounded-[10px] bg-gold px-4 py-2 text-xs font-bold text-white">{action}</button>}</div>; }
