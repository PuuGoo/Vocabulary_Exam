import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { cx } from "@/components/ui";
import PublicFooter from "@/components/PublicFooter";
import { SITE_CONFIG } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "Lexora — Global Vocabulary & Cognitive Mastery Platform",
  description: SITE_CONFIG.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Lexora — Global Vocabulary & Cognitive Mastery Platform",
    description: SITE_CONFIG.description,
    url: "/",
    siteName: SITE_CONFIG.name,
    type: "website",
    locale: "vi_VN",
  },
  twitter: {
    card: "summary",
    title: "Lexora — Global Vocabulary & Cognitive Mastery Platform",
    description: SITE_CONFIG.description,
  },
};

const STAGES = [
  {
    step: "01",
    badge: "Recall",
    title: "Nhận diện & Phản xạ 3D",
    body: "Flashcard lật 2 chiều VI ↔ EN/ZH, bảng động từ bất quy tắc V1–V2–V3 kèm phát âm IPA chuẩn xác.",
  },
  {
    step: "02",
    badge: "Context",
    title: "Điền từ & Ngữ cảnh học thuật",
    body: "Đặt từ vựng vào câu Cloze, Collocation và bài đọc IELTS thực tế để hiểu sâu sắc thái nghĩa.",
  },
  {
    step: "03",
    badge: "Audio & Tone",
    title: "Nghe chép chính tả & Thanh điệu",
    body: "Luyện tai nghe Dictation tốc độ thực và kiểm tra chuẩn xác 4 thanh điệu Pinyin tiếng Trung.",
  },
  {
    step: "04",
    badge: "Feynman AI",
    title: "Vận dụng & Chấm điểm AI",
    body: "Giải thích lại khái niệm bằng lời của bạn và đặt câu học thuật để mở khóa trạng thái Mastered.",
  },
];

const FEATURES = [
  {
    icon: "⚡",
    title: "Lặp lại ngắt quãng FSRS thông minh",
    body: "Tự động tính toán điểm rơi trí nhớ cho từng từ, ưu tiên nhóm từ dễ quên (Leech words) để tiết kiệm 60% thời gian ôn.",
  },
  {
    icon: "🎯",
    title: "Chuyên sâu IELTS & HSK Mandarin",
    body: "Hỗ trợ song song từ vựng học thuật IELTS (synonym, family words, V1-V2-V3) và tiếng Trung (Chữ Hán, Pinyin, bộ thủ).",
  },
  {
    icon: "📊",
    title: "Phân tích trí nhớ & Bản đồ nhiệt",
    body: "Theo dõi đường cong ghi nhớ 14 ngày, ma trận kỹ năng và chuỗi ngày học liên tục theo thời gian thực.",
  },
  {
    icon: "🗂️",
    title: "Nhật ký nhiệm vụ & Lịch ôn tập",
    body: "Lên kế hoạch mục tiêu theo ngày, tuần với tiến độ đồng bộ tự động từ mọi phiên Flashcard và Quiz.",
  },
  {
    icon: "🔄",
    title: "Đồng bộ Google Sheets 2 chiều",
    body: "Giáo viên và người học có thể quản lý, cập nhật kho từ vựng trực tiếp từ Google Spreadsheet với định danh ổn định.",
  },
  {
    icon: "🛡️",
    title: "Không gian học tập cá nhân hóa",
    body: "3 giao diện chủ đề (Indigo SaaS, Warm Editorial, Midnight Dark) dịu mắt, tối ưu cho các phiên học sâu.",
  },
];

export default async function HomePage() {
  const session = await getSession();
  if (session) redirect(session.role === "admin" ? "/admin" : "/dashboard");

  return (
    <div className="min-h-screen bg-paper text-ink selection:bg-gold/20 selection:text-golddark">
      <header className="sticky top-0 z-30 border-b border-line/80 bg-panel/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Link href="/" className="flex items-center gap-3 group" aria-label="Lexora — trang chủ">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-gradient-to-br from-gold to-golddark text-base font-extrabold text-white shadow-[0_8px_20px_-4px_rgb(var(--color-gold)/0.45)] transition-transform duration-200 group-hover:scale-105"
              aria-hidden="true"
            >
              L
            </span>
            <span>
              <b className="block font-serif text-lg tracking-[-0.02em]">{SITE_CONFIG.name}</b>
              <span className="block text-[0.62rem] font-extrabold uppercase tracking-[0.18em] text-muted">
                {SITE_CONFIG.tagline}
              </span>
            </span>
          </Link>
          <nav aria-label="Điều hướng chính" className="flex items-center gap-2.5 sm:gap-3">
            <Link href="/login" className={cx.btn + " " + cx.btnGhost}>
              Đăng nhập
            </Link>
            <Link href="/register" className={cx.btn + " " + cx.btnGold}>
              Bắt đầu miễn phí →
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-line/70">
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(60% 50% at 75% 15%, rgb(var(--color-gold) / 0.13) 0%, transparent 70%), radial-gradient(50% 45% at 15% 85%, rgba(217, 119, 6, 0.08) 0%, transparent 70%)",
            }}
            aria-hidden="true"
          />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.12fr_0.88fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-goldpale/80 px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-golddark shadow-sm">
                <span className="h-2 w-2 rounded-full bg-gold animate-pulse" />
                Adaptive Spaced Repetition · IELTS & HSK
              </div>
              <h1 className="mt-5 font-serif text-[clamp(2.35rem,5.2vw,4rem)] font-extrabold leading-[1.05] tracking-[-0.035em] text-ink">
                Làm chủ từ vựng{" "}
                <span className="lexora-gradient-text">IELTS & Tiếng Trung</span>{" "}
                bằng trí nhớ dài hạn.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-muted sm:text-[1.05rem]">
                {SITE_CONFIG.description} Hệ thống 4 chặng nhận thức kết hợp thuật toán FSRS giúp bạn biến từ mới thành phản xạ học thuật tự nhiên.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <Link href="/register" className={cx.btn + " " + cx.btnGold + " px-6 py-3 text-sm"}>
                  Tạo tài khoản học ngay
                </Link>
                <Link href="/login" className={cx.btn + " " + cx.btnGhost + " px-6 py-3 text-sm"}>
                  Đăng nhập tài khoản
                </Link>
              </div>
              <div className="mt-9 grid grid-cols-3 gap-4 border-t border-line/80 pt-6 max-w-lg">
                <div>
                  <div className="font-serif text-2xl font-extrabold text-ink">4 Chặng</div>
                  <div className="text-xs font-medium text-muted">Chu trình ghi nhớ sâu</div>
                </div>
                <div>
                  <div className="font-serif text-2xl font-extrabold text-gold">FSRS v4</div>
                  <div className="text-xs font-medium text-muted">Lịch ôn tập thích ứng</div>
                </div>
                <div>
                  <div className="font-serif text-2xl font-extrabold text-ink">IELTS + HSK</div>
                  <div className="text-xs font-medium text-muted">Song ngữ học thuật</div>
                </div>
              </div>
            </div>

            {/* Interactive Preview Bento Card */}
            <div className="lexora-bento relative overflow-hidden p-6 sm:p-7">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <div>
                  <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-gold">
                    Phiên học thông minh hôm nay
                  </span>
                  <h2 className="mt-0.5 font-serif text-lg font-extrabold text-ink">
                    Academic Collocations & Verb Forms
                  </h2>
                </div>
                <span className="rounded-full bg-okbg px-3 py-1 text-xs font-extrabold text-ok">
                  94% Độ bền nhớ
                </span>
              </div>

              <div className="mt-5 rounded-[16px] border border-gold/20 bg-goldpale/50 p-5">
                <div className="flex items-center justify-between text-xs font-bold text-golddark">
                  <span>CHẶNG 1 · ACTIVE RECALL</span>
                  <span>IPA /juːˈbɪk.wɪ.təs/</span>
                </div>
                <div className="mt-2 font-serif text-2xl font-extrabold text-ink">ubiquitous (adj)</div>
                <p className="mt-1 text-sm text-inksoft">
                  Có mặt ở khắp mọi nơi, phổ biến rộng rãi trong đời sống hiện đại.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-lg bg-panel px-2.5 py-1 text-xs font-bold text-ink shadow-sm">
                    Syn: omnipresent, pervasive
                  </span>
                  <span className="rounded-lg bg-panel px-2.5 py-1 text-xs font-bold text-golddark shadow-sm">
                    Mức nhớ: Lv.4 · Ôn sau 6 ngày
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[14px] border border-line bg-paper/70 p-3.5">
                  <div className="text-[0.68rem] font-bold uppercase tracking-wider text-muted">
                    Từ cần ôn hôm nay
                  </div>
                  <div className="mt-1 font-serif text-xl font-extrabold text-ink">18 từ mục tiêu</div>
                  <div className="mt-1 text-xs font-semibold text-ok">✓ Đúng hạn 100%</div>
                </div>
                <div className="rounded-[14px] border border-line bg-paper/70 p-3.5">
                  <div className="text-[0.68rem] font-bold uppercase tracking-wider text-muted">
                    Feynman AI Studio
                  </div>
                  <div className="mt-1 font-serif text-xl font-extrabold text-gold">Mastery 4/4</div>
                  <div className="mt-1 text-xs font-semibold text-muted">Chấm câu học thuật</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4-Stage Learning Pipeline */}
        <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-gold">
              Phương pháp 4 Chặng Nhận Thức
            </p>
            <h2 className="mt-2 font-serif text-2xl font-extrabold tracking-[-0.025em] sm:text-3xl">
              Không chỉ học thuộc lòng — biến từ vựng thành phản xạ.
            </h2>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STAGES.map((s) => (
              <div key={s.step} className="lexora-bento flex flex-col justify-between p-5">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-2xl font-extrabold text-gold/80">{s.step}</span>
                    <span className="rounded-full bg-goldpale px-2.5 py-0.5 text-[0.68rem] font-extrabold uppercase tracking-wider text-golddark">
                      {s.badge}
                    </span>
                  </div>
                  <h3 className="mt-4 font-serif text-lg font-extrabold text-ink">{s.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Features Grid */}
        <section aria-labelledby="features-heading" className="border-y border-line/80 bg-panel/60">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-gold">
                Hệ sinh thái toàn diện
              </p>
              <h2 id="features-heading" className="mt-2 font-serif text-2xl font-extrabold tracking-[-0.025em] sm:text-3xl">
                Tính năng chính trên Lexora
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Tất cả chế độ học, kiểm tra và phân tích đều đồng bộ tức thì trên cùng một hồ sơ trí nhớ.
              </p>
            </div>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <li key={feature.title} className="lexora-bento p-6">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-goldpale text-lg">
                    {feature.icon}
                  </div>
                  <h3 className="font-serif text-base font-extrabold text-ink">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{feature.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Google Sheets Disclosure Section */}
        <section aria-labelledby="sheets-heading" className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
          <div className="lexora-bento p-6 sm:p-9">
            <div className="inline-flex items-center gap-2 rounded-full bg-goldpale px-3 py-1 text-xs font-bold text-golddark">
              Tích hợp đám mây minh bạch
            </div>
            <h2 id="sheets-heading" className="mt-3 font-serif text-xl font-extrabold sm:text-2xl">
              Đồng bộ Google Sheets cho giáo viên & người biên soạn
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
              Khi bạn kết nối Google, Lexora dùng <b>Google Sheets</b> và quyền truy cập theo{" "}
              <b>từng file</b> (Drive <code className="rounded bg-goldpale px-1.5 py-0.5 text-[0.8rem] font-semibold text-golddark">drive.file</code>) để:
            </p>
            <ul className="mt-4 grid gap-2.5 text-sm leading-6 text-ink sm:grid-cols-2">
              <li className="flex items-start gap-2"><span className="text-gold font-bold">✓</span> Tạo một Google Spreadsheet cho bộ từ bạn chọn.</li>
              <li className="flex items-start gap-2"><span className="text-gold font-bold">✓</span> Ghi từ vựng hiện tại vào spreadsheet đó kèm mã nhận dạng ổn định.</li>
              <li className="flex items-start gap-2"><span className="text-gold font-bold">✓</span> Đọc dữ liệu từ spreadsheet mà bạn (hoặc Lexora) đã kết nối.</li>
              <li className="flex items-start gap-2"><span className="text-gold font-bold">✓</span> Đồng bộ thay đổi giữa Google Sheets và Lexora kèm metadata cần thiết.</li>
            </ul>
            <p className="mt-5 border-t border-line pt-4 text-sm leading-6 text-muted">
              Lexora không dùng dữ liệu Google để quảng cáo và không bán dữ liệu Google của bạn. Google không xác
              nhận hay đánh giá nội dung trên trang này.{" "}
              <Link href="/privacy" className="font-bold text-golddark hover:underline">
                Xem Privacy Policy
              </Link>
              {" · "}
              <Link href="/terms" className="font-bold text-golddark hover:underline">
                Xem Terms of Service
              </Link>
            </p>
          </div>
        </section>

        {/* Bottom CTA */}
        <section aria-labelledby="cta-heading" className="border-t border-line bg-panel">
          <div className="mx-auto w-full max-w-4xl px-5 py-16 text-center sm:px-8">
            <h2 id="cta-heading" className="font-serif text-2xl font-extrabold tracking-[-0.025em] sm:text-3xl">
              Sẵn sàng nâng cấp vốn từ học thuật của bạn?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted">
              Khởi tạo lộ trình học từ vựng cá nhân hóa chỉ trong 30 giây.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3.5">
              <Link href="/register" className={cx.btn + " " + cx.btnGold + " px-7"}>
                Đăng ký tài khoản
              </Link>
              <Link href="/login" className={cx.btn + " " + cx.btnGhost + " px-7"}>
                Đăng nhập
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
