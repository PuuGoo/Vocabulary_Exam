"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cx } from "@/components/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, displayName }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Đăng ký thất bại.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="max-w-[400px] mx-auto mt-16 px-4">
      <div className="bg-panel border border-line rounded-2xl px-8 py-9 text-center shadow-lg">
        <div className="w-16 h-16 mx-auto mb-3.5 rounded-full border-2 border-gold flex items-center justify-center font-serif text-2xl text-gold font-bold">
          IV
        </div>
        <h1 className="font-serif text-[1.3rem] mb-0.5">Đăng ký học sinh</h1>
        <div className="text-muted text-[0.85rem] mb-5">Tạo tài khoản để bắt đầu ôn luyện</div>

        <form onSubmit={handleSubmit} className="text-left">
          {error && <div className={cx.errMsg}>{error}</div>}
          <label className={cx.label}>Tên đăng nhập</label>
          <input className={cx.input} type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
          <label className={cx.label}>Tên hiển thị</label>
          <input
            className={cx.input}
            type="text"
            placeholder="VD: Nguyễn Văn A"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <label className={cx.label}>Mật khẩu</label>
          <input
            className={cx.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" disabled={loading} className={`${cx.btn} ${cx.btnGold} w-full mt-1`}>
            {loading ? "Đang tạo tài khoản..." : "Tạo tài khoản & vào học"}
          </button>
        </form>

        <div className="text-[0.82rem] mt-4 text-muted">
          Đã có tài khoản?{" "}
          <Link href="/login" className="text-golddark font-medium hover:underline">
            Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
