"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="max-w-[1080px] mx-auto px-4 pt-[18px] pb-[60px]">
      <div className="flex items-center justify-between bg-ink text-goldpale rounded px-5 py-3.5 mb-5 relative overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="w-[38px] h-[38px] rounded-full border-2 border-gold flex items-center justify-center font-serif font-bold text-gold shrink-0">
            IV
          </div>
          <div>
            <h1 className="font-serif text-[1.15rem] tracking-wide text-white">IELTS Vocab Check</h1>
            <div className="text-[0.72rem] text-goldpale/80 tracking-wide">
              Hệ thống kiểm tra từ vựng luyện thi IELTS
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 text-[0.85rem]">
          <span>{displayName}</span>
          <span className="bg-gold text-ink px-2.5 py-0.5 rounded-full text-[0.7rem] font-bold uppercase tracking-wide">
            {roleLabel}
          </span>
          <button
            onClick={logout}
            className="bg-transparent border border-goldpale/40 text-goldpale px-3 py-1.5 rounded-md text-[0.8rem] hover:border-gold hover:text-gold"
          >
            Đăng xuất
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-5">
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`px-4 py-2 rounded-full text-[0.85rem] border ${
                active
                  ? "bg-ink text-goldpale border-ink"
                  : "bg-panel text-inksoft border-line hover:border-gold"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
