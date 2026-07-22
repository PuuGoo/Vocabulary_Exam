# IELTS Vocab Check

Hệ thống kiểm tra từ vựng luyện thi IELTS — có đăng nhập phân quyền (admin/học sinh),
trang quản trị, import từ vựng bằng CSV/Excel, và giao diện làm bài cho học sinh.

Đây là ứng dụng **production thật sự**: Next.js (App Router) + PostgreSQL + Drizzle ORM,
không dùng localStorage hay dữ liệu giả — mọi thứ đọc/ghi qua API vào database thật,
đã được kiểm thử end-to-end với PostgreSQL trước khi bàn giao.

## Công nghệ

- **Next.js 14** (App Router, TypeScript) — vừa là frontend vừa là backend (Route Handlers)
- **PostgreSQL** + **Drizzle ORM** (không cần binary engine như Prisma, nhẹ và dễ deploy)
- **JWT (jose)** lưu trong cookie `httpOnly` để đăng nhập, **bcrypt** để băm mật khẩu
- **Middleware** bảo vệ route theo vai trò (admin/học sinh) ở tầng Edge
- **Tailwind CSS** cho giao diện
- Import **CSV** (PapaParse) và **Excel** (SheetJS/xlsx)

## Tính năng

- Đăng nhập / đăng ký (học sinh tự đăng ký, admin tạo tài khoản qua trang quản trị)
- Phân quyền: `admin` (toàn quyền) và `student` (chỉ làm bài + xem lịch sử của mình)
- **Quên mật khẩu / đổi mật khẩu**: người dùng tự đổi mật khẩu trong "Cài đặt"; quên mật khẩu có thể gửi email
  (nếu cấu hình SMTP) hoặc admin cấp link đặt lại thủ công trong trang Người dùng
- **Trang Admin**
  - Quản lý bộ từ vựng (tạo/xem/sửa/xoá, thêm từ thủ công)
  - Nhập dữ liệu hàng loạt từ **.csv** hoặc **.xlsx**
  - **Lớp học**: tạo lớp, thêm/xoá học sinh; gán một bộ từ vựng riêng cho lớp cụ thể (chỉ học sinh trong lớp
    mới thấy) hoặc để công khai cho mọi học sinh
  - **Phiên âm IPA tự động bằng Gemini**: bấm "🔤 Lấy phiên âm còn thiếu" để AI tự sinh phiên âm chuẩn quốc tế
    cho từng từ (gộp nhiều từ trong 1 lần gọi để tiết kiệm quota), hoặc sửa tay từng từ nếu muốn khớp chính xác
    với một nguồn cụ thể (VD Cambridge Dictionary)
  - Quản lý người dùng (tạo, phân quyền, xoá, cấp lại mật khẩu)
  - Xem tổng hợp kết quả làm bài của toàn bộ học sinh, **xuất Excel** hoặc **in/xuất PDF**
- **Giao diện học sinh**
  - **Học bài (flashcard)**: lật thẻ xem nghĩa ↔ đáp án (V1/V2/V3 hoặc từ tiếng Anh), nghe phát âm, tự đánh giá
    "Đã nhớ" / "Chưa nhớ" cho từng thẻ, xáo trộn hoặc học lại từ đầu — không tính điểm, chỉ để ôn trước khi kiểm tra
  - Chọn bộ từ vựng, làm bài theo nhóm 10 từ
  - Hai loại bộ từ: Động từ bất quy tắc (điền V1/V2/V3) và Từ vựng IELTS (điền từ hoặc trắc nghiệm)
  - **Thi thử có tính giờ**: chọn số phút, đồng hồ đếm ngược, tự nộp bài khi hết giờ
  - **Nghe phát âm** (Text-to-Speech) cho từ vựng và đáp án
  - **Ôn từ sai**: hệ thống tự động gom các từ làm sai để ôn lại dạng flashcard, đánh dấu "đã thuộc" khi ôn xong
  - **Bảng xếp hạng** giữa các học sinh theo độ chính xác
  - Xem lịch sử làm bài của bản thân

## Chạy ở local

## Web và Android

Ứng dụng dùng chung một máy chủ Next.js và database PostgreSQL cho cả web lẫn Android.

- Cài như app ngay trên Android: triển khai website bằng HTTPS, mở bằng Chrome rồi chọn **Thêm vào màn hình chính**. Đây là PWA nhẹ, không cần Android SDK.
- Android native: mã nguồn Capacitor nằm trong `android/`. Cấu hình và lệnh chạy chi tiết xem tại [`docs/ANDROID.md`](docs/ANDROID.md).
- Build APK không chiếm dung lượng máy: dùng workflow [Build Android app](.github/workflows/android.yml) trên GitHub Actions, với secret `CAPACITOR_SERVER_URL` là URL HTTPS của website.


### 1. Cài đặt

```bash
npm install
```

### 2. Chuẩn bị PostgreSQL

Dùng Docker Compose có sẵn:

```bash
docker compose up -d
```

Việc này sẽ chạy Postgres tại `localhost:5432` với:
- user: `ielts`, password: `ielts`, database: `ielts_vocab`

(Có thể dùng Postgres cài sẵn trên máy hoặc dịch vụ đám mây — chỉ cần đúng `DATABASE_URL`.)

### 3. Khai báo biến môi trường

Sao chép `.env.example` thành `.env` và điền giá trị thật:

```bash
cp .env.example .env
```

```
DATABASE_URL="postgresql://ielts:ielts@localhost:5432/ielts_vocab"
JWT_SECRET="<chuỗi random dài, tạo bằng: openssl rand -base64 48>"
```

### 4. Khởi tạo schema + dữ liệu mẫu

```bash
npm run db:push     # tạo bảng theo schema Drizzle
npm run db:seed     # tạo tài khoản mặc định + bộ từ vựng mẫu (157 động từ bất quy tắc, v.v.)
```

### 5. Chạy dev server

```bash
npm run dev
```

Mở http://localhost:3000 — tài khoản mặc định:

- Admin: `admin / admin123`
- Học sinh: `hocsinh / 123456`

**Đổi mật khẩu admin ngay sau khi deploy thật** (qua trang quản lý người dùng, hoặc xoá và tạo tài khoản admin mới rồi xoá tài khoản `admin` mặc định).

## Build & chạy production (không Docker)

```bash
npm run build
npm run start
```

(Ứng dụng build ở chế độ `output: standalone`. Nếu chạy `npm run start` báo cảnh báo,
hãy chạy trực tiếp: `node .next/standalone/server.js`, đồng thời copy thư mục
`.next/static` vào `.next/standalone/.next/static` và `public/` vào `.next/standalone/public/`
— xem `Dockerfile` để có ví dụ đầy đủ.)

## Triển khai production thật

### Phương án A — Vercel + Neon/Supabase (khuyến nghị, dễ nhất)

1. Tạo database Postgres miễn phí tại [Neon](https://neon.tech) hoặc [Supabase](https://supabase.com), lấy `DATABASE_URL`.
2. Push code lên GitHub, import vào [Vercel](https://vercel.com).
3. Trong Vercel → Project Settings → Environment Variables, thêm:
   - `DATABASE_URL`
   - `JWT_SECRET`
4. Deploy. Sau khi deploy lần đầu, chạy migration + seed một lần từ máy local
   (trỏ `DATABASE_URL` vào database production):
   ```bash
   npm run db:push
   npm run db:seed
   ```

### Phương án B — Railway / Render (có cả app lẫn Postgres)

1. Tạo Postgres service trên Railway/Render, lấy connection string.
2. Tạo Web Service từ repo này, build command `npm run build`, start command `npm run start`.
3. Khai báo `DATABASE_URL` và `JWT_SECRET` trong biến môi trường của service.
4. Chạy `npm run db:push && npm run db:seed` (Railway/Render đều hỗ trợ chạy one-off command/shell).

### Phương án C — Docker tự triển khai trên VPS

```bash
docker build -t ielts-vocab .
docker run -d --name ielts-vocab \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@your-db-host:5432/ielts_vocab" \
  -e JWT_SECRET="<random-secret>" \
  ielts-vocab
```

Chạy Postgres riêng (VD bằng `docker-compose.yml` có sẵn, hoặc dịch vụ quản lý),
sau đó chạy migration + seed từ một máy có quyền truy cập `DATABASE_URL`:

```bash
DATABASE_URL="..." npm run db:push
DATABASE_URL="..." npm run db:seed
```

Nên đặt Nginx/Caddy phía trước để có HTTPS (Let's Encrypt) và domain riêng.

## Biến môi trường

| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `DATABASE_URL` | Có | Connection string PostgreSQL |
| `JWT_SECRET` | Có | Chuỗi bí mật ký JWT phiên đăng nhập — **phải đủ dài & ngẫu nhiên** trong production |
| `NODE_ENV` | Không | `production` khi deploy thật (bật cookie `Secure`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Không | Cấu hình gửi email đặt lại mật khẩu. Nếu bỏ trống, tính năng "quên mật khẩu" vẫn hoạt động nhưng sẽ cần admin cấp link đặt lại thủ công (trang Người dùng → "Tạo link đặt lại mật khẩu") |
| `GEMINI_API_KEY` | Không | Một API key Gemini duy nhất. Cho phép admin tự động lấy phiên âm IPA. Lấy miễn phí tại https://aistudio.google.com/apikey |
| `GEMINI_API_KEYS` | Không | **Khuyến nghị nếu hay bị lỗi vượt hạn mức**: nhiều API key cách nhau bằng dấu phẩy, VD `key1,key2,key3`. Hệ thống tự động xoay vòng — khi key hiện tại bị giới hạn (429), lập tức chuyển sang key tiếp theo thay vì phải chờ. Nếu biến này được đặt, nó sẽ được ưu tiên dùng thay cho `GEMINI_API_KEY` |

### Lấy Gemini API key (miễn phí) và xoay vòng nhiều key

1. Vào https://aistudio.google.com/apikey, đăng nhập bằng tài khoản Google.
2. Bấm **"Create API key"** → chọn hoặc tạo một Google Cloud project → copy API key.
3. **Để tăng hạn mức**, lặp lại bước 2 với **các Google Cloud project khác nhau** (hoặc tài khoản Google khác) —
   mỗi project có hạn mức miễn phí riêng, nên nhiều key từ nhiều project = nhiều hạn mức cộng lại. Nếu tạo
   nhiều key nhưng cùng chung 1 project, hạn mức vẫn dùng chung và việc xoay vòng sẽ không giúp ích nhiều.
4. Thêm vào `.env` (hoặc biến môi trường trên Vercel/Railway) — dùng `GEMINI_API_KEYS` nếu có từ 2 key trở lên:
   ```
   GEMINI_API_KEYS="AIzaSy_key_1,AIzaSy_key_2,AIzaSy_key_3"
   ```
   hoặc chỉ 1 key:
   ```
   GEMINI_API_KEY="AIzaSy..."
   ```
5. Redeploy. Vào **Admin → Bộ từ vựng → Xem/Sửa một bộ** → bấm **"🔤 Lấy phiên âm còn thiếu (Gemini)"**.

Khi lấy phiên âm hàng loạt cho cả bộ, hệ thống vẫn nghỉ 3 giây giữa các lô 40 từ để hạn chế bị giới hạn dù đã xoay vòng key; nếu tất cả các key đều bị giới hạn cùng lúc, hệ thống tự đợi rồi thử lại (tối đa 2 lần) trước khi báo lỗi.

## Ghi chú bảo mật khi lên production

- Đổi `JWT_SECRET` thành giá trị ngẫu nhiên đủ mạnh, không dùng giá trị mẫu.
- Đổi/xoá mật khẩu tài khoản `admin / admin123` mặc định ngay sau khi seed.
- Bắt buộc chạy sau **HTTPS** (Vercel/Railway tự có; nếu tự host cần Nginx/Caddy + Let's Encrypt) —
  cookie phiên đăng nhập được đánh dấu `Secure` khi `NODE_ENV=production`, chỉ gửi qua HTTPS.
- Database nên bật backup tự động (Neon/Supabase/Railway đều hỗ trợ).
- Cân nhắc giới hạn số lần đăng nhập sai (rate limiting) nếu mở public rộng rãi — hiện tại
  chưa có rate limit ở tầng ứng dụng.

## Cấu trúc dự án

```
src/
  db/            # Drizzle schema, kết nối DB, seed data
  lib/           # auth (bcrypt + session), session (JWT edge-safe cho middleware)
  middleware.ts  # bảo vệ route theo đăng nhập + vai trò
  app/
    login/, register/          # trang công khai
    admin/                     # khu vực admin (layout kiểm tra role)
      sets/ import/ users/ results/
    (student)/                 # khu vực học sinh (route group, layout riêng)
      study/ history/ quiz/[setId]/
    api/                       # toàn bộ Route Handlers (REST API nội bộ)
```

## Định dạng file import CSV/Excel

**Từ vựng IELTS** — cột: `term`, `meaning`, `example` (tuỳ chọn), `wtype` (tuỳ chọn)

**Động từ bất quy tắc** — cột: `meaning`, `v1`, `v2`, `v3`

Dòng đầu tiên là tên cột (viết thường, không dấu).
