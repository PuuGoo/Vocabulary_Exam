"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "LX";
}

function MenuLink({ href, icon, title, description, onClick }: {
  href: string;
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="group flex min-h-14 items-center gap-3 rounded-[14px] px-3 py-2.5 transition hover:bg-[#F6F4FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-[#E5E1FF] bg-[#F3F0FF] text-sm font-bold text-[#6550DB] transition group-hover:border-[#D3CBFF]" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-[0.78rem] text-ink">{title}</b>
        <span className="mt-0.5 block truncate text-[0.67rem] text-muted">{description}</span>
      </span>
      <span className="text-sm text-[#B0ADBD] transition group-hover:translate-x-0.5 group-hover:text-gold" aria-hidden="true">›</span>
    </Link>
  );
}

export default function AccountMenu({ displayName, roleLabel, isAdmin, loggingOut, onLogout }: {
  displayName: string;
  roleLabel: string;
  isAdmin: boolean;
  loggingOut: boolean;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const accountLabel = isAdmin ? "Quản trị viên" : "Học viên IELTS";
  const inAdmin = pathname.startsWith("/admin");

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative ml-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Mở menu tài khoản của ${displayName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`group flex h-11 items-center gap-2 rounded-full border bg-white p-1 pr-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 sm:pr-2 ${open ? "border-[#CFC7FF] shadow-[0_8px_24px_rgba(36,35,55,0.12)]" : "border-transparent hover:border-line hover:shadow-sm"}`}
      >
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ECE9FF] text-xs font-extrabold text-[#6550DB]">
          {initials(displayName)}
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#36B37E]" aria-label="Đang hoạt động" />
        </span>
        <span className="hidden max-w-28 truncate text-left text-[0.72rem] font-bold text-ink xl:block">{displayName}</span>
        <span className={`hidden text-[0.65rem] text-muted transition-transform sm:block ${open ? "rotate-180" : ""}`} aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Tài khoản cá nhân"
          className="lexora-account-menu fixed left-3 right-3 top-[68px] z-[70] overflow-hidden rounded-[18px] border border-line bg-white p-2 shadow-[0_20px_60px_rgba(36,35,55,0.18)] sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-[320px]"
        >
          <div className="rounded-[14px] bg-[#F4F1FF] p-3.5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-sm font-extrabold text-[#6550DB] shadow-sm">{initials(displayName)}</span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm text-ink">{displayName}</b>
                <span className="mt-0.5 flex items-center gap-1.5 text-[0.68rem] text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#36B37E]" />{accountLabel}
                </span>
              </span>
              <span className="rounded-full border border-[#DCD6FF] bg-white px-2 py-1 text-[0.6rem] font-bold uppercase tracking-wide text-[#6550DB]">{roleLabel}</span>
            </div>
          </div>

          <div className="mt-1">
            <MenuLink href="/settings" icon="♙" title="Thông tin và bảo mật" description="Email khôi phục, đổi mật khẩu" onClick={() => setOpen(false)} />
            <MenuLink href="/progress" icon="↗" title="Tiến độ học tập" description="Xem kết quả và mục tiêu của bạn" onClick={() => setOpen(false)} />
            <MenuLink href="/history" icon="◷" title="Lịch sử học tập" description="Xem lại những hoạt động gần đây" onClick={() => setOpen(false)} />
            {isAdmin && (
              <MenuLink
                href={inAdmin ? "/dashboard" : "/admin"}
                icon={inAdmin ? "A" : "⚙"}
                title={inAdmin ? "Chuyển sang học tập" : "Mở khu quản trị"}
                description={inAdmin ? "Học với quyền học viên" : "Quản lý nội dung và học viên"}
                onClick={() => setOpen(false)}
              />
            )}
          </div>

          <div className="my-1 border-t border-line" />
          <div className="flex min-h-12 items-center justify-between rounded-[13px] px-3 text-[0.75rem] font-semibold text-ink">
            <span>Giao diện</span>
            <ThemeToggle />
          </div>
          <button
            type="button"
            role="menuitem"
            disabled={loggingOut}
            onClick={() => { setOpen(false); onLogout(); }}
            className="flex min-h-12 w-full items-center gap-3 rounded-[13px] px-3 text-left text-[0.76rem] font-bold text-[#C34F5F] transition hover:bg-[#FFF3F4] disabled:cursor-wait disabled:opacity-60"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#FFF0F2]" aria-hidden="true">↪</span>
            {loggingOut ? "Đang đăng xuất..." : "Đăng xuất"}
          </button>
        </div>
      )}
    </div>
  );
}
