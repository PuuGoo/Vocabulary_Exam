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
    <div className="max-w-[400px] mx-auto mt-16 px-4">
      <div className="bg-panel border border-line rounded-2xl px-8 py-9 text-center shadow-lg">
        <div className="w-16 h-16 mx-auto mb-3.5 rounded-full border-2 border-gold flex items-center justify-center font-serif text-2xl text-gold font-bold">
          IV
        </div>
        <h1 className="font-serif text-[1.3rem] mb-0.5">Đặt lại mật khẩu</h1>

        {done ? (
          <div className="text-[0.85rem] text-ok bg-okbg rounded-lg px-4 py-3 mt-4">
            Đã đặt lại mật khẩu thành công! Đang chuyển tới trang đăng nhập...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="text-left mt-4">
            {error && <div className={cx.errMsg}>{error}</div>}
            <label className={cx.label}>Mật khẩu mới</label>
            <input className={cx.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <label className={cx.label}>Nhập lại mật khẩu mới</label>
            <input className={cx.input} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <button type="submit" disabled={loading} className={`${cx.btn} ${cx.btnGold} w-full mt-1`}>
              {loading ? "Đang lưu..." : "Đặt mật khẩu mới"}
            </button>
          </form>
        )}

        <div className="text-[0.82rem] mt-4 text-muted">
          <Link href="/login" className="text-golddark font-medium hover:underline">
            ← Quay lại đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
