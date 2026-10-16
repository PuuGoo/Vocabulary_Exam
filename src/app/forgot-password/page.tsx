"use client";

import { useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setDevResetUrl(null);
    if (!username.trim()) return setError("Vui lòng nhập tên đăng nhập.");
    setLoading(true);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim() }),
    });
    setLoading(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || "Có lỗi xảy ra.");
    setMessage(data.message || "Đã xử lý yêu cầu.");
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
          Account Recovery
        </div>
        <h1 className="mt-3 font-serif text-2xl font-extrabold tracking-[-0.03em] text-ink sm:text-3xl">
          Quên mật khẩu?
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Nhập tên đăng nhập của bạn, hệ thống sẽ gửi hướng dẫn đặt lại mật khẩu tới email khôi phục đã lưu.
        </p>

        {message ? (
          <div className="mt-6 rounded-[14px] border border-ok/25 bg-okbg px-4 py-3.5 text-left text-sm leading-6 text-ok">
            {message}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left">
            {error && <div className={cx.errMsg}>{error}</div>}
            <label className="block">
              <span className={cx.label}>Tên đăng nhập</span>
              <input
                className={cx.input}
                type="text"
                placeholder="VD: minhtran_ielts"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className={`${cx.btn} ${cx.btnGold} w-full`}
            >
              {loading ? "Đang gửi yêu cầu..." : "Gửi yêu cầu đặt lại mật khẩu →"}
            </button>
          </form>
        )}

        {devResetUrl && (
          <div className="mt-4 break-all rounded-[12px] border border-gold/25 bg-goldpale px-3.5 py-2.5 text-left text-xs text-muted">
            {devResetUrl}
          </div>
        )}

        <div className="mt-6 text-sm text-muted">
          <Link href="/login" className="font-extrabold text-golddark hover:underline">
            ← Quay lại đăng nhập
          </Link>
        </div>

        <div className="mt-5 rounded-[14px] border border-line bg-paper/70 px-3.5 py-3 text-left text-xs leading-5 text-muted">
          Chưa nhận được email hoặc chưa khai báo email khôi phục? Liên hệ quản trị viên để được cấp lại mật khẩu trực tiếp.
        </div>
      </div>
    </main>
  );
}
