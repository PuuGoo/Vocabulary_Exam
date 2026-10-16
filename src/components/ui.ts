export const cx = {
  panel:
    "bg-panel/95 backdrop-blur-sm border border-line/90 rounded-[20px] p-5 sm:p-6 mb-4 shadow-[0_10px_30px_-10px_rgba(36,35,55,0.06)] transition-all duration-200",
  h2: "font-serif text-[1.25rem] font-extrabold tracking-[-0.025em] mb-1 text-ink",
  desc: "text-muted text-[0.86rem] leading-relaxed mb-4",
  label: "text-[0.74rem] font-bold uppercase text-muted block mb-1.5 tracking-[0.06em]",
  input:
    "w-full px-4 py-2.5 border border-line rounded-[13px] text-[0.95rem] font-medium text-ink bg-panel mb-3 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-200 focus:border-gold focus:shadow-[0_0_0_4px_rgb(var(--color-gold)/0.14)] placeholder:text-muted/70 outline-none",
  btn: "min-h-11 px-4 py-2.5 rounded-[13px] text-[0.85rem] cursor-pointer font-bold tracking-[-0.01em] inline-flex items-center justify-center gap-2 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0",
  btnDark: "bg-ink text-white shadow-[0_8px_20px_-6px_rgba(15,23,42,0.35)] hover:opacity-95",
  btnGold:
    "bg-gold text-white font-bold shadow-[0_10px_24px_-6px_rgb(var(--color-gold)/0.42)] hover:bg-golddark hover:shadow-[0_14px_28px_-6px_rgb(var(--color-gold)/0.52)]",
  btnGhost:
    "bg-panel/80 border border-line text-ink hover:border-gold/50 hover:bg-goldpale/40 hover:text-golddark",
  btnDanger: "bg-badbg/50 border border-bad/30 text-bad hover:bg-badbg",
  table: "w-full border-collapse text-[0.95rem]",
  th: "text-left px-3.5 py-3 border-b border-line text-muted font-bold text-[0.75rem] uppercase tracking-[0.08em]",
  td: "text-left px-3.5 py-3.5 border-b border-line/70",
  empty: "text-center py-10 px-4 text-muted text-[0.92rem]",
  badgeBlue:
    "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[0.7rem] font-bold bg-[#e4ecf3] text-[#2b4a6b]",
  badgeGold:
    "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[0.7rem] font-bold bg-goldpale text-golddark",
  errMsg: "text-bad text-[0.82rem] font-medium mb-3",
  setcard:
    "border border-line rounded-[18px] px-4 py-4 mb-3 flex justify-between items-center gap-3 flex-wrap bg-panel shadow-[0_6px_20px_-6px_rgba(43,39,74,0.05)] hover:border-gold/35 transition-all duration-200",
};
