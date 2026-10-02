# Google OAuth setup — Lexora

Tài liệu này mô tả cách khai báo **các trang công khai** (homepage, Privacy Policy, Terms of Service) và cấu hình OAuth client cho Lexora / Vocabulary Exam.

Các URL dưới đây đã được triển khai trên production và **phải truy cập được khi chưa đăng nhập** (Chrome Incognito):

| Vai trò | URL |
|---|---|
| Application home page | `https://vocabulary-exam.vercel.app/` |
| Application privacy policy | `https://vocabulary-exam.vercel.app/privacy` |
| Application terms of service | `https://vocabulary-exam.vercel.app/terms` |
| OAuth redirect URI | `https://vocabulary-exam.vercel.app/api/admin/google-sheets/oauth/callback` |

> Không ghi giá trị giả cho redirect URI. Redirect URI phải **chính xác từng ký tự** (scheme, host, path), khớp với biến `GOOGLE_REDIRECT_URI`.

---

## 1. Google Cloud Console — OAuth consent screen

1. Mở [Google Cloud Console](https://console.cloud.google.com/) → chọn (hoặc tạo) dự án.
2. **APIs & Services → OAuth consent screen**.
3. Chọn **User type**:
   - `External`: cho người dùng Google bên ngoài Google Workspace.
   - `Internal`: chỉ khi toàn bộ người dùng thuộc cùng một Google Workspace.
4. **App information**:
   - **App name**: `Lexora` (hoặc tên hiển thị bạn muốn).
   - **User support email**: email được hỗ trợ người dùng.
   - **Application home page**: `https://vocabulary-exam.vercel.app/`
   - **Application privacy policy link**: `https://vocabulary-exam.vercel.app/privacy`
   - **Application terms of service link**: `https://vocabulary-exam.vercel.app/terms`
   - **Developer contact information**: email quản trị (bắt buộc với Google).
5. **Scopes** — khai đúng scope mà code đang yêu cầu (xem `src/lib/googleSheets/auth.ts`):
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/drive.file`
6. **Authorized domains**: thêm `vocabulary-exam.vercel.app` (và domain khác nếu có).
7. **Test users**: thêm các tài khoản Google dùng để thử trong thời gian ở trạng thái *Testing*. Khi ở *Testing*, chỉ test users được cấp quyền; ứng dụng ngoài trạng thái này sẽ hiện cảnh báo của Google. Việc **xác minh (verification)** là quy trình riêng của Google — trang này **không** tuyên bố ứng dụng đã được Google phê duyệt.

> **Lưu ý contact:** trang Privacy Policy/ Terms hiện **chưa** công bố email liên hệ vì repo chưa có địa chỉ chính thức. Trước khi nộp xác minh, hãy điền một địa chỉ thật vào `SITE_CONFIG.contactEmail` trong `src/lib/siteConfig.ts` (hoặc liên hệ qua kênh hỗ trợ của hệ thống). Không tự tạo email giả.

---

## 2. APIs cần bật

**APIs & Services → Library → Enable**:

- **Google Sheets API**
- **Google Drive API**

Không bật quyền khác ngoài hai scope ở trên — Lexora không đọc toàn bộ Google Drive.

---

## 3. OAuth client (Credentials)

**APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**:

- **Authorized redirect URIs**:
  ```text
  https://vocabulary-exam.vercel.app/api/admin/google-sheets/oauth/callback
  ```
- Ghi lại **Client ID** và **Client secret** — đưa vào biến môi trường ở bước 4.

Khi phát triển local, dùng tunnel (ngrok / cloudflared) và thêm redirect URI tương ứng, đổi `GOOGLE_REDIRECT_URI` cho khớp.

---

## 4. Environment variables (Vercel → Settings → Environment Variables)

```bash
GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="..."
# Phải khớp chính xác redirect URI đã đăng ký ở trên
GOOGLE_REDIRECT_URI="https://vocabulary-exam.vercel.app/api/admin/google-sheets/oauth/callback"
# Public base URL cho Drive push notifications
GOOGLE_WEBHOOK_BASE_URL="https://vocabulary-exam.vercel.app"
# Dùng để ký channel token (openssl rand -hex 32)
GOOGLE_WEBHOOK_TOKEN_SECRET="..."
# Khóa mã hóa OAuth token khi lưu (openssl rand -hex 32)
GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY="..."
# Dùng cho Vercel Cron
CRON_SECRET="..."
```

Biến `GOOGLE_CLIENT_SECRET`, `GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY`, `GOOGLE_WEBHOOK_TOKEN_SECRET` là **secret** — không đưa vào code, không commit, không gửi lên frontend.

---

## 5. Drive push notifications (webhook)

1. Đăng ký `https://vocabulary-exam.vercel.app/api/webhooks/google-drive` là đích nhận push notification (Google Drive watch channel).
2. Lexora tự tạo watch channel khi kết nối spreadsheet, rồi tự renew theo cron `0 18 * * *` (Vercel Hobby chỉ cho cron chạy 1 lần/ngày; xem `vercel.json`).
3. Webhook **idempotent**: kiểm tra channel id, resource id, message number.

---

## 6. Xác minh sau khi deploy

Mở trong **Chrome Incognito** (chưa đăng nhập) và kiểm tra:

- `https://vocabulary-exam.vercel.app/` → **HTTP 200**
- `https://vocabulary-exam.vercel.app/privacy` → **HTTP 200**
- `https://vocabulary-exam.vercel.app/terms` → **HTTP 200**

Đồng thời kiểm tra các route được bảo vệ vẫn không bị public:

- `/admin` → redirect về `/login` khi chưa đăng nhập
- `/api/admin/*` → `307` về `/login` (hoặc `403`)
- `/dashboard`, `/study` → `307` về `/login`

Các trang public được middleware cho phép truy cập khi chưa có session; logic bảo vệ admin/student và `/api/admin` không thay đổi (xem `src/middleware.ts` và `src/middleware.test.ts`).

---

## 7. Files liên quan

| File | Vai trò |
|---|---|
| `src/lib/siteConfig.ts` | Tên miền, URL public, contact (server-only) |
| `src/app/page.tsx` | Public homepage (server-rendered) |
| `src/app/privacy/page.tsx` | Privacy Policy |
| `src/app/terms/page.tsx` | Terms of Service |
| `src/components/PublicFooter.tsx` | Footer dùng chung cho trang public |
| `src/middleware.ts` | Public routes + kiểm tra bảo vệ |
| `src/lib/siteConfig.test.ts` | Test public routes, content, provider list |
| `docs/google-sheets-sync.md` | Chi tiết Google Sheets Sync + OAuth flow |
