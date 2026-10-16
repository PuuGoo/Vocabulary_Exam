import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import SettingsForm from "./SettingsForm";
import Link from "next/link";
import ToastHost from "@/components/Toast";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const homeHref = session.role === "admin" ? "/admin" : "/dashboard";

  return (
    <div className="min-h-screen bg-paper text-ink py-8 px-4 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="lexora-bento p-6 sm:p-7">
          <Link
            href={homeHref}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-xs font-bold text-golddark transition hover:border-gold/40"
          >
            ← Quay lại không gian chính
          </Link>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-[0.15em] text-gold">
                Personal Scholar Account
              </span>
              <h1 className="mt-1 font-serif text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">
                Cài đặt tài khoản &amp; Bảo mật
              </h1>
              <p className="mt-1 text-sm text-muted">
                Quản lý email khôi phục, mật khẩu đăng nhập và tùy chọn cá nhân của {session.displayName}.
              </p>
            </div>
            <span className="rounded-2xl border border-gold/25 bg-goldpale px-3.5 py-2 text-xs font-extrabold text-golddark">
              ✦ {session.role === "admin" ? "Admin Scholar" : "Personal Scholar"}
            </span>
          </div>
        </header>

        <SettingsForm />
        <ToastHost />
      </div>
    </div>
  );
}
