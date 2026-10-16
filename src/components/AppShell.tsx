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
  type NavigationSection,
} from "@/lib/navigation";
import { breadcrumbsForPath, routePageTitle } from "@/lib/routeMeta";

export type LexoraTheme = "saas" | "editorial" | "dark";
export type LexoraLocale = "vi" | "en" | "zh";

type Tab = { href: string; label: string };

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
  displayName = "Lexora Scholar",
  roleLabel = "Học sinh",
  tabs = [],
  mode = "student",
  children,
  navigationSections,
  adminProfileLabel,
  streakDays = 14,
  isPro = false,
}: {
  displayName?: string;
  roleLabel?: string;
  tabs?: Tab[];
  mode?: "student" | "admin";
  children: React.ReactNode;
  navigationSections?: NavigationSection[];
  adminProfileLabel?: string;
  streakDays?: number;
  isPro?: boolean;
}) {
  const pathname = usePathname() || "/dashboard";
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [theme, setTheme] = useState<LexoraTheme>("saas");
  const [locale, setLocale] = useState<LexoraLocale>("vi");
  const [liveStreak, setLiveStreak] = useState<number>(streakDays);

  const isAdminUser = roleLabel === "Admin";
  const isAdminMode = mode === "admin";
  const sections = isAdminMode
    ? navigationSections ?? ADMIN_NAV_SECTIONS
    : [{ items: STUDENT_PRIMARY_NAV }];
  const items = sections.flatMap((section) => section.items);
  const adminPageAllowed =
    !isAdminMode ||
    items.some((item) =>
      item.href === "/admin"
        ? pathname === "/admin"
        : pathname === item.href || pathname.startsWith(item.href + "/"),
    );

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("lexora-b2c-theme") as LexoraTheme | null;
      if (savedTheme === "saas" || savedTheme === "editorial" || savedTheme === "dark") {
        setTheme(savedTheme);
        document.documentElement.setAttribute("data-theme", savedTheme);
        document.documentElement.classList.toggle("theme-dark", savedTheme === "dark");
      }
      const savedLocale = localStorage.getItem("lexora-b2c-locale") as LexoraLocale | null;
      if (savedLocale === "vi" || savedLocale === "en" || savedLocale === "zh") {
        setLocale(savedLocale);
      }
    } catch {
      // localStorage optional
    }
  }, []);

  useEffect(() => {
    if (isAdminMode) return;
    fetch("/api/goals")
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => {
        if (typeof g?.streak === "number") setLiveStreak(g.streak);
      })
      .catch(() => undefined);
  }, [isAdminMode]);

  const handleThemeChange = (nextTheme: LexoraTheme) => {
    setTheme(nextTheme);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", nextTheme);
      document.documentElement.classList.toggle("theme-dark", nextTheme === "dark");
    }
    try {
      localStorage.setItem("lexora-b2c-theme", nextTheme);
    } catch {
      // ignore
    }
  };

  const handleLocaleChange = (nextLocale: LexoraLocale) => {
    setLocale(nextLocale);
    try {
      localStorage.setItem("lexora-b2c-locale", nextLocale);
    } catch {
      // ignore
    }
  };

  function active(item: NavigationItem) {
    if (item.href === "/admin") return pathname === "/admin";
    if (item.matchPrefixes?.length) {
      return item.matchPrefixes.some(
        (prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`),
      );
    }
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

  const breadcrumb = useMemo(() => routePageTitle(pathname), [pathname]);
  const crumbStack = useMemo(() => breadcrumbsForPath(pathname), [pathname]);

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
                title={item.defaultLabel || item.label}
                className={`lexora-nav-item group ${active(item) ? "lexora-nav-active" : ""} ${mobile ? "!px-3" : ""}`}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[0.9rem] font-bold"
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
                <span className="truncate md:hidden lg:block">
                  {item.defaultLabel || item.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  const home = isAdminMode ? "/admin" : "/dashboard";
  const isFillSessionPage = !isAdminMode && pathname.startsWith("/quiz/");

  return (
    <div className="min-h-screen bg-paper text-ink">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[88px] flex-col border-r border-line bg-white px-3 py-5 md:flex lg:w-[264px] lg:px-5">
        <Link href={home} className="mb-8 flex h-11 items-center gap-3 px-2">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-gold text-lg font-extrabold text-white"
            style={{ backgroundColor: "var(--accent-primary, rgb(var(--color-gold)))" }}
          >
            L
          </span>
          <span className="hidden lg:block">
            <span className="flex items-center gap-1.5">
              <b className="text-base tracking-tight">Lexora</b>
              <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-600">
                Global
              </span>
            </span>
            <small className="block text-muted">
              {isAdminMode ? "CMS Nội bộ" : "Personal B2C Scholar"}
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
              {isAdminMode ? adminProfileLabel || "Quản trị viên" : isPro ? "Pro Scholar" : "Personal Learner"}
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
            className="relative flex h-full w-72 flex-col bg-white p-5 shadow-2xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <b className="text-base">Lexora Global</b>
              <button className="rounded-lg border border-line px-2.5 py-1 text-xs" onClick={() => setDrawerOpen(false)}>
                Đóng
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{navigation(true)}</div>
          </aside>
        </div>
      )}
      <div className={isFillSessionPage ? "flex h-dvh flex-col overflow-hidden md:pl-[88px] lg:pl-[264px]" : "md:pl-[88px] lg:pl-[264px]"}>
        <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-paper/90 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-sm font-bold md:hidden"
                aria-label="Mở menu"
              >
                ☰
              </button>
              <div className="min-w-0">
                {crumbStack.length > 1 ? (
                  <nav aria-label="Đường dẫn" className="flex items-center gap-1.5 truncate text-xs text-muted">
                    {crumbStack.map((c, idx) => (
                      <span key={c.href} className="flex items-center gap-1.5 truncate">
                        {idx > 0 && <span aria-hidden="true">›</span>}
                        {idx === crumbStack.length - 1 ? (
                          <b className="truncate font-bold text-ink">{c.label}</b>
                        ) : (
                          <Link href={c.href} className="truncate hover:text-ink">
                            {c.label}
                          </Link>
                        )}
                      </span>
                    ))}
                  </nav>
                ) : (
                  <b className="block truncate text-sm font-extrabold text-ink">{breadcrumb || "Lexora Global"}</b>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              {!isAdminMode && (
                <>
                  {/* Streak Pill */}
                  <div className="hidden items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 sm:flex">
                    <span>🔥</span>
                    <span>{liveStreak} ngày</span>
                  </div>

                  {/* Locale Switcher */}
                  <select
                    value={locale}
                    onChange={(e) => handleLocaleChange(e.target.value as LexoraLocale)}
                    aria-label="Chọn ngôn ngữ"
                    className="h-9 rounded-lg border border-line bg-white px-2.5 text-xs font-semibold text-ink focus:outline-none"
                  >
                    <option value="vi">🇻🇳 VI</option>
                    <option value="en">🇬🇧 EN</option>
                    <option value="zh">🇨🇳 ZH</option>
                  </select>

                  {/* Theme Switcher */}
                  <div className="hidden items-center rounded-lg border border-line bg-white p-0.5 sm:flex">
                    {(["saas", "editorial", "dark"] as LexoraTheme[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleThemeChange(t)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition-all ${
                          theme === t ? "bg-indigo-600 text-white shadow-xs" : "text-muted hover:text-ink"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {/* Upgrade Pro CTA */}
                  {!isPro && (
                    <Link
                      href="/settings"
                      className="hidden rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:opacity-95 md:inline-flex"
                    >
                      ✦ Upgrade Pro
                    </Link>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => setQuickOpen(true)}
                className="hidden h-10 items-center gap-3 rounded-xl border border-line bg-white px-3.5 text-xs text-muted hover:border-ink/25 sm:flex"
              >
                <span>Tìm nhanh...</span>
                <kbd className="rounded-md bg-paper-2 px-1.5 py-0.5 text-[0.68rem] font-bold text-ink">Ctrl K</kbd>
              </button>
              {!isAdminMode && (
                <>
                  <PomodoroTimer />
                  <AssignmentReminder />
                </>
              )}
              <AccountMenu
                displayName={displayName}
                roleLabel={isAdminMode ? adminProfileLabel || roleLabel : isPro ? "Pro Scholar" : "Personal Scholar"}
                isAdmin={isAdminUser}
                adminMode={isAdminMode}
                loggingOut={loggingOut}
                onLogout={logout}
              />
            </div>
          </div>
          {tabs.length > 0 && (
            <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-3 md:px-6">
              {tabs.map((tab) => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    pathname === tab.href ? "bg-gold text-white" : "border border-line bg-white text-muted"
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          )}
        </header>
        <main
          className={
            isFillSessionPage
              ? "mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden px-4 py-3 md:px-6"
              : "mx-auto max-w-6xl px-4 py-6 pb-24 md:px-6 md:py-8 md:pb-12"
          }
        >
          {adminPageAllowed ? (
            children
          ) : (
            <div className="rounded-[22px] border border-line bg-white p-6 text-sm text-muted">
              Tài khoản quản trị hiện tại không có quyền mở mục này.
            </div>
          )}
        </main>
      </div>
      <nav
        aria-label="Điều hướng di động"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-white/95 px-2 py-1.5 backdrop-blur-md md:hidden"
      >
        {(isAdminMode ? items.slice(0, 4) : STUDENT_PRIMARY_NAV).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[0.68rem] font-bold ${
              active(item) ? "text-gold" : "text-muted"
            }`}
          >
            <span className="text-sm leading-none">{item.icon}</span>
            <span className="truncate">{item.defaultLabel || item.label}</span>
          </Link>
        ))}
      </nav>
      <QuickSwitcher open={quickOpen} onClose={() => setQuickOpen(false)} mode={mode} tabs={items} />
    </div>
  );
}
