"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/Toast";
import QuickSwitcher from "@/components/QuickSwitcher";
import AssignmentReminder from "@/components/AssignmentReminder";
import PomodoroTimer from "@/components/PomodoroTimer";
import AccountMenu from "@/components/AccountMenu";
import {
  ADMIN_NAV_SECTIONS,
  STUDENT_PRIMARY_NAV,
  type NavigationItem,
} from "@/lib/navigation";

type Tab = { href: string; label: string };
const names: Record<string, string> = {
  dashboard: "Tổng quan",
  study: "Học & luyện",
  assignments: "Bài tập",
  "vocabulary-vault": "Kho từ vựng",
  progress: "Tiến độ",
  admin: "Khu quản trị",
  sets: "Bộ từ & câu hỏi",
  users: "Người dùng",
  classes: "Lớp học",
  results: "Kết quả",
  import: "Nhập dữ liệu",
  backup: "Sao lưu dữ liệu",
  "smart-review": "Smart Review",
  history: "Lịch sử học tập",
};
const studyPaths = [
  "/learn/",
  "/quiz/",
  "/match/",
  "/dictation/",
  "/listen/",
  "/pronunciation/",
  "/sentence/",
];
function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(-2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "LX"
  );
}

export default function AppShell({
  displayName,
  roleLabel,
  tabs,
  mode,
  children,
}: {
  displayName: string;
  roleLabel: string;
  tabs: Tab[];
  mode: "student" | "admin";
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isAdminUser = roleLabel === "Admin";
  const isAdminMode = mode === "admin";
  const sections = isAdminMode
    ? ADMIN_NAV_SECTIONS
    : [{ items: STUDENT_PRIMARY_NAV }];
  const items = sections.flatMap((section) => section.items);
  function active(item: NavigationItem) {
    if (item.href === "/admin") return pathname === "/admin";
    if (item.href === "/study")
      return (
        pathname === "/study" || studyPaths.some((p) => pathname.startsWith(p))
      );
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }
  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuickOpen((v) => !v);
      }
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const breadcrumb = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const current = parts.at(-1) || "dashboard";
    return names[current] || names[parts[0]] || current.replaceAll("-", " ");
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
    <nav aria-label="Điều hướng chính" className="space-y-5">
      {sections.map((section, index) => (
        <div key={section.label || index}>
          {section.label && (
            <p className="mb-2 hidden px-3 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted lg:block">
              {section.label}
            </p>
          )}
          <div className="space-y-1">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active(item) ? "page" : undefined}
                title={item.label}
                className={`lexora-nav-item group ${active(item) ? "lexora-nav-active" : ""} ${mobile ? "!px-3" : ""}`}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[0.9rem] font-bold"
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
                <span className="truncate md:hidden lg:block">
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
  const home = isAdminMode ? "/admin" : "/dashboard";
  return (
    <div className="min-h-screen bg-paper text-ink">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[88px] flex-col border-r border-line bg-white px-3 py-5 md:flex lg:w-[264px] lg:px-5">
        <Link href={home} className="mb-8 flex h-11 items-center gap-3 px-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-gold text-lg font-extrabold text-white">
            L
          </span>
          <span className="hidden lg:block">
            <b className="block">Lexora</b>
            <small className="text-muted">
              {isAdminMode ? "Khu quản trị" : "IELTS Academy"}
            </small>
          </span>
        </Link>
        <div className="flex-1 overflow-y-auto">{navigation()}</div>
        <div className="flex items-center gap-3 border-t border-line pt-4 lg:px-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ECE9FF] text-xs font-bold text-[#6550DB]">
            {initials(displayName)}
          </div>
          <div className="hidden min-w-0 lg:block">
            <b className="block truncate text-xs">{displayName}</b>
            <span className="text-[0.68rem] text-muted">
              {isAdminUser ? "Quản trị viên" : "Học viên IELTS"}
            </span>
          </div>
        </div>
      </aside>
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 bg-[#242337]/35"
            aria-label="Đóng menu"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu điều hướng"
            className="lexora-drawer absolute inset-y-0 left-0 w-[min(86vw,320px)] overflow-y-auto bg-white p-5 shadow-2xl"
          >
            <div className="mb-7 flex items-center justify-between">
              <Link href={home} className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-gold font-extrabold text-white">
                  L
                </span>
                <b>Lexora</b>
              </Link>
              <button
                onClick={() => setDrawerOpen(false)}
                className="h-10 w-10 rounded-full border border-line"
                aria-label="Đóng menu"
              >
                ×
              </button>
            </div>
            {navigation(true)}
          </aside>
        </div>
      )}
      <div className="min-w-0 md:pl-[88px] lg:pl-[264px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur-md sm:px-6 lg:px-8 print:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-line md:hidden"
              aria-label="Mở menu"
            >
              ☰
            </button>
            <div className="min-w-0">
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">
                {isAdminMode ? "Khu quản trị" : "Học viện Lexora"}
              </div>
              <div className="truncate text-sm font-bold">{breadcrumb}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              className="hidden h-10 items-center gap-2 rounded-[12px] border border-line bg-[#FBFAFE] px-3 text-xs text-muted hover:text-ink sm:flex"
            >
              <span>⌕</span>
              <span>Tìm nhanh</span>
              <kbd className="rounded-md bg-[#EFEDF6] px-1.5 py-0.5 text-[0.62rem]">
                ⌘ K
              </kbd>
            </button>
            {!isAdminMode && (
              <>
                <PomodoroTimer />
                <AssignmentReminder />
              </>
            )}
            <AccountMenu
              displayName={displayName}
              roleLabel={roleLabel}
              isAdmin={isAdminUser}
              adminMode={isAdminMode}
              loggingOut={loggingOut}
              onLogout={logout}
            />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1536px] p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-24 lg:p-8 lg:pb-8">
          {children}
        </main>
      </div>
      {!isAdminMode && (
        <nav
          aria-label="Điều hướng nhanh trên điện thoại"
          className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-[18px] border border-line bg-white/95 p-1.5 shadow-[0_14px_40px_rgba(36,35,55,0.16)] backdrop-blur-md md:hidden"
        >
          {STUDENT_PRIMARY_NAV.slice(0, 4).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active(item) ? "page" : undefined}
              className={`flex min-h-12 flex-col items-center justify-center rounded-[13px] px-1 text-[0.63rem] font-bold ${active(item) ? "bg-goldpale text-golddark" : "text-muted"}`}
            >
              <span className="text-base" aria-hidden="true">
                {item.icon}
              </span>
              <span>
                {item.href === "/study"
                  ? "Học"
                  : item.href === "/vocabulary-vault"
                    ? "Kho từ"
                    : item.label}
              </span>
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            aria-haspopup="dialog"
            className="flex min-h-12 flex-col items-center justify-center rounded-[13px] text-[0.63rem] font-bold text-muted"
          >
            <span className="text-base">•••</span>
            <span>Thêm</span>
          </button>
        </nav>
      )}
      <QuickSwitcher
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        tabs={tabs}
      />
    </div>
  );
}
