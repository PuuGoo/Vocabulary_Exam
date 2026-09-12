"use client";

import { skillLabel, type WordSkill } from "@/lib/wordSkills";

export type SkillMasteryEntry = {
  mastery: number | null;
  attempts: number;
  sufficientEvidence: boolean;
};

export type SkillMasteryData = {
  overall: number | null;
  bySkill: Partial<Record<WordSkill, SkillMasteryEntry>>;
};

function tone(mastery: number | null) {
  if (mastery === null) return "border-line bg-[#F7F7FB] text-muted";
  if (mastery < 60) return "border-[#F0CACA] bg-[#FFF6F6] text-[#A94747]";
  if (mastery < 85) return "border-[#F0E2C0] bg-[#FFFBF1] text-[#8A6A17]";
  return "border-[#B6DEC8] bg-[#EEFBF3] text-[#277A4B]";
}

/**
 * Compact per-dimension mastery. A dimension with too little evidence shows
 * "—" and the panel says "chưa đủ dữ liệu" instead of inventing a 0% score.
 */
export default function SkillMasteryPanel({ summary, className = "" }: { summary?: SkillMasteryData | null; className?: string }) {
  const entries = Object.entries(summary?.bySkill || {}) as Array<[WordSkill, SkillMasteryEntry]>;
  const proven = entries.filter(([, entry]) => entry.sufficientEvidence && entry.mastery !== null);

  if (!summary || (!proven.length && summary.overall === null)) {
    return (
      <p className={`text-xs text-muted ${className}`}>
        <span className="font-bold text-ink">Kỹ năng:</span> chưa đủ dữ liệu — hãy luyện thêm để Lexora đánh giá từng kỹ năng.
      </p>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted">Tổng thể</span>
        {summary.overall === null
          ? <span className="text-xs text-muted">chưa đủ dữ liệu</span>
          : (
            <>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#ECEAF5]" role="img" aria-label={`Độ thành thạo tổng thể ${summary.overall}%`}>
                <div className="h-full rounded-full bg-[#6550DB]" style={{ width: `${summary.overall}%` }} />
              </div>
              <b className="text-xs text-ink">{summary.overall}%</b>
            </>
          )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {entries.map(([skill, entry]) => (
          <li
            key={skill}
            className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${tone(entry.sufficientEvidence ? entry.mastery : null)}`}
            title={entry.sufficientEvidence ? `${entry.attempts} lần luyện` : "Chưa đủ dữ liệu"}
          >
            {skillLabel(skill)}: {entry.sufficientEvidence && entry.mastery !== null ? `${entry.mastery}` : "—"}
          </li>
        ))}
      </ul>
    </div>
  );
}
