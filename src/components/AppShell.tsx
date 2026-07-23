"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/Toast";
import QuickSwitcher from "@/components/QuickSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import AssignmentReminder from "@/components/AssignmentReminder";
import PomodoroTimer from "@/components/PomodoroTimer";

type Tab = { href: string; label: string };
type NavItem = { href: string; label: string; icon: string; admin?: boolean };

const primaryNav: NavItem[] = [
  { href: "/dashboard", label: "Tổng quan", icon: "⌂" },
  { href: "/study", label: "Học tập của tôi", icon: "▤" },
  { href: "/mixed-practice", label: "Phòng luyện tập", icon: "◎" },
  { href: "/assignments", label: "Bài thi thử", icon: "◇" },
  { href: "/vocabulary-vault", label: "Kho từ vựng", icon: "Aa" },
  { href: "/admin", label: "Khu quản trị", icon: "⚙", admin: true },
];

const breadcrumbNames: Record<string, string> = {
  dashboard: "Tổng quan", study: "Học tập của tôi", "mixed-practice": "Phòng luyện tập",
  assignments: "Bài thi thử", "vocabulary-vault": "Kho từ vựng", admin: "Khu quản trị",
  sets: "Bộ từ vựng", users: "Học viên", classes: "Lớp học", progress: "Tiến độ",
  results: "Kết quả", import: "Nhập nội dung", notebook: "Sổ tay từ vựng",
  backup: "Sao lưu dữ liệu",
  "smart-review": "Ôn tập thông minh", feynman: "Phòng Feynman", history: "Lịch sử học tập",
};

const mobileNavLabels: Record<string, string> = {
  "/dashboard": "Tổng quan",
  "/study": "Học tập",
  "/mixed-practice": "Luyện tập",
  "/assignments": "Bài tập",
};
const mobileStudyPaths = ["/learn/", "/quiz/", "/match/", "/dictation/", "/listen/", "/pronunciation/", "/sentence/"];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toUpperCase()).join("") || "LX";
}

export default function AppShell({ displayName, roleLabel, tabs, children }: {
  displayName: string;
  roleLabel: string;
  tabs: Tab[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isAdmin = roleLabel === "Admin";
  const visibleNav = primaryNav.filter((item) => !item.admin || isAdmin);
  const mobileTabs = visibleNav.filter((item) => !item.admin).slice(0, 4);

  function isNavActive(item: NavItem) {
    if (item.href === "/admin") return pathname.startsWith("/admin");
    if (item.href === "/study") return pathname === "/study" || mobileStudyPaths.some((prefix) => pathname.startsWith(prefix));
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  useEffect(() => setMobileNavOpen(false), [pathname]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setQuickSwitcherOpen((value) => !value);
      }
      if (event.key === "Escape") setMobileNavOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const breadcrumb = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const current = parts.at(-1) || "dashboard";
    return breadcrumbNames[current] || breadcrumbNames[parts[0]] || current.replaceAll("-", " ");
  }, [pathname]);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      router.push("/login");
      router.refresh();
    } catch {
      toast("Không thể đăng xuất. Vui lòng thử lại.");
      setLoggingOut(false);
    }
  }

  const navigation = (mobile = false) => (
    <nav aria-label="Điều hướng chính" className="space-y-1.5">
      {visibleNav.map((item) => {
        const active = isNavActive(item);
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`lexora-nav-item group ${active ? "lexora-nav-active" : ""} ${mobile ? "!px-3" : ""}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[0.9rem] font-bold" aria-hidden="true">{item.icon}</span>
          <span className="truncate md:hidden lg:block">{item.label}</span>
        </Link>;
      })}
    </nav>
  );

  return <div className="min-h-screen bg-paper text-ink">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[88px] flex-col border-r border-line bg-white px-3 py-5 md:flex lg:w-[264px] lg:px-5">
      <Link href="/dashboard" className="mb-8 flex h-11 items-center gap-3 px-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-gold text-lg font-extrabold text-white shadow-[0_6px_18px_rgba(120,101,238,0.22)]">L</span>
        <span className="hidden min-w-0 lg:block"><b className="block text-[1.05rem] tracking-[-0.02em]">Lexora</b><span className="block text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted">IELTS Academy</span></span>
      </Link>
      <div className="flex-1">{navigation()}</div>
      <button type="button" onClick={() => setQuickSwitcherOpen(true)} className="mb-4 hidden w-full rounded-[16px] border border-[#E4E0FF] bg-[#F4F1FF] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#CFC7FF] lg:block">
        <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-[10px] bg-gold text-xs font-bold text-white">AI</span>
        <b className="block text-[0.82rem]">Hỏi trợ lý Lexi</b><span className="mt-1 block text-[0.7rem] leading-5 text-muted">Tìm bài học hoặc công cụ ngay lập tức.</span>
      </button>
      <div className="flex items-center gap-3 border-t border-line pt-4 lg:px-1"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ECE9FF] text-xs font-bold text-[#6550DB]">{initials(displayName)}</div><div className="hidden min-w-0 flex-1 lg:block"><b className="block truncate text-[0.78rem]">{displayName}</b><span className="text-[0.68rem] text-muted">{isAdmin ? "Quản trị viên" : "Học viên IELTS"}</span></div><div className="hidden lg:block"><ThemeToggle /></div></div>
    </aside>

    {mobileNavOpen && <div className="fixed inset-0 z-50 md:hidden"><button className="absolute inset-0 bg-[#242337]/35 backdrop-blur-sm" aria-label="Đóng menu" onClick={() => setMobileNavOpen(false)} /><aside className="lexora-drawer absolute inset-y-0 left-0 w-[min(86vw,320px)] bg-white p-5 shadow-2xl"><div className="mb-8 flex items-center justify-between"><Link href="/dashboard" className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-gold text-lg font-extrabold text-white">L</span><span><b className="block">Lexora</b><small className="text-muted">IELTS Academy</small></span></Link><button onClick={() => setMobileNavOpen(false)} className="h-10 w-10 rounded-full border border-line text-xl" aria-label="Đóng menu">×</button></div>{navigation(true)}<div className="absolute inset-x-5 bottom-5 flex items-center gap-3 border-t border-line pt-4"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ECE9FF] text-xs font-bold text-[#6550DB]">{initials(displayName)}</div><div className="min-w-0 flex-1"><b className="block truncate text-sm">{displayName}</b><span className="text-xs text-muted">{roleLabel}</span></div><button onClick={logout} className="text-xs font-semibold text-muted">Đăng xuất</button></div></aside></div>}

    <div className="min-w-0 md:pl-[88px] lg:pl-[264px]">
      <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur-md sm:px-6 lg:px-8 print:hidden">
        <div className="flex min-w-0 items-center gap-3"><button onClick={() => setMobileNavOpen(true)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-line md:hidden" aria-label="Mở menu"><span className="text-lg">☰</span></button><div className="min-w-0"><div className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">Học viện Lexora</div><div className="truncate text-sm font-bold capitalize sm:text-[0.95rem]">{breadcrumb}</div></div></div>
        <div className="flex items-center gap-2"><button type="button" onClick={() => setQuickSwitcherOpen(true)} className="hidden h-10 items-center gap-2 rounded-[12px] border border-line bg-[#FBFAFE] px-3 text-xs text-muted transition hover:border-[#CFC7FF] hover:text-ink sm:flex"><span>⌕</span><span>Tìm nhanh</span><kbd className="rounded-md bg-[#EFEDF6] px-1.5 py-0.5 text-[0.62rem]">⌘ K</kbd></button><PomodoroTimer /><AssignmentReminder /><Link href="/settings" className="hidden h-10 w-10 items-center justify-center rounded-[12px] border border-line text-muted transition hover:border-[#CFC7FF] hover:text-gold sm:flex" aria-label="Cài đặt">⚙</Link><div className="ml-1 flex h-10 w-10 items-center justify-center rounded-full bg-[#ECE9FF] text-xs font-extrabold text-[#6550DB] ring-2 ring-white">{initials(displayName)}</div></div>
      </header>
      <main className="mx-auto w-full max-w-[1536px] p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-24 lg:p-8 lg:pb-8">{children}</main>
    </div>
    <button onClick={logout} disabled={loggingOut} className="sr-only">{loggingOut ? "Đang đăng xuất" : "Đăng xuất"}</button>
    <nav aria-label="Điều hướng nhanh trên điện thoại" className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-[18px] border border-line bg-white/95 p-1.5 shadow-[0_14px_40px_rgba(36,35,55,0.16)] backdrop-blur-md md:hidden" style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}>
      {mobileTabs.map((item) => {
        const active = isNavActive(item);
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[13px] px-1 text-[0.65rem] font-bold transition-colors ${active ? "bg-goldpale text-golddark" : "text-muted hover:bg-[#F8F7FC]"}`}>
          <span className="text-base leading-5" aria-hidden="true">{item.icon}</span><span className="truncate">{mobileNavLabels[item.href] || item.label}</span>
        </Link>;
      })}
      <button type="button" onClick={() => setMobileNavOpen(true)} className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[13px] px-1 text-[0.65rem] font-bold transition-colors ${mobileNavOpen || pathname.startsWith("/admin") || pathname === "/vocabulary-vault" ? "bg-goldpale text-golddark" : "text-muted hover:bg-[#F8F7FC]"}`} aria-label="Mở thêm điều hướng">
        <span className="text-base leading-5" aria-hidden="true">•••</span><span>Thêm</span>
      </button>
    </nav>
    <QuickSwitcher open={quickSwitcherOpen} onClose={() => setQuickSwitcherOpen(false)} tabs={tabs} />
  </div>;
}
