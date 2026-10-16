"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cx } from "@/components/ui";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) return setError("Liên kết không hợp lệ.");
    if (password.length < 6) return setError("Mật khẩu tối thiểu 6 ký tự.");
    if (password !== confirm) return setError("Mật khẩu nhập lại không khớp.");
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || "Không thể đặt lại mật khẩu.");
    setDone(true);
    setTimeout(() => router.push("/login"), 1800);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-4 sm:p-6">
      <div className="lexora-bento w-full max-w-[430px] p-7 text-center sm:p-10">
        <Link
          href="/"
          className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-[15px] bg-gold text-xl font-extrabold text-white shadow-[0_10px_24px_-6px_rgb(var(--color-gold)/0.45)]"
        >
          L
        </Link>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-goldpale px-3 py-1 text-[0.7rem] font-extrabold uppercase tracking-wider text-golddark">
          Security Update
        </div>
        <h1 className="mt-3 font-serif text-2xl font-extrabold tracking-[-0.03em] text-ink sm:text-3xl">
          Đặt lại mật khẩu
        </h1>

        {done ? (
          <div className="mt-6 rounded-[14px] border border-ok/25 bg-okbg px-4 py-3.5 text-sm text-ok">
            Đã đặt lại mật khẩu thành công! Đang chuyển tới trang đăng nhập...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left">
            {error && <div className={cx.errMsg}>{error}</div>}
            <label className="block">
              <span className={cx.label}>Mật khẩu mới</span>
              <input
                className={cx.input}
                type="password"
                placeholder="Tối thiểu 6 ký tự"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={cx.label}>Nhập lại mật khẩu mới</span>
              <input
                className={cx.input}
                type="password"
                placeholder="Nhập lại mật khẩu"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className={`${cx.btn} ${cx.btnGold} w-full`}
            >
              {loading ? "Đang lưu..." : "Lưu mật khẩu mới →"}
            </button>
          </form>
        )}

        <div className="mt-6 text-sm text-muted">
          <Link href="/login" className="font-extrabold text-golddark hover:underline">
            ← Quay lại đăng nhập
          </Link>
        </div>
      </div>
    </main>
  );
}
