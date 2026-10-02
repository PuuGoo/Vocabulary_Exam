import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { cx } from "@/components/ui";
import PublicFooter from "@/components/PublicFooter";
import { SITE_CONFIG } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "Lexora — Vocabulary Learning Platform",
  description: SITE_CONFIG.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Lexora — Vocabulary Learning Platform",
    description: SITE_CONFIG.description,
    url: "/",
    siteName: SITE_CONFIG.name,
    type: "website",
    locale: "vi_VN",
  },
  twitter: {
    card: "summary",
    title: "Lexora — Vocabulary Learning Platform",
    description: SITE_CONFIG.description,
  },
};

const FEATURES = [
  {
    title: "Học từ vựng IELTS",
    body: "Flashcard, điền từ, trắc chứng và luyện tập theo bộ từ với tiến độ riêng cho từng người học.",
  },
  {
    title: "Từ vựng tiếng Trung (Mandarin)",
    body: "Chữ Hán, Pinyin, thanh điệu và các kỹ năng đọc, nghe, nói theo tiến độ chi tiết.",
  },
  {
    title: "Lặp lại ngắt quãng (spaced repetition)",
    body: "Lịch ôn tập tự tính, smart review và theo dõi độ nhớ thay vì học dồn một lần.",
  },
  {
    title: "Quiz và kiểm tra",
    body: "Nhiều dạng bài trắc chứng, nghe viết, ghép từ, điền từ dùng chung dữ liệu từ vựng.",
  },
  {
    title: "Google Sheets",
    body: "Tạo Google Spreadsheet cho một bộ từ, đọc dữ liệu và đồng bộ thay đổi cho giáo viên.",
  },
  {
    title: "Quản lý và bảo mật",
    body: "Phân quyền admin theo folder, kiểm soát truy cập và sao lưu dữ liệu khi cần.",
  },
];

export default async function HomePage() {
  const session = await getSession();
  if (session) redirect(session.role === "admin" ? "/admin" : "/dashboard");

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Lexora — trang chủ">
            <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-gold text-base font-extrabold text-white" aria-hidden="true">
              L
            </span>
            <span>
              <b className="block text-base">{SITE_CONFIG.name}</b>
              <span className="block text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-muted">
                {SITE_CONFIG.tagline}
              </span>
            </span>
          </Link>
          <nav aria-label="Điều hướng chính" className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className={cx.btn + " " + cx.btnGhost}>
              Đăng nhập
            </Link>
            <Link href="/register" className={cx.btn + " " + cx.btnGold}>
              Đăng ký
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-golddark">
            Nền tảng học từ vựng
          </p>
          <h1 className="mt-4 max-w-3xl text-[clamp(2.1rem,6vw,3.6rem)] font-extrabold leading-[1.06] tracking-[-0.04em]">
            Học từ vựng <span className="lexora-gradient-text">IELTS và tiếng Trung</span> theo cách có nhịp.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
            {SITE_CONFIG.description}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className={cx.btn + " " + cx.btnGold}>
              Tạo tài khoản
            </Link>
            <Link href="/login" className={cx.btn + " " + cx.btnDark}>
              Đăng nhập
            </Link>
          </div>
        </section>

        <section aria-labelledby="features-heading" className="border-y border-line bg-white">
          <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8">
            <h2 id="features-heading" className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
              Tính năng chính
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Tất cả đều dùng chung một bộ dữ liệu từ vựng, nên tiến độ học và kiểm tra luôn nhất quán.
            </p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <li key={feature.title} className="rounded-[16px] border border-line bg-paper p-5">
                  <h3 className="font-bold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{feature.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="sheets-heading" className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8">
          <div className="rounded-[16px] border border-line bg-white p-6 sm:p-8">
            <h2 id="sheets-heading" className="text-xl font-bold sm:text-2xl">
              Google Sheets cho giáo viên
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
              Khi bạn kết nối Google, Lexora dùng <b>Google Sheets</b> và quyền truy cập theo{" "}
              <b>từng file</b> (Drive <code className="rounded bg-goldpale px-1 py-0.5 text-[0.8rem]">drive.file</code>) để:
            </p>
            <ul className="mt-4 grid gap-2 text-sm leading-6 text-ink sm:grid-cols-2">
              <li>• Tạo một Google Spreadsheet cho bộ từ bạn chọn.</li>
              <li>• Ghi từ vựng hiện tại vào spreadsheet đó kèm mã nhận dạng ổn định.</li>
              <li>• Đọc dữ liệu từ spreadsheet mà bạn (hoặc Lexora) đã kết nối.</li>
              <li>• Đồng bộ thay đổi giữa Google Sheets và Lexora, kèm metadata cần thiết cho đồng bộ.</li>
            </ul>
            <p className="mt-4 text-sm leading-6 text-muted">
              Lexora không dùng dữ liệu Google để quảng cáo và không bán dữ liệu Google của bạn. Google không xác
              nhận hay đánh giá nội dung trên trang này.{" "}
              <Link href="/privacy" className="font-semibold text-golddark hover:underline">
                Xem Privacy Policy
              </Link>
              {" · "}
              <Link href="/terms" className="font-semibold text-golddark hover:underline">
                Xem Terms of Service
              </Link>
            </p>
          </div>
        </section>

        <section aria-labelledby="cta-heading" className="border-t border-line bg-white">
          <div className="mx-auto w-full max-w-5xl px-5 py-14 text-center sm:px-8">
            <h2 id="cta-heading" className="text-2xl font-bold tracking-[-0.02em]">
              Bắt đầu học ngay
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted">
              Tạo tài khoản để bắt đầu, hoặc đăng nhập nếu bạn đã có.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/register" className={cx.btn + " " + cx.btnGold}>
                Đăng ký
              </Link>
              <Link href="/login" className={cx.btn + " " + cx.btnGhost}>
                Đăng nhập
              </Link>
            </div>
            <p className="mt-6 text-sm text-muted">
              <Link href="/privacy" className="font-semibold text-golddark hover:underline">Privacy Policy</Link>
              {"  ·  "}
              <Link href="/terms" className="font-semibold text-golddark hover:underline">Terms of Service</Link>
            </p>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}