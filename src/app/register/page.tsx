"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/registration-status")
      .then((res) => res.json())
      .then((data) => setRegistrationOpen(data.open))
      .catch(() => setRegistrationOpen(true));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (registrationOpen === false) return;
    setError(null);
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, displayName }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await responseJsonSafe(res);
      setError(data.error || "Đăng ký thất bại.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-paper p-4 sm:p-6 lg:p-10 flex items-center justify-center">
      <div className="mx-auto grid min-h-[680px] w-full max-w-[1160px] overflow-hidden rounded-[28px] border border-line bg-panel shadow-[0_24px_80px_-12px_rgba(15,23,42,0.12)] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="lexora-hero-mesh relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex lg:p-14">
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-indigo-500/25 blur-3xl" />
            <div className="absolute -left-20 bottom-10 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl" />
          </div>
          <Link href="/" className="relative z-10 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/20 bg-white/15 text-lg font-extrabold text-white backdrop-blur-md shadow-lg">
              L
            </span>
            <span>
              <span className="flex items-center gap-2">
                <b className="text-lg tracking-tight">Lexora</b>
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-200">
                  Global B2C
                </span>
              </span>
              <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-indigo-200/80">
                Personal Scholar Edition
              </span>
            </span>
          </Link>

          <div className="relative z-10 my-auto max-w-md py-8">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-indigo-100 backdrop-blur-sm">
              ✦ Khởi tạo hồ sơ trí nhớ cá nhân
            </span>
            <h1 className="mt-5 font-serif text-[clamp(2rem,3.8vw,3.1rem)] font-extrabold leading-[1.08] tracking-[-0.04em]">
              Xây dựng kho từ vựng học thuật bền vững.
            </h1>
            <p className="mt-4 text-sm leading-6 text-indigo-100/85">
              Theo dõi từng từ vựng IELTS &amp; HSK với thuật toán lặp lại ngắt quãng FSRS và chu trình học 4 cấp độ nhận thức.
            </p>
          </div>

          <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-5 text-xs text-indigo-200/75">
            <span>Miễn phí trọn đời cho tính năng cốt lõi</span>
            <span>Đồng bộ đa thiết bị</span>
          </div>
        </section>

        <section className="flex items-center justify-center p-7 sm:p-12 lg:p-14">
          <div className="w-full max-w-[390px]">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-goldpale px-3 py-1 text-xs font-extrabold text-golddark">
              Tài khoản học viên mới
            </div>
            <h2 className="mt-3 font-serif text-3xl font-extrabold tracking-[-0.035em] text-ink">
              Tạo tài khoản Lexora
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Bắt đầu lộ trình ôn luyện thông minh chỉ trong vài giây.
            </p>

            {registrationOpen === false && (
              <div className="mt-5 rounded-[14px] border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm leading-6 text-ink">
                Đăng ký tài khoản mới đang tạm khóa. Vui lòng liên hệ quản trị viên để được cấp tài khoản.
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left">
              {error && (
                <div className="rounded-[13px] border border-bad/25 bg-badbg px-3.5 py-3 text-sm font-medium text-bad">
                  {error}
                </div>
              )}
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-muted">
                  Tên đăng nhập
                </span>
                <input
                  disabled={registrationOpen === false}
                  className="h-12 w-full rounded-[13px] border border-line bg-paper/60 px-4 text-sm font-medium text-ink outline-none transition-all duration-200 focus:border-gold focus:bg-panel focus:shadow-[0_0_0_4px_rgb(var(--color-gold)/0.12)]"
                  type="text"
                  placeholder="VD: minhtran_ielts"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-muted">
                  Tên hiển thị
                </span>
                <input
                  disabled={registrationOpen === false}
                  className="h-12 w-full rounded-[13px] border border-line bg-paper/60 px-4 text-sm font-medium text-ink outline-none transition-all duration-200 focus:border-gold focus:bg-panel focus:shadow-[0_0_0_4px_rgb(var(--color-gold)/0.12)]"
                  type="text"
                  placeholder="VD: Nguyễn Văn A"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-muted">
                  Mật khẩu
                </span>
                <input
                  disabled={registrationOpen === false}
                  className="h-12 w-full rounded-[13px] border border-line bg-paper/60 px-4 text-sm font-medium text-ink outline-none transition-all duration-200 focus:border-gold focus:bg-panel focus:shadow-[0_0_0_4px_rgb(var(--color-gold)/0.12)]"
                  type="password"
                  placeholder="Tối thiểu 6 ký tự"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button
                type="submit"
                disabled={loading || registrationOpen !== true}
                className="mt-2 h-12 w-full rounded-[13px] bg-gold text-sm font-bold text-white shadow-[0_10px_24px_-6px_rgb(var(--color-gold)/0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-golddark disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {registrationOpen === null
                  ? "Đang kiểm tra đăng ký..."
                  : loading
                    ? "Đang tạo tài khoản..."
                    : "Tạo tài khoản & vào học →"}
              </button>
            </form>

            <p className="mt-7 text-center text-sm text-muted">
              Đã có tài khoản?{" "}
              <Link href="/login" className="font-extrabold text-golddark hover:underline">
                Đăng nhập
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

async function responseJsonSafe(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}
