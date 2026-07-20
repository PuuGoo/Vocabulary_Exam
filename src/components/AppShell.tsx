"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "@/components/Toast";
import QuickSwitcher from "@/components/QuickSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import AssignmentReminder from "@/components/AssignmentReminder";

type Tab = { href: string; label: string };

export default function AppShell({
  displayName,
  roleLabel,
  tabs,
  children,
}: {
  displayName: string;
  roleLabel: string;
  tabs: Tab[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setQuickSwitcherOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("logout failed");
      router.push("/login");
      router.refresh();
    } catch {
      toast("Không thể đăng xuất. Vui lòng thử lại.");
      setLoggingOut(false);
    }
  }

  return (
    <div className="max-w-[1080px] mx-auto px-3 sm:px-4 pt-3 sm:pt-[18px] pb-[60px]">
      <div className="flex items-center justify-between gap-2 bg-ink text-goldpale rounded px-3 sm:px-5 py-3 sm:py-3.5 mb-4 sm:mb-5 relative overflow-hidden print:hidden">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <div className="w-9 h-9 sm:w-[38px] sm:h-[38px] rounded-full border-2 border-gold flex items-center justify-center font-serif font-bold text-gold shrink-0">
            IV
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-serif text-[1rem] sm:text-[1.15rem] tracking-wide text-white">IELTS Vocab Check</h1>
            <div className="hidden md:block text-[0.72rem] text-goldpale/80 tracking-wide">
              Hệ thống kiểm tra từ vựng luyện thi IELTS
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5 text-[0.85rem]">
          <span className="hidden lg:inline max-w-36 truncate">{displayName}</span>
          <span className="hidden sm:inline bg-gold text-ink px-2.5 py-0.5 rounded-full text-[0.7rem] font-bold uppercase tracking-wide">
            {roleLabel}
          </span>
          <button
            type="button"
            onClick={() => setQuickSwitcherOpen(true)}
            aria-label="Chuyển nhanh đến chức năng hoặc bộ từ"
            title="Chuyển nhanh (Ctrl + K)"
            className="bg-transparent border border-goldpale/40 text-goldpale px-2.5 sm:px-3 py-1.5 rounded-md text-[0.8rem] hover:border-gold hover:text-gold"
          >
            <span aria-hidden="true">⌕</span><span className="hidden md:inline"> Chuyển nhanh </span><kbd className="hidden lg:inline rounded border border-goldpale/30 px-1 text-[0.65rem]">Ctrl K</kbd>
          </button>
          <AssignmentReminder />
          <ThemeToggle />
          <Link
            href="/settings"
            aria-label="Cài đặt"
            title="Cài đặt"
            className="bg-transparent border border-goldpale/40 text-goldpale px-2.5 sm:px-3 py-1.5 rounded-md text-[0.8rem] hover:border-gold hover:text-gold"
          >
            <span aria-hidden="true">⚙</span><span className="hidden md:inline"> Cài đặt</span>
          </Link>
          <button
            onClick={logout}
            disabled={loggingOut}
            aria-label="Đăng xuất"
            title="Đăng xuất"
            className="bg-transparent border border-goldpale/40 text-goldpale px-2.5 sm:px-3 py-1.5 rounded-md text-[0.8rem] hover:border-gold hover:text-gold disabled:opacity-60"
          >
            <span aria-hidden="true">↪</span><span className="hidden md:inline"> {loggingOut ? "Đang thoát..." : "Đăng xuất"}</span>
          </button>
        </div>
      </div>

      <nav aria-label="Điều hướng chính" className="-mx-1 mb-4 sm:mb-5 flex flex-nowrap gap-1.5 overflow-x-auto px-1 pb-1.5 print:hidden">
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 px-4 py-2 rounded-full text-[0.85rem] border ${
                active
                  ? "bg-ink text-goldpale border-ink"
                  : "bg-panel text-inksoft border-line hover:border-gold"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {children}
      <QuickSwitcher open={quickSwitcherOpen} onClose={() => setQuickSwitcherOpen(false)} tabs={tabs} />
    </div>
  );
}
