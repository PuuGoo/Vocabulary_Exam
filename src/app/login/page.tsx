"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cx } from "@/components/ui";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Đăng nhập thất bại.");
      return;
    }
    const next = search.get("next");
    router.push(next || "/");
    router.refresh();
  }

  return (
    <div className="max-w-[400px] mx-auto mt-16 px-4">
      <div className="bg-panel border border-line rounded-2xl px-8 py-9 text-center shadow-lg">
        <div className="w-16 h-16 mx-auto mb-3.5 rounded-full border-2 border-gold flex items-center justify-center font-serif text-2xl text-gold font-bold">
          IV
        </div>
        <h1 className="font-serif text-[1.3rem] mb-0.5">IELTS Vocab Check</h1>
        <div className="text-muted text-[0.85rem] mb-5">Đăng nhập để bắt đầu ôn luyện từ vựng</div>

        <form onSubmit={handleSubmit} className="text-left">
          {error && <div className={cx.errMsg}>{error}</div>}
          <label className={cx.label}>Tên đăng nhập</label>
          <input
            className={cx.input}
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <label className={cx.label}>Mật khẩu</label>
          <input
            className={cx.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className={`${cx.btn} ${cx.btnGold} w-full mt-1`}
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        <div className="text-[0.82rem] mt-3 text-muted">
          <Link href="/forgot-password" className="text-golddark font-medium hover:underline">
            Quên mật khẩu?
          </Link>
        </div>

        <div className="text-[0.82rem] mt-4 text-muted">
          Chưa có tài khoản?{" "}
          <Link href="/register" className="text-golddark font-medium hover:underline">
            Đăng ký học sinh
          </Link>
        </div>

        <div className="mt-4 text-[0.74rem] text-muted bg-goldpale px-3 py-2.5 rounded-lg text-left leading-relaxed">
          Tài khoản demo — Admin: <code className="bg-white/60 px-1 rounded">admin / admin123</code>
          <br />
          Học sinh: <code className="bg-white/60 px-1 rounded">hocsinh / 123456</code>
        </div>
      </div>
    </div>
  );
}
