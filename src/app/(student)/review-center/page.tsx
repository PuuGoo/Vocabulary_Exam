"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";

type ReviewSummary = {
  due: number;
  difficult: number;
  forgotten: number;
  stale: number;
  new: number;
  mistakes: number | null;
  saved: number | null;
};

export default function ReviewCenterPage() {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [loadError, setLoadError] = useState(false);

  async function load() {
    setSummary(null);
    setLoadError(false);
    try {
      const [smartRes, mistakeRes, bookmarkRes] = await Promise.all([
        fetch("/api/smart-review?limit=0"),
        fetch("/api/mistakes").catch(() => null),
        fetch("/api/bookmarks").catch(() => null),
      ]);
      if (!smartRes.ok) throw new Error("load failed");
      const smart = await smartRes.json();
      const mistakes = mistakeRes?.ok ? await mistakeRes.json() : null;
      const bookmarks = bookmarkRes?.ok ? await bookmarkRes.json() : null;
      setSummary({
        due: smart.summary?.due ?? 0,
        difficult: smart.summary?.difficult ?? 0,
        forgotten: smart.summary?.forgotten ?? 0,
        stale: smart.summary?.stale ?? 0,
        new: smart.summary?.new ?? 0,
        mistakes: mistakes ? (mistakes.mistakes || []).length : null,
        saved: bookmarks ? (bookmarks.bookmarks || []).length : null,
      });
    } catch {
      setLoadError(true);
      setSummary({ due: 0, difficult: 0, forgotten: 0, stale: 0, new: 0, mistakes: null, saved: null });
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Ôn tập</h2>
      <div className={cx.desc}>Toàn bộ hệ thống ôn tập của bạn trong một nơi: từ đến hạn, từ làm sai và từ đã lưu.</div>

      {summary === null ? (
        <div className={cx.empty} role="status">Đang tổng hợp lịch ôn...</div>
      ) : loadError ? (
        <div className={cx.empty}>
          Không thể tải lịch ôn.
          <div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => void load()}>Thử lại</button></div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <ReviewCard href="/smart-review" icon="↻" title="Đến hạn" detail={summary.due || 0} sub="Smart Review tự xếp lịch 1 · 3 · 7 · 14 · 28 ngày" cta="Mở ôn tập thông minh" />
          <ReviewCard href="/review" icon="✕" title="Từ sai" detail={summary.mistakes ?? 0} sub="Từ bạn từng làm sai, đánh dấu đã thuộc khi nhớ." cta="Ôn từ sai" />
          <ReviewCard href="/notebook/practice" icon="★" title="Đã lưu" detail={summary.saved ?? 0} sub="Luyện riêng các từ bạn đã lưu vào sổ tay." cta="Luyện từ đã lưu" />
        </div>
      )}
      {summary && (summary.difficult > 0 || summary.forgotten > 0 || summary.stale > 0 || summary.new > 0) && (
        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          {summary.difficult > 0 && <span className="rounded-full bg-badbg px-3 py-1 text-bad">{summary.difficult} hay sai</span>}
          {summary.forgotten > 0 && <span className="rounded-full bg-goldpale px-3 py-1 text-golddark">{summary.forgotten} chưa nhớ</span>}
          {summary.stale > 0 && <span className="rounded-full bg-[#e4ecf3] px-3 py-1 text-[#2b4a6b]">{summary.stale} đến hạn</span>}
          {summary.new > 0 && <span className="rounded-full bg-line/50 px-3 py-1 text-muted">{summary.new} từ mới</span>}
        </div>
      )}
      <div className="mt-8 rounded-xl border border-gold/40 bg-gold/5 p-4 text-sm text-muted">
        <b className="text-ink">Mẹo:</b> Smart Review tự đặt lịch nhắc lại theo mức độ nhớ. Nếu bạn làm sai trong bài kiểm tra, từ đó cũng xuất hiện ở “Từ sai” để bạn ôn lại có chủ đích.
      </div>
    </div>
  );
}

function ReviewCard({ href, icon, title, detail, sub, cta }: { href: string; icon: string; title: string; detail: number | string; sub: string; cta: string }) {
  return (
    <Link href={href} className="lexora-card flex flex-col justify-between p-5 transition hover:-translate-y-0.5 hover:border-[#D8D2FF]">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#EFECFF] font-bold text-[#6550DB]">{icon}</span>
        <span className="font-serif text-2xl font-bold">{detail}</span>
      </div>
      <div className="mt-5">
        <h3 className="text-sm font-extrabold">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted">{sub}</p>
        <span className="mt-4 block text-xs font-bold text-gold">{cta} →</span>
      </div>
    </Link>
  );
}
