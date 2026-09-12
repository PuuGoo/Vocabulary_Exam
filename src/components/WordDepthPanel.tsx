"use client";

import { useState } from "react";

/**
 * Progressive disclosure for the deeper vocabulary dimensions (§45–46): the
 * learner attempts recall first, then reveals collocations / patterns / topics
 * one layer at a time instead of seeing everything at once.
 */

export type WordDepthContent = {
  /** `id` is optional because shared (guest) payloads carry content inline. */
  collocations?: Array<{ id?: number; phrase: string; meaning?: string | null; example?: string | null; register?: string | null }>;
  patterns?: Array<{ id?: number; pattern: string; meaning?: string | null; example?: string | null }>;
  topics?: string[];
  families?: Array<{ id?: number; label: string; members: Array<{ wordId: number; term: string | null; meaning: string; relation: string | null }> }>;
  pronunciations?: Array<{ id?: number; ipa: string; partOfSpeech?: string | null; sense?: string | null; locale?: string; isPrimary?: boolean }>;
};

type Layer = "collocations" | "patterns" | "context";

const LAYER_LABELS: Record<Layer, string> = {
  collocations: "Hiện collocation",
  patterns: "Hiện cấu trúc",
  context: "Hiện chủ đề & họ từ",
};

export default function WordDepthPanel({ content, className = "" }: { content?: WordDepthContent | null; className?: string }) {
  const [revealed, setRevealed] = useState<Record<Layer, boolean>>({ collocations: false, patterns: false, context: false });
  const collocations = content?.collocations || [];
  const patterns = content?.patterns || [];
  const topics = content?.topics || [];
  const families = content?.families || [];
  const pronunciations = content?.pronunciations || [];
  const layers = ([
    ["collocations", collocations.length > 0],
    ["patterns", patterns.length > 0],
    ["context", topics.length > 0 || families.length > 0 || pronunciations.length > 1],
  ] as Array<[Layer, boolean]>).filter(([, available]) => available);

  if (!layers.length) return null;
  const reveal = (layer: Layer) => setRevealed((current) => ({ ...current, [layer]: true }));

  return (
    <div className={`mt-4 w-full max-w-xl space-y-2 text-left ${className}`}>
      {pronunciations.length > 1 && (
        <div className="rounded-xl border border-[#EBEAF2] bg-[#FBFAFE] p-3 text-xs">
          <p className="font-bold uppercase tracking-wide text-muted">Phát âm theo từ loại (UK)</p>
          <ul className="mt-1 space-y-0.5">
            {pronunciations.map((item, index) => (
              <li key={item.id ?? `${item.ipa}-${index}`}>
                {item.partOfSpeech ? <span className="font-semibold text-ink">{item.partOfSpeech}:</span> : null}{" "}
                <span className="text-[#765FD5]">{item.ipa}</span>
                {item.sense ? <span className="text-muted"> · {item.sense}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {layers.map(([layer]) => revealed[layer] ? null : (
          <button
            key={layer}
            type="button"
            onClick={() => reveal(layer)}
            aria-expanded={false}
            className="min-h-9 rounded-lg border border-[#DCD8F3] bg-white px-3 text-xs font-bold text-[#6550DB] transition hover:bg-[#F0EDFF]"
          >
            {LAYER_LABELS[layer]}
          </button>
        ))}
      </div>

      {revealed.collocations && collocations.length > 0 && (
        <div className="rounded-xl border border-[#EBEAF2] bg-white p-3 text-xs">
          <p className="font-bold uppercase tracking-wide text-muted">Collocation</p>
          <ul className="mt-1 space-y-1">
            {collocations.map((item, index) => (
              <li key={item.id ?? `${item.phrase}-${index}`}>
                <span className="font-semibold text-ink">{item.phrase}</span>
                {item.meaning ? <span className="text-muted"> — {item.meaning}</span> : null}
                {item.register ? <span className="ml-1 rounded bg-[#F0EDFF] px-1.5 py-0.5 text-[0.62rem] font-bold text-[#6550DB]">{item.register}</span> : null}
                {item.example ? <span className="mt-0.5 block italic text-muted">“{item.example}”</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {revealed.patterns && patterns.length > 0 && (
        <div className="rounded-xl border border-[#EBEAF2] bg-white p-3 text-xs">
          <p className="font-bold uppercase tracking-wide text-muted">Cấu trúc</p>
          <ul className="mt-1 space-y-1">
            {patterns.map((item, index) => (
              <li key={item.id ?? `${item.pattern}-${index}`}>
                <span className="font-mono font-semibold text-ink">{item.pattern}</span>
                {item.meaning ? <span className="text-muted"> — {item.meaning}</span> : null}
                {item.example ? <span className="mt-0.5 block italic text-muted">“{item.example}”</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {revealed.context && (
        <div className="rounded-xl border border-[#EBEAF2] bg-white p-3 text-xs">
          {topics.length > 0 && (
            <p className="text-muted">
              <span className="font-bold uppercase tracking-wide">Chủ đề:</span>{" "}
              {topics.map((topic) => (
                <span key={topic} className="mr-1 inline-block rounded bg-[#F0EDFF] px-1.5 py-0.5 font-semibold text-[#6550DB]">{topic}</span>
              ))}
            </p>
          )}
          {families.map((family, index) => (
            <p key={family.id ?? `${family.label}-${index}`} className="mt-1 text-muted">
              <span className="font-bold uppercase tracking-wide">Họ từ ({family.label}):</span>{" "}
              {family.members.map((member) => member.term || member.meaning).filter(Boolean).join(", ")}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
