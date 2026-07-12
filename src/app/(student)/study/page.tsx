"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";

type SetSummary = { id: number; name: string; type: string; count: number; className?: string | null };

export default function StudyPage() {
  const router = useRouter();
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const [timedSetId, setTimedSetId] = useState<number | null>(null);
  const [minutes, setMinutes] = useState(15);

  useEffect(() => {
    fetch("/api/sets")
      .then((r) => r.json())
      .then((d) => setSets(d.sets || []));
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
    const mode = set.type === "irregular_verb" ? "fill" : "fill";
    router.push(`/quiz/${setId}?mode=${mode}&timed=1&minutes=${minutes}`);
  }

  return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Chọn bộ từ vựng để kiểm tra</h2>
      <div className={cx.desc}>Chọn một bộ từ vựng và chế độ kiểm tra phù hợp với bạn.</div>

      {sets === null ? (
        <div className={cx.empty}>Đang tải...</div>
      ) : sets.length === 0 ? (
        <div className={cx.empty}>Chưa có bộ từ vựng nào — hãy liên hệ giáo viên/admin.</div>
      ) : (
        sets.map((s) => (
          <div key={s.id}>
            <div className={cx.setcard}>
              <div>
                <div className="font-semibold">{s.name}</div>
                <div className="text-[0.78rem] text-muted mt-0.5">
                  {s.type === "irregular_verb" ? "Động từ bất quy tắc" : "Từ vựng IELTS"} · {s.count} mục
                  {s.className ? <span className={`${cx.badgeGold} ml-2`}>Lớp: {s.className}</span> : null}
                </div>
              </div>
              <div className="flex gap-2.5 flex-wrap">
                {s.type === "irregular_verb" ? (
                  <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => start(s.id, "fill")}>
                    Điền V1/V2/V3
                  </button>
                ) : (
                  <>
                    <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => start(s.id, "fill")}>
                      Điền từ tiếng Anh
                    </button>
                    <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => start(s.id, "mc")}>
                      Trắc nghiệm
                    </button>
                  </>
                )}
                <button
                  className={`${cx.btn} ${cx.btnGhost}`}
                  onClick={() => setTimedSetId(timedSetId === s.id ? null : s.id)}
                >
                  ⏱ Thi thử (tính giờ)
                </button>
              </div>
            </div>
            {timedSetId === s.id && (
              <div className="border border-line rounded-[10px] p-4 mb-3 bg-white -mt-1.5 flex items-center gap-3 flex-wrap">
                <label className="text-[0.85rem] text-muted">Thời gian làm bài (phút):</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  className={`${cx.input} !mb-0 !w-24`}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value) || 15)}
                />
                <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => startTimed(s.id)}>
                  Bắt đầu thi thử
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
