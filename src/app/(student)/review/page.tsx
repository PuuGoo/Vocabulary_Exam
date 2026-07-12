"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";
import SpeakButton from "@/components/SpeakButton";

type MistakeRow = {
  id: number;
  timesWrong: number;
  lastWrongAt: string;
  wordId: number;
  meaning: string;
  term: string | null;
  v1: string | null;
  v2: string | null;
  v3: string | null;
  setId: number;
  setName: string;
  setType: "irregular_verb" | "ielts_vocab";
};

export default function ReviewPage() {
  const [rows, setRows] = useState<MistakeRow[] | null>(null);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  async function load() {
    const res = await fetch("/api/mistakes");
    const data = await res.json();
    setRows(data.mistakes || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function markLearned(id: number) {
    await fetch(`/api/mistakes/${id}`, { method: "DELETE" });
    toast("Đã đánh dấu là thuộc rồi — bỏ khỏi danh sách ôn tập.");
    setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
  }

  return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Ôn từ sai</h2>
      <div className={cx.desc}>
        Danh sách các từ bạn từng làm sai, xếp theo số lần sai nhiều nhất. Bấm vào thẻ để xem đáp án, hoặc đánh dấu
        &quot;Đã thuộc&quot; để bỏ khỏi danh sách.
      </div>

      {rows === null ? (
        <div className={cx.empty}>Đang tải...</div>
      ) : rows.length === 0 ? (
        <div className={cx.empty}>Bạn chưa có từ nào cần ôn lại — làm tốt lắm! 🎉</div>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="border border-line rounded-[10px] p-4 mb-3 bg-white">
            <div className="flex justify-between items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <div className="text-[0.72rem] text-muted mb-1">
                  {r.setName} · Sai {r.timesWrong} lần
                </div>
                <div
                  className="cursor-pointer"
                  onClick={() => setRevealed((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
                >
                  {r.setType === "irregular_verb" ? (
                    <>
                      <div className="font-bold">{r.meaning}</div>
                      {revealed[r.id] && (
                        <div className="mt-1.5 flex items-center gap-2 text-[0.95rem]">
                          <span>
                            {r.v1} — {r.v2} — {r.v3}
                          </span>
                          <SpeakButton text={r.v1 || ""} />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="font-bold">{r.meaning}</div>
                      {revealed[r.id] && (
                        <div className="mt-1.5 flex items-center gap-2 text-[0.95rem]">
                          <span>{r.term}</span>
                          <SpeakButton text={r.term || ""} />
                        </div>
                      )}
                    </>
                  )}
                  {!revealed[r.id] && <div className="text-muted text-[0.8rem] mt-1">(Bấm để xem đáp án)</div>}
                </div>
              </div>
              <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={() => markLearned(r.id)}>
                ✓ Đã thuộc
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
