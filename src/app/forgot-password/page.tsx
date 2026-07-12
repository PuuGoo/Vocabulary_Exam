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
    <div className="max-w-[400px] mx-auto mt-16 px-4">
      <div className="bg-panel border border-line rounded-2xl px-8 py-9 text-center shadow-lg">
        <div className="w-16 h-16 mx-auto mb-3.5 rounded-full border-2 border-gold flex items-center justify-center font-serif text-2xl text-gold font-bold">
          IV
        </div>
        <h1 className="font-serif text-[1.3rem] mb-0.5">Quên mật khẩu</h1>
        <div className="text-muted text-[0.85rem] mb-5">
          Nhập tên đăng nhập, hệ thống sẽ gửi hướng dẫn đặt lại mật khẩu tới email đã lưu (nếu có).
        </div>

        {message ? (
          <div className="text-[0.85rem] text-ok bg-okbg rounded-lg px-4 py-3 text-left leading-relaxed">
            {message}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="text-left">
            {error && <div className={cx.errMsg}>{error}</div>}
            <label className={cx.label}>Tên đăng nhập</label>
            <input className={cx.input} type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
            <button type="submit" disabled={loading} className={`${cx.btn} ${cx.btnGold} w-full mt-1`}>
              {loading ? "Đang gửi..." : "Gửi yêu cầu đặt lại mật khẩu"}
            </button>
          </form>
        )}

        {devResetUrl && (
          <div className="mt-3 text-[0.74rem] text-muted bg-goldpale px-3 py-2.5 rounded-lg text-left break-all">
            {devResetUrl}
          </div>
        )}

        <div className="text-[0.82rem] mt-4 text-muted">
          <Link href="/login" className="text-golddark font-medium hover:underline">
            ← Quay lại đăng nhập
          </Link>
        </div>

        <div className="mt-4 text-[0.74rem] text-muted bg-goldpale px-3 py-2.5 rounded-lg text-left leading-relaxed">
          Chưa nhận được email hoặc chưa khai báo email? Liên hệ giáo viên/quản trị viên để được cấp lại mật khẩu trực tiếp.
        </div>
      </div>
    </div>
  );
}
