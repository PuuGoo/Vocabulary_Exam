"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

/** Only allow internal paths (starts with /) to prevent open redirect attacks. */
function isInternalPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.match(/https?:\/\//);
}

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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "Đăng nhập thất bại.");
        return;
      }
      router.push(isInternalPath(search.get("next") || "") ? search.get("next")! : "/");
      router.refresh();
    } catch {
      setError("Không thể kết nối. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper p-4 sm:p-6 lg:p-10 flex items-center justify-center">
      <div className="mx-auto grid min-h-[680px] w-full max-w-[1160px] overflow-hidden rounded-[28px] border border-line bg-panel shadow-[0_24px_80px_-12px_rgba(15,23,42,0.12)] lg:grid-cols-[1.08fr_0.92fr]">
        <section className="lexora-hero-mesh relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex lg:p-14">
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden="true"
          >
            <div className="absolute -right-28 -top-28 h-96 w-96 rounded-full bg-indigo-500/25 blur-3xl" />
            <div className="absolute -left-20 bottom-10 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl" />
          </div>

          <Link href="/" className="relative z-10 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/15 backdrop-blur-md border border-white/20 text-lg font-extrabold text-white shadow-lg">
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
                Cognitive Vocabulary Engine
              </span>
            </span>
          </Link>

          <div className="relative z-10 my-auto max-w-md py-8">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-indigo-100 backdrop-blur-sm">
              ✦ 4-Stage Recall · FSRS Smart Queue
            </span>
            <h1 className="mt-5 font-serif text-[clamp(2.1rem,4vw,3.25rem)] font-extrabold leading-[1.08] tracking-[-0.04em]">
              Biến mỗi buổi ôn thành trí nhớ dài hạn.
            </h1>
            <p className="mt-4 text-sm leading-6 text-indigo-100/85">
              Hệ thống học từ vựng học thuật IELTS &amp; HSK cá nhân hóa theo đường cong quên lãng của riêng bạn.
            </p>

            <div className="mt-8 grid gap-3">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xs">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-400/20 text-emerald-300 font-bold">
                  ✓
                </span>
                <span className="text-xs font-semibold text-indigo-50">
                  Hàng đợi Smart SRS tự động chọn từ cần ôn mỗi sáng
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xs">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300 font-bold">
                  ⚡
                </span>
                <span className="text-xs font-semibold text-indigo-50">
                  4 bước nhận thức: Flashcard → Cloze → Audio → Feynman AI
                </span>
              </div>
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-5 text-xs text-indigo-200/75">
            <span>Lexora Personal Scholar Edition</span>
            <span>IELTS · Mandarin HSK</span>
          </div>
        </section>

        <section className="flex items-center justify-center p-7 sm:p-12 lg:p-14">
          <div className="w-full max-w-[390px]">
            <Link href="/" className="mb-7 flex items-center gap-3 lg:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-gold text-lg font-extrabold text-white">
                L
              </span>
              <span>
                <b className="block text-base">Lexora</b>
                <span className="text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-muted">
                  Global Vocabulary
                </span>
              </span>
            </Link>

            <div className="inline-flex items-center gap-1.5 rounded-full bg-goldpale px-3 py-1 text-xs font-extrabold text-golddark">
              Chào mừng trở lại
            </div>
            <h2 className="mt-3 font-serif text-3xl font-extrabold tracking-[-0.035em] text-ink">
              Đăng nhập Lexora
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Tiếp tục lộ trình Smart SRS và duy trì chuỗi ngày học của bạn.
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
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
                  className="h-12 w-full rounded-[13px] border border-line bg-paper/60 px-4 text-sm font-medium text-ink outline-none transition-all duration-200 focus:border-gold focus:bg-panel focus:shadow-[0_0_0_4px_rgb(var(--color-gold)/0.12)]"
                  type="text"
                  autoComplete="username"
                  placeholder="Nhập tên đăng nhập..."
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
              <label className="block">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-muted">
                    Mật khẩu
                  </span>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-bold text-golddark hover:underline"
                  >
                    Quên mật khẩu?
                  </Link>
                </div>
                <input
                  className="h-12 w-full rounded-[13px] border border-line bg-paper/60 px-4 text-sm font-medium text-ink outline-none transition-all duration-200 focus:border-gold focus:bg-panel focus:shadow-[0_0_0_4px_rgb(var(--color-gold)/0.12)]"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="mt-2 h-12 w-full rounded-[13px] bg-gold text-sm font-bold text-white shadow-[0_10px_24px_-6px_rgb(var(--color-gold)/0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-golddark disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Đang đăng nhập…
                  </span>
                ) : (
                  "Đăng nhập vào không gian học →"
                )}
              </button>
            </form>

            <p className="mt-7 text-center text-sm text-muted">
              Chưa có tài khoản?{" "}
              <Link href="/register" className="font-extrabold text-golddark hover:underline">
                Tạo tài khoản miễn phí
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
