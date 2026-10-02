import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";
import { CONTACT_SECTION, SITE_CONFIG } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "Privacy Policy — Lexora",
  description: "Chính sách quyền riêng tư của Lexora: dữ liệu thu thập, Google OAuth, bảo mật và cách liên hệ.",
  alternates: { canonical: "/privacy" },
  openGraph: { title: "Privacy Policy — Lexora", description: SITE_CONFIG.description, url: "/privacy", siteName: SITE_CONFIG.name, type: "website", locale: "vi_VN" },
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mt-10 text-xl font-bold tracking-[-0.01em] sm:text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 text-[0.95rem] leading-7 text-inksoft">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Lexora — trang chủ">
            <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-gold text-base font-extrabold text-white" aria-hidden="true">L</span>
            <span>
              <b className="block text-base">{SITE_CONFIG.name}</b>
              <span className="block text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-muted">{SITE_CONFIG.tagline}</span>
            </span>
          </Link>
          <nav aria-label="Điều hướng trang pháp lý" className="flex items-center gap-4 text-sm">
            <Link href="/" className="font-semibold text-ink hover:text-golddark hover:underline">Trang chủ</Link>
            <Link href="/terms" className="font-semibold text-ink hover:text-golddark hover:underline">Terms</Link>
            <Link href="/login" className="font-semibold text-ink hover:text-golddark hover:underline">Đăng nhập</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
        <h1 className="text-[clamp(1.8rem,5vw,2.6rem)] font-extrabold tracking-[-0.03em]">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted">Cập nhật lần cuối: {SITE_CONFIG.effectiveDate}</p>

        <Section id="introduction" title="1. Giới thiệu">
          <p>
            Lexora là nền tảng học từ vựng trực tuyến cho IELTS và tiếng Trung, dùng chung bộ dữ liệu từ vựng cho các
            chế độ flashcard, quiz, lặp lại ngắt quãng và kiểm tra. Chính sách này giải thích dữ liệu nào được thu thập
            khi bạn dùng Lexora, dữ liệu đó được dùng để làm gì, ai có thể tiếp cận và bạn có quyền gì.
          </p>
          <p>Chính sách áp dụng cho người dùng đăng ký tài khoản và cho quản trị viên của từng hệ thống triển khai Lexora.</p>
        </Section>

        <Section id="information-collected" title="2. Thông tin thu thập">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <b>Thông tin tài khoản:</b> tên đăng nhập, tên hiển thị và email (nếu bạn cung cấp). Mật khẩu được lưu ở
              dạng băm, không lưu dưới dạng văn bản thuần.
            </li>
            <li>
              <b>Dữ liệu từ vựng và học tập:</b> bộ từ, từ vựng, tiến độ học, lịch ôn tập, kết quả quiz, số lần sai và
              ghi chú học tập.
            </li>
            <li>
              <b>Dữ liệu vận hành:</b> thông tin kỹ thuật cần thiết cho hoạt động của ứng dụng như thời gian truy cập,
              lỗi hệ thống và nhật ký quản trị phục vụ bảo mật và chẩn đoán.
            </li>
          </ul>
        </Section>

        <Section id="google-data" title="3. Tài khoản và dữ liệu Google">
          <p>
            Khi bạn kết nối tài khoản Google, Lexora dùng <b>OAuth 2.0</b> để xin các quyền cần thiết cho tính năng
            Google Sheets Sync. Các quyền này được mô tả trung thực là <b>Google Sheets API</b> và quyền truy cập{" "}
            <b>theo từng file</b> của Drive (scope <code className="rounded bg-goldpale px-1 py-0.5 text-[0.85rem]">drive.file</code>).
            Scope này chỉ cho phép Lexora thao tác trên những file do ứng dụng tạo hoặc bạn đã chọn kết nối — không phải
            quyền truy cập toàn bộ Google Drive của bạn.
          </p>
          <p>Cụ thể, Lexora dùng dữ liệu Google cho các mục đích sau:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Tạo một Google Spreadsheet cho bộ từ vựng mà bạn chọn.</li>
            <li>Ghi từ vựng hiện tại vào spreadsheet đó kèm mã nhận dạng ổn định cho đồng bộ.</li>
            <li>Đọc dữ liệu từ spreadsheet mà bạn (hoặc Lexora) đã kết nối để đồng bộ với Lexora.</li>
            <li>Lưu các metadata cần thiết cho đồng bộ như kết nối, channel và lịch sử đồng bộ.</li>
          </ul>
          <p>
            Lexora <b>không</b> dùng dữ liệu Google để quảng cáo và <b>không</b> bán dữ liệu Google của bạn cho bất kỳ
            bên thứ ba nào. Việc xử lý dữ liệu Google chỉ phục vụ chức năng mà bạn yêu cầu.
          </p>
        </Section>

        <Section id="oauth-tokens" title="4. Thông tin đăng nhập OAuth">
          <p>
            Khi kết nối Google, Lexora lưu thông tin xác thực (access token và refresh token) trên <b>máy chủ</b> của hệ
            thống. Các giá trị nhạy cảm này được <b>mã hóa khi lưu</b> và chỉ dùng để thực hiện các chức năng Google
            Sheets.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Token không được lưu ở localStorage hay trình duyệt của bạn.</li>
            <li>Token không hiển thị cho người dùng và không nằm trong URL.</li>
            <li>Chỉ thông tin xác thực cần thiết cho việc kết nối và đồng bộ được lưu; secret của ứng dụng không được gửi tới trình duyệt.</li>
          </ul>
        </Section>

        <Section id="how-data-is-used" title="5. Cách dữ liệu được sử dụng">
          <ul className="list-disc space-y-2 pl-5">
            <li>Xác thực tài khoản và duy trì phiên đăng nhập.</li>
            <li>Cung cấp chức năng học tập: flashcard, quiz, điền từ, nghe viết, phát âm, lặp lại ngắt quãng.</li>
            <li>Quản lý bộ từ vựng và tiến độ của từng người học.</li>
            <li>Đồng bộ giữa Google Sheets và Lexora khi bạn kết nối Google.</li>
            <li>Sao lưu dữ liệu do quản trị viên bật (khi tính năng được cấu hình).</li>
            <li>Bảo mật hệ thống: kiểm soát truy cập, phân quyền admin, kiểm toán thao tác quản trị.</li>
          </ul>
        </Section>

        <Section id="data-sharing" title="6. Chia sẻ dữ liệu">
          <p>Lexora chỉ chia sẻ dữ liệu với các dịch vụ vận hành thiết yếu, cụ thể:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li><b>Google APIs</b> — chỉ dữ liệu cần cho tính năng Google Sheets mà bạn yêu cầu (tạo spreadsheet, đọc và đồng bộ file đã kết nối).</li>
            <li><b>Nền tảng hosting và cơ sở dữ liệu</b> — Lexora được triển khai trên Vercel và dùng PostgreSQL để lưu trữ dữ liệu ứng dụng.</li>
            <li><b>Nhà cung cấp email (SMTP)</b> — chỉ dùng khi tính năng email được cấu hình, cho email đặt lại mật khẩu và thông báo sao lưu cho quản trị viên.</li>
            <li><b>Nhà cung cấp lưu trữ file (Vercel Blob)</b> — dùng khi tính năng sao lưu được bật để lưu trữ bản sao lưu riêng tư.</li>
            <li><b>Dịch vụ AI</b> — nếu quản trị viên bật tính năng gợi ý phiên âm IPA, một nội dung tối thiểu (từ vựng) có thể được gửi tới dịch vụ AI được cấu hình.</li>
          </ul>
          <p>
            Lexora không bán dữ liệu cá nhân hay dữ liệu Google của bạn cho bất kỳ bên thứ ba nào. Dữ liệu có thể được
            chia sẻ theo yêu cầu hợp pháp của cơ quan có thẩm quyền.
          </p>
        </Section>

        <Section id="data-retention" title="7. Thời gian lưu trữ">
          <p>Dữ liệu được giữ lại cho tới khi:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>bạn hoặc quản trị viên của hệ thống xóa tài khoản, bộ từ vựng hoặc dữ liệu liên quan;</li>
            <li>hoặc quản trị viên xóa dữ liệu theo yêu cầu của bạn;</li>
            <li>hoặc dữ liệu không còn cần cho mục đích đã thu thập.</li>
          </ul>
          <p>
            Bản sao lưu (nếu tính năng sao lưu được bật) được lưu riêng tư trên hệ thống và có cơ chế hết hạn liên kết tải
            khi được gửi qua email cho quản trị viên.
          </p>
        </Section>

        <Section id="security" title="8. Bảo mật">
          <ul className="list-disc space-y-2 pl-5">
            <li>Xác thực phiên dùng cookie an toàn (httpOnly, không truy cập được bằng JavaScript).</li>
            <li>Mật khẩu được lưu ở dạng băm, không lưu văn bản thuần.</li>
            <li>Thông tin xác thực Google được mã hóa khi lưu trên máy chủ.</li>
            <li>Phân quyền theo vai trò (student / admin) và kiểm soát truy cập theo folder cho quản trị viên.</li>
            <li>Nhật ký kiểm toán các thao tác quản trị quan trọng.</li>
          </ul>
          <p>Không có hệ thống nào là tuyệt đối an toàn. Lexora áp dụng các biện pháp hợp lý nhưng bạn cũng nên bảo mật tài khoản của mình.</p>
        </Section>

        <Section id="your-rights" title="9. Quyền của bạn và xóa tài khoản">
          <p>Bạn có thể:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>cập nhật thông tin tài khoản của mình trong ứng dụng;</li>
            <li>ngắt kết nối tài khoản Google trong cài đặt tích hợp Google Sheets;</li>
            <li>yêu cầu truy cập, sửa đổi hoặc xóa dữ liệu cá nhân của bạn.</li>
          </ul>
          <p>
            Nếu hệ thống của bạn không hỗ trợ tự xóa tài khoản, hãy liên hệ quản trị viên của hệ thống Lexora mà bạn đang
            sử dụng để yêu cầu xóa hoặc cập nhật dữ liệu.
          </p>
        </Section>

        <Section id="google-api-services" title="10. Google API Services User Data">
          <p>
            Lexora chỉ xử lý dữ liệu Google để cung cấp các tính năng mà bạn chủ động yêu cầu: tạo spreadsheet, đọc và
            đồng bộ dữ liệu từ những spreadsheet đã kết nối, và lưu metadata cần thiết cho đồng bộ. Dữ liệu Google không
            được sử dụng để quảng cáo, không được bán, và không được dùng cho mục đích khác ngoài các chức năng đã mô tả
            trong chính sách này.
          </p>
          <p>
            Lexora không tuyên bố rằng ứng dụng này đã được Google phê duyệt hay xác minh. Việc Google xác minh, nếu có,
            phụ thuộc vào quy trình riêng của Google.
          </p>
        </Section>

        <Section id="contact" title={CONTACT_SECTION.heading}>
          <p>{CONTACT_SECTION.body}</p>
          {SITE_CONFIG.contactEmail ? (
            <p>
              Email liên hệ:{" "}
              <a href={`mailto:${SITE_CONFIG.contactEmail}`} className="font-semibold text-golddark hover:underline">
                {SITE_CONFIG.contactEmail}
              </a>
            </p>
          ) : (
            <p>
              Chưa có địa chỉ email liên hệ công bố trên trang này. Nếu bạn cần một kênh liên hệ chính thức, vui lòng
              liên hệ quản trị viên của hệ thống Lexora mà bạn đang sử dụng.
            </p>
          )}
        </Section>

        <Section id="changes" title="11. Thay đổi chính sách này">
          <p>
            Chính sách này có thể được cập nhật để phản ánh thay đổi về sản phẩm, tính năng hoặc nghĩa vụ pháp lý. Phiên
            bản mới sẽ được đăng tải trên trang này cùng ngày có hiệu lực.
          </p>
        </Section>

        <Section id="effective-date" title="12. Ngày có hiệu lực">
          <p>Chính sách này có hiệu lực từ ngày {SITE_CONFIG.effectiveDate}.</p>
        </Section>

        <nav aria-label="Điều hướng trang pháp lý" className="mt-12 flex flex-wrap gap-4 border-t border-line pt-6 text-sm">
          <Link href="/" className="font-semibold text-golddark hover:underline">Trang chủ</Link>
          <Link href="/terms" className="font-semibold text-golddark hover:underline">Terms of Service</Link>
          <Link href="/login" className="font-semibold text-golddark hover:underline">Đăng nhập</Link>
        </nav>
      </main>

      <PublicFooter />
    </div>
  );
}
