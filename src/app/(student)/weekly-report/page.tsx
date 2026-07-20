"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";

type Report = {
  offset: number;
  period: { start: string; end: string };
  days: Array<{ date: string; wordsReviewed: number; quizzesCompleted: number }>;
  summary: { wordsReviewed: number; quizzesCompleted: number; activeDays: number; accuracy: number | null };
  previous: { wordsReviewed: number; quizzesCompleted: number; activeDays: number; accuracy: number | null };
  modes: Array<{ mode: string; count: number }>;
  difficultWords: Array<{ id: number; wordId: number; setId: number; setName: string; meaning: string; answer: string; timesWrong: number }>;
  recommendations: Array<{ title: string; detail: string; href: string }>;
};

const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const MODE_LABELS: Record<string, string> = {
  fill: "Điền từ",
  mc: "Trắc nghiệm",
  match: "Ghép cặp",
  dictation: "Nghe & viết",
  pronunciation: "Luyện phát âm",
  sentence: "Xếp câu",
  mixed: "Kiểm tra tổng hợp",
  daily: "Thử thách hằng ngày",
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function comparison(current: number | null, previous: number | null, suffix = "") {
  if (current === null) return "Chưa có dữ liệu";
  if (previous === null || previous === 0) return current > 0 ? "Có hoạt động mới" : "Không đổi";
  const delta = current - previous;
  return delta === 0 ? "Không đổi" : `${delta > 0 ? "↑" : "↓"} ${Math.abs(delta)}${suffix} so với tuần trước`;
}

export default function WeeklyReportPage() {
  const [offset, setOffset] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setLoadError(false);
    fetch(`/api/weekly-report?offset=${offset}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("load failed")))
      .then((data) => { if (!cancelled) setReport(data); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [offset, loadAttempt]);

  if (!report) {
    return (
      <div className={cx.panel}>
        <div className={cx.empty} role="status">
          {loadError ? <>Không thể tạo báo cáo tuần.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setLoadAttempt((value) => value + 1)}>Thử lại</button></div></> : "Đang tổng hợp báo cáo tuần..."}
        </div>
      </div>
    );
  }

  const maxWords = Math.max(1, ...report.days.map((day) => day.wordsReviewed));
  return (
    <div className={`${cx.panel} print:border-0 print:shadow-none`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className={cx.h2}>Báo cáo học tập theo tuần</h2>
          <div className={cx.desc}>{dateLabel(report.period.start)} – {dateLabel(report.period.end)}</div>
        </div>
        <div className="flex gap-2 print:hidden">
          <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} disabled={offset >= 7} onClick={() => setOffset((value) => value + 1)}>← Tuần trước</button>
          <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - 1))}>Tuần sau →</button>
          <button className={`${cx.btn} ${cx.btnGold} !px-3 !py-1.5`} onClick={() => window.print()}>In / PDF</button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric value={report.summary.wordsReviewed} label="Lượt ôn từ" comparison={comparison(report.summary.wordsReviewed, report.previous.wordsReviewed)} />
        <Metric value={report.summary.quizzesCompleted} label="Bài hoàn thành" comparison={comparison(report.summary.quizzesCompleted, report.previous.quizzesCompleted)} />
        <Metric value={`${report.summary.activeDays}/7`} label="Ngày hoạt động" comparison={comparison(report.summary.activeDays, report.previous.activeDays)} />
        <Metric value={report.summary.accuracy === null ? "—" : `${report.summary.accuracy}%`} label="Độ chính xác" comparison={comparison(report.summary.accuracy, report.previous.accuracy, "%")} />
      </div>

      <section className="mb-5 rounded-xl border border-line bg-white p-4" aria-labelledby="weekly-chart-title">
        <div className="flex items-start justify-between gap-3">
          <div><h3 id="weekly-chart-title" className="font-semibold">Nhịp học trong tuần</h3><div className="mt-1 text-xs text-muted">Số lượt ôn từ theo từng ngày.</div></div>
          <div className="text-xs text-muted">Cao nhất: {maxWords} từ/ngày</div>
        </div>
        <div className="mt-5 grid h-48 grid-cols-7 items-end gap-2 border-b border-line px-1">
          {report.days.map((day, index) => (
            <div key={day.date} className="flex h-full flex-col items-center justify-end gap-1" title={`${dateLabel(day.date)}: ${day.wordsReviewed} từ, ${day.quizzesCompleted} bài`}>
              <span className="text-[0.68rem] font-medium">{day.wordsReviewed}</span>
              <div className="w-full max-w-10 rounded-t-md bg-gold transition-[height]" style={{ height: day.wordsReviewed > 0 ? `${Math.max(8, (day.wordsReviewed / maxWords) * 100)}%` : "2px" }} />
              <span className="pb-1 text-[0.68rem] text-muted">{DAY_LABELS[index]}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-line bg-white p-4" aria-labelledby="weekly-modes-title">
          <h3 id="weekly-modes-title" className="font-semibold">Chế độ đã luyện</h3>
          {report.modes.length === 0 ? <div className="py-6 text-center text-sm text-muted">Chưa có bài kiểm tra trong tuần.</div> : (
            <div className="mt-3 space-y-2">
              {report.modes.map((mode) => (
                <div key={mode.mode} className="flex items-center justify-between rounded-lg bg-panel px-3 py-2 text-sm">
                  <span>{MODE_LABELS[mode.mode] || mode.mode}</span><b>{mode.count} bài</b>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-line bg-white p-4" aria-labelledby="weekly-hard-words-title">
          <div className="flex items-center justify-between gap-2"><h3 id="weekly-hard-words-title" className="font-semibold">Từ khó trong tuần</h3>{report.difficultWords.length > 0 && <Link className="text-xs text-golddark hover:underline print:hidden" href="/review">Ôn ngay →</Link>}</div>
          {report.difficultWords.length === 0 ? <div className="py-6 text-center text-sm text-muted">Không có từ sai mới trong tuần.</div> : (
            <div className="mt-3 space-y-2">
              {report.difficultWords.map((word) => (
                <div key={word.id} className="flex items-start justify-between gap-3 border-b border-line py-2 last:border-0">
                  <div><b className="text-sm">{word.answer}</b><div className="text-xs text-muted">{word.meaning} · {word.setName}</div></div>
                  <span className="shrink-0 text-xs text-bad">Sai {word.timesWrong} lần</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-gold/40 bg-goldpale/30 p-4" aria-labelledby="weekly-suggestions-title">
        <h3 id="weekly-suggestions-title" className="font-semibold">Gợi ý cho tuần tiếp theo</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {report.recommendations.map((item) => (
            <div key={item.title} className="rounded-lg bg-white p-3">
              <div className="text-sm font-semibold">{item.title}</div>
              <div className="mt-1 text-xs text-muted">{item.detail}</div>
              <Link className="mt-2 inline-block text-xs font-medium text-golddark hover:underline print:hidden" href={item.href}>Thực hiện →</Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ value, label, comparison: detail }: { value: string | number; label: string; comparison: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3 text-center">
      <div className="font-serif text-2xl font-bold">{value}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
      <div className="mt-2 text-[0.65rem] text-golddark">{detail}</div>
    </div>
  );
}
