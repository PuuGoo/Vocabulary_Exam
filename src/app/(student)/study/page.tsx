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
    if (!sets) return [];
    const query = searchQuery.trim().toLocaleLowerCase("vi");
    if (!query) return sets;
    return sets.filter((set) => `${set.name} ${set.className || ""}`.toLocaleLowerCase("vi").includes(query));
  }, [sets, searchQuery]);

  const timedSet = sets?.find((set) => set.id === timedSetId) || null;

  async function loadSets() {
    setLoadError(false);
    setSets(null);
    try {
      const [res, sessionsRes, goalRes] = await Promise.all([
        fetch("/api/sets"),
        fetch("/api/study-sessions").catch(() => null),
        fetch("/api/goals").catch(() => null),
      ]);
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setSets(data.sets || []);
      if (sessionsRes?.ok) {
        const sessionsData = await sessionsRes.json();
        setSessionPositionBySetId(Object.fromEntries((sessionsData.sessions || []).map((item: { setId: number; position: number }) => [item.setId, item.position])));
      }
      if (goalRes?.ok) setGoal(await goalRes.json());
    } catch {
      setSets([]);
      setLoadError(true);
    }
  }

  useEffect(() => {
    void loadSets();
  }, []);

  function start(setId: number, mode: "fill" | "mc") {
    const set = sets?.find((s) => s.id === setId);
    if (!set || set.count === 0) {
      toast("Bộ từ vựng này chưa có từ nào.");
      return;
    }
    router.push(`/quiz/${setId}?mode=${mode}`);
  }

  function startTimed(setId: number) {
    const set = sets?.find((s) => s.id === setId);
    if (!set || set.count === 0) {
      toast("Bộ từ vựng này chưa có từ nào.");
      return;
    }
    const duration = Number(minutes);
    if (!Number.isInteger(duration) || duration < 1 || duration > 120) {
      toast("Thời gian thi phải từ 1 đến 120 phút.");
      return;
    }
    router.push(`/quiz/${setId}?mode=fill&timed=1&minutes=${duration}`);
  }

  return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Chọn bộ từ vựng để kiểm tra</h2>
      <div className={cx.desc}>Chọn một bộ từ vựng và chế độ kiểm tra phù hợp với bạn.</div>

      <section className="my-4 rounded-xl border border-gold bg-gradient-to-r from-goldpale/70 to-white p-4" aria-labelledby="daily-challenge-title">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 id="daily-challenge-title" className="font-semibold">⚡ Thử thách hôm nay</h3><div className="mt-1 text-xs text-muted">10 câu giống nhau cho mọi người, tính XP một lần mỗi ngày.</div></div><Link className={`${cx.btn} ${cx.btnGold}`} href="/daily-challenge">Tham gia ngay</Link></div>
      </section>

      <section className="my-4 rounded-xl border border-[#9eb5cc] bg-[#e4ecf3]/60 p-4" aria-labelledby="smart-review-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="smart-review-title" className="font-semibold">🧠 Ôn tập thông minh</h3>
            <div className="mt-1 text-xs text-muted">Hệ thống tự chọn từ hay sai, chưa nhớ và từ đã đến lúc ôn lại.</div>
          </div>
          <Link className={`${cx.btn} ${cx.btnDark}`} href="/smart-review">Bắt đầu ôn</Link>
        </div>
      </section>

      <section className="my-4 rounded-xl border border-gold/50 bg-goldpale/30 p-4" aria-labelledby="mixed-practice-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 id="mixed-practice-title" className="font-semibold">🎯 Kiểm tra nhiều bộ từ</h3><div className="mt-1 text-xs text-muted">Tự chọn nhiều chủ đề và trộn thành một bài Điền từ hoặc Trắc nghiệm.</div></div>
          <Link className={`${cx.btn} ${cx.btnGold}`} href="/mixed-practice">Tạo bài tổng hợp</Link>
        </div>
      </section>

      <section className="my-4 rounded-xl border border-gold/40 bg-gold/5 p-4" aria-labelledby="quick-practice-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="quick-practice-title" className="font-semibold">⚡ Luyện nhanh</h3>
            <div className="mt-1 text-xs text-muted">Ưu tiên từ chưa nhớ và những từ bạn thường trả lời sai.</div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted" htmlFor="quick-count">Số từ</label>
            <select id="quick-count" className={`${cx.input} !mb-0 !w-auto !py-2`} value={quickCount} onChange={(event) => setQuickCount(event.target.value)}>
              <option value="5">5 từ</option>
              <option value="10">10 từ</option>
              <option value="20">20 từ</option>
            </select>
            <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => router.push(`/quiz/quick?quick=1&count=${quickCount}&mode=fill`)}>
              Luyện ngay
            </button>
          </div>
        </div>
      </section>

      {goal && (
        <section className="my-4 rounded-xl border border-gold/40 bg-gold/5 p-4" aria-label="Mục tiêu học hôm nay">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold">{goal.completed ? "🎉 Đã hoàn thành mục tiêu" : "Mục tiêu hôm nay"}</div>
              <div className="mt-0.5 text-xs text-muted">{goal.todayWords}/{goal.dailyWords} từ · 🔥 {goal.streak} ngày liên tiếp</div>
            </div>
            <Link className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} href="/progress">Xem tiến độ</Link>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, (goal.todayWords / goal.dailyWords) * 100)}%` }} />
          </div>
        </section>
      )}

      {sets !== null && sets.length > 0 && (
        <div className="mb-4 max-w-md">
          <label className="sr-only" htmlFor="study-set-search">Tìm bộ từ vựng</label>
          <input
            id="study-set-search"
            type="search"
            className={`${cx.input} !mb-0`}
            placeholder="Tìm bộ từ vựng..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {sets === null ? (
        <div className={cx.empty} role="status">Đang tải danh sách bộ từ...</div>
      ) : loadError ? (
        <div className={cx.empty}>
          Không thể tải danh sách bộ từ.
          <div className="mt-3">
            <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => void loadSets()}>Thử lại</button>
          </div>
        </div>
      ) : sets.length === 0 ? (
        <div className={cx.empty}>Chưa có bộ từ vựng nào — hãy liên hệ giáo viên/admin.</div>
      ) : filteredSets.length === 0 ? (
        <div className={cx.empty}>
          Không tìm thấy bộ từ phù hợp.
          <div className="mt-3">
            <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setSearchQuery("")}>Xoá tìm kiếm</button>
          </div>
        </div>
      ) : (
        filteredSets.map((s) => (
            <div className={cx.setcard} key={s.id}>
              <div>
                <div className="font-semibold">{s.name}</div>
                <div className="text-[0.78rem] text-muted mt-0.5">
                  {s.type === "irregular_verb" ? "Động từ bất quy tắc" : "Từ vựng IELTS"} · {s.count} mục
                  {s.className ? <span className={`${cx.badgeGold} ml-2`}>Lớp: {s.className}</span> : null}
                  {sessionPositionBySetId[s.id] > 1 ? <span className={`${cx.badgeBlue} ml-2`}>Đang học: thẻ {sessionPositionBySetId[s.id]}</span> : null}
                </div>
              </div>
              <div className="flex gap-2.5 flex-wrap">
                <button
                  className={`${cx.btn} ${cx.btnGold}`}
                  disabled={s.count === 0}
                  onClick={() => router.push(`/learn/${s.id}`)}
                >
                  {s.count === 0 ? "Chưa có từ" : sessionPositionBySetId[s.id] > 1 ? "↪ Tiếp tục học" : "📖 Học bài"}
                </button>
                {s.type === "irregular_verb" ? (
                  <button className={`${cx.btn} ${cx.btnGhost}`} disabled={s.count === 0} onClick={() => start(s.id, "fill")}>
                    Điền V1/V2/V3
                  </button>
                ) : (
                  <>
                    <button className={`${cx.btn} ${cx.btnGhost}`} disabled={s.count === 0} onClick={() => start(s.id, "fill")}>
                      Điền từ tiếng Anh
                    </button>
                    <button className={`${cx.btn} ${cx.btnGhost}`} disabled={s.count === 0} onClick={() => start(s.id, "mc")}>
                      Trắc nghiệm
                    </button>
                  </>
                )}
                <button className={`${cx.btn} ${cx.btnGhost}`} disabled={s.count === 0} onClick={() => router.push(`/match/${s.id}`)}>
                  🧩 Ghép cặp
                </button>
                <button className={`${cx.btn} ${cx.btnGhost}`} disabled={s.count === 0} onClick={() => router.push(`/dictation/${s.id}`)}>
                  🎧 Nghe & viết
                </button>
                <button className={`${cx.btn} ${cx.btnGhost}`} disabled={s.count === 0} onClick={() => router.push(`/listen/${s.id}`)}>
                  🔊 Nghe rảnh tay
                </button>
                <button className={`${cx.btn} ${cx.btnGhost}`} disabled={s.count === 0} onClick={() => router.push(`/pronunciation/${s.id}`)}>
                  🎙️ Luyện phát âm
                </button>
                {s.type !== "irregular_verb" && (
                  <button className={`${cx.btn} ${cx.btnGhost}`} disabled={s.count === 0} onClick={() => router.push(`/sentence/${s.id}`)}>
                    🧩 Xếp câu
                  </button>
                )}
                <button
                  className={`${cx.btn} ${cx.btnGhost}`}
                  disabled={s.count === 0}
                  onClick={() => setTimedSetId(timedSetId === s.id ? null : s.id)}
                >
                  ⏱ Thi thử (tính giờ)
                </button>
              </div>
            </div>
        ))
      )}

      {timedSet && (
        <Modal title={`Thi thử — ${timedSet.name}`} onClose={() => setTimedSetId(null)}>
          <div className="text-[0.87rem] text-muted mb-4">
            Bài sẽ tự nộp khi hết giờ. Bạn có thể nộp sớm bất cứ lúc nào.
          </div>
          <label className={cx.label} htmlFor="timed-minutes">Thời gian làm bài (phút)</label>
          <input
            id="timed-minutes"
            type="number"
            min={1}
            max={120}
            className={`${cx.input} max-w-32`}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") startTimed(timedSet.id);
            }}
            autoFocus
          />
          <div className="flex gap-2">
            <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => startTimed(timedSet.id)}>Bắt đầu thi thử</button>
            <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setTimedSetId(null)}>Huỷ</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
