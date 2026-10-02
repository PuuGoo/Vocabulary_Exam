import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";
import { CONTACT_SECTION, SITE_CONFIG } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "Terms of Service — Lexora",
  description: "Điều khoản sử dụng của Lexora: tài khoản, nội dung, Google Sheets, dịch vụ bên thứ ba và trách nhiệm.",
  alternates: { canonical: "/terms" },
  openGraph: { title: "Terms of Service — Lexora", description: SITE_CONFIG.description, url: "/terms", siteName: SITE_CONFIG.name, type: "website", locale: "vi_VN" },
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mt-10 text-xl font-bold tracking-[-0.01em] sm:text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 text-[0.95rem] leading-7 text-inksoft">{children}</div>
    </section>
  );
}

export default function TermsOfServicePage() {
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
            <Link href="/privacy" className="font-semibold text-ink hover:text-golddark hover:underline">Privacy</Link>
            <Link href="/login" className="font-semibold text-ink hover:text-golddark hover:underline">Đăng nhập</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8">
        <h1 className="text-[clamp(1.8rem,5vw,2.6rem)] font-extrabold tracking-[-0.03em]">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted">Cập nhật lần cuối: {SITE_CONFIG.effectiveDate}</p>

        <Section id="acceptance" title="1. Chấp nhận điều khoản">
          <p>
            Bằng việc truy cập hoặc sử dụng Lexora (bao gồm cả trang web và các tính năng đi kèm), bạn đồng ý với các
            điều khoản sử dụng này và{" "}
            <Link href="/privacy" className="font-semibold text-golddark hover:underline">Privacy Policy</Link> của chúng
            tôi. Nếu bạn không đồng ý, vui lòng không sử dụng dịch vụ.
          </p>
        </Section>

        <Section id="accounts" title="2. Tài khoản">
          <ul className="list-disc space-y-2 pl-5">
            <li>Bạn phải cung cấp thông tin đăng ký chính xác và giữ bí mật thông tin đăng nhập của mình.</li>
            <li>Bạn chịu trách nhiệm về mọi hoạt động diễn ra dưới tài khoản của bạn.</li>
            <li>Vui lòng thông báo ngay cho quản trị viên nếu bạn nghi ngờ tài khoản bị truy cập trái phép.</li>
            <li>Một số hệ thống triển khai có thể cho phép quản trị viên tạo và quản lý tài khoản người dùng thay cho bạn.</li>
          </ul>
        </Section>

        <Section id="appropriate-use" title="3. Sử dụng phù hợp">
          <p>Bạn đồng ý không sử dụng Lexora cho các mục đích sau:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>vi phạm pháp luật hoặc quyền của người khác;</li>
            <li>gửi nội dung độc hại, quấy rối, lừa đảo hoặc gây tổn hại cho hệ thống;</li>
            <li>cố gắng truy cập trái phép dữ liệu, tài khoản hoặc hạ tầng của Lexora hoặc người dùng khác;</li>
            <li>can thiệp hoặc làm gián đoạn hoạt động của dịch vụ, kể cả bằng các công cụ tự động gây quá tải;</li>
            <li>sử dụng dịch vụ để spam, phát tán phần mềm độc hại hoặc thu thập dữ liệu trái phép.</li>
          </ul>
        </Section>

        <Section id="content-ownership" title="4. Sở hữu nội dung từ vựng">
          <p>
            Bạn giữ quyền sở hữu nội dung (từ vựng, bộ từ, câu hỏi, tài liệu và các tài nguyên học tập) mà bạn tạo hoặc
            nhập vào Lexora. Bằng việc nhập nội dung, bạn cấp cho Lexora quyền cần thiết để lưu trữ, xử lý và hiển thị nội
            dung đó nhằm cung cấp các tính năng mà bạn yêu cầu, bao gồm cả việc tạo và đồng bộ Google Sheet khi bạn kết
            nối Google.
          </p>
        </Section>

        <Section id="user-generated-content" title="5. Nội dung do người dùng tạo">
          <p>
            Bạn chịu trách nhiệm về nội dung bạn tải lên, nhập liệu hoặc chia sẻ thông qua Lexora. Bạn không nên đăng
            nội dung vi phạm pháp luật hoặc quyền của bên thứ ba. Lexora có thể xóa hoặc hạn chế nội dung vi phạm điều
            khoản này theo quyết định hợp lý của quản trị viên hệ thống.
          </p>
        </Section>

        <Section id="google-sheets" title="6. Tích hợp Google Sheets">
          <p>
            Lexora có thể tạo Google Spreadsheet cho một bộ từ vựng, ghi từ vựng vào spreadsheet đó, đọc dữ liệu từ
            spreadsheet đã kết nối và đồng bộ thay đổi giữa Google Sheets và Lexora. Khi bạn kết nối Google, bạn thừa
            nhận rằng các thao tác này được thực hiện trên dữ liệu Google mà bạn đã cho phép Lexora truy cập thông qua
            OAuth, và bạn chịu trách nhiệm về việc chia sẻ quyền truy cập spreadsheet của mình.
          </p>
          <p>
            Bạn có thể ngắt kết nối Google Sheets bất kỳ lúc nào trong cài đặt của Lexora. Việc ngắt kết nối sẽ không tự
            động xóa dữ liệu trên Google Spreadsheet của bạn.
          </p>
        </Section>

        <Section id="third-party-services" title="7. Dịch vụ bên thứ ba">
          <p>
            Lexora sử dụng các dịch vụ bên thứ ba để vận hành, bao gồm dịch vụ lưu trữ, cơ sở dữ liệu, email và (khi được
            cấu hình) dịch vụ AI cho gợi ý phiên âm. Việc bạn sử dụng các tính năng liên quan đồng nghĩa bạn chấp nhận các
            điều khoản của các dịch vụ đó. Lexora không chịu trách nhiệm về nội dung hoặc chính sách của bên thứ ba.
          </p>
        </Section>

        <Section id="availability" title="8. Tính khả dụng">
          <p>
            Chúng tôi cố gắng giữ Lexora hoạt động ổn định nhưng không cam kết dịch vụ luôn khả dụng mà không gián đoạn.
            Bảo trì, sự cố kỹ thuật hoặc các sự kiện ngoài tầm kiểm soát có thể tạm thời làm gián đoạn dịch vụ. Lexora có
            thể tạm ngừng cung cấp một phần hoặc toàn bộ tính năng để bảo trì hoặc cập nhật.
          </p>
        </Section>

        <Section id="suspension" title="9. Tạm ngưng và chấm dứt">
          <p>
            Bạn có thể ngừng sử dụng dịch vụ bất kỳ lúc nào. Lexora hoặc quản trị viên của hệ thống triển khai có thể
            tạm ngưng hoặc chấm dứt quyền truy cập của bạn nếu bạn vi phạm các điều khoản này, gây rủi ro bảo mật hoặc
            lạm dụng dịch vụ. Trong trường hợp đó, bạn có thể được yêu cầu liên hệ quản trị viên để biết thêm chi tiết.
          </p>
        </Section>

        <Section id="liability" title="10. Giới hạn trách nhiệm">
          <p>
            Lexora được cung cấp trên cơ sở &quot;nguyên trạng&quot; và &quot;có sẵn&quot;. Trong phạm vi pháp luật cho phép, Lexora không
            chịu trách nhiệm về các thiệt hại gián tiếp, ngẫu nhiên hoặc hệ quả phát sinh từ việc sử dụng hoặc không thể
            sử dụng dịch vụ, bao gồm mất dữ liệu hoặc lợi nhuận. Trách nhiệm tổng thể (nếu có) được giới hạn ở mức tối đa
            do pháp luật điều chỉnh cho phép.
          </p>
        </Section>

        <Section id="changes-to-service" title="11. Thay đổi dịch vụ">
          <p>
            Chúng tôi có thể cập nhật, thay đổi hoặc ngừng cung cấp một phần hoặc toàn bộ dịch vụ bất kỳ lúc nào để cải
            thiện sản phẩm hoặc đáp ứng yêu cầu kỹ thuật. Nếu thay đổi ảnh hưởng đáng kể đến cách bạn sử dụng dịch vụ, chúng
            tôi khuyến khích bạn xem lại điều khoản này.
          </p>
        </Section>

        <Section id="changes-to-terms" title="12. Thay đổi điều khoản">
          <p>
            Các điều khoản này có thể được cập nhật định kỳ. Phiên bản mới sẽ được đăng tải trên trang này cùng ngày có
            hiệu lực. Việc tiếp tục sử dụng Lexora sau khi điều khoản được cập nhật đồng nghĩa bạn chấp nhận phiên bản mới.
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

        <nav aria-label="Điều hướng trang pháp lý" className="mt-12 flex flex-wrap gap-4 border-t border-line pt-6 text-sm">
          <Link href="/" className="font-semibold text-golddark hover:underline">Trang chủ</Link>
          <Link href="/privacy" className="font-semibold text-golddark hover:underline">Privacy Policy</Link>
          <Link href="/login" className="font-semibold text-golddark hover:underline">Đăng nhập</Link>
        </nav>
      </main>

      <PublicFooter />
    </div>
  );
}
