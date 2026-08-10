import type { ReactNode } from "react";

export default function MobileThumbBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <>
    <div aria-hidden="true" className="h-[76px] md:hidden" />
    <div className={`lexora-mobile-thumb-bar fixed bottom-[calc(5.6rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 flex items-center justify-center gap-2 rounded-2xl border border-[#EBEAF2] bg-white/95 p-2 shadow-[0_12px_36px_rgba(36,35,55,0.16)] backdrop-blur-md [&>button]:min-h-12 [&>button]:flex-1 md:static md:mt-5 md:flex-wrap md:border-0 md:bg-transparent md:p-0 md:shadow-none md:[&>button]:flex-none ${className}`}>
      {children}
    </div>
  </>;
}
