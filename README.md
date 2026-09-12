# IELTS Vocab Check

## Nền tảng đa ngôn ngữ

Lexora dùng chung hệ thống bộ từ, tiến độ, bookmark, mistakes và chia sẻ cho mọi ngôn ngữ. Hiện nền tảng hỗ trợ Tiếng Anh (`languageCode=en`) và Tiếng Trung Quốc / Mandarin (`type=language_vocab`, `languageCode=zh-CN`).

Trong bộ tiếng Trung, `term` là chữ Hán chính, `alternateTerm` là dạng phồn thể tùy chọn, `pronunciation` là Pinyin và `meaning` là nghĩa tiếng Việt. File import chấp nhận các cột `Chữ Hán`, `Phồn thể`, `Pinyin`, `Nghĩa`, `Loại từ`, `Lượng từ`, `HSK`, `Ví dụ`, `Pinyin ví dụ`, `Nghĩa ví dụ` cùng các tên field chuẩn tiếng Anh tương ứng.

Điền chữ Hán và Điền Pinyin là hai target độc lập: người học không bao giờ phải nhập cả hai trong một ô. Chấm Pinyin nghiêm ngặt chấp nhận dấu thanh (`xuéxí`) hoặc số thanh (`xue2xi2`); chế độ thư giãn chấp nhận `xuexi`. Admin/import tự đổi Pinyin có số sang dạng dấu để hiển thị nhưng không tự đoán thanh cho dữ liệu `xuexi`. Các dạng `ü`, `v`, `u:` và ký tự định dạng ẩn từ Excel/WPS/Google Sheets được chuẩn hóa. Sentence mode hiện được ẩn với Mandarin cho đến khi có tokenizer phù hợp. Muốn thêm ngôn ngữ sau này, mở rộng registry tại `src/lib/languages.ts` và bộ chấm tương ứng, không tạo progress hay quiz engine riêng.

### Học thích ứng tiếng Trung

Tiến độ chi tiết được lưu độc lập theo kỹ năng (nghĩa, chữ Hán, Pinyin, thanh điệu, nghe và nói) bên dưới cùng `wordId`; nút Đã nhớ/Chưa nhớ và lịch spaced repetition cũ vẫn được giữ nguyên. Smart Review kết hợp lịch đến hạn, mistakes và kỹ năng có bằng chứng yếu để xếp ưu tiên. Chế độ `Thanh điệu` chỉ nhận từ có Pinyin phân tích được; `Điền từ trong câu` chỉ dùng ví dụ hiện có chứa đúng một lần từ đích. Dữ liệu cũ không được tự gán điểm mastery.

Từ nhiều cách đọc có thể dùng `word_senses` (ví dụ `行` với `xíng` và `háng`) mà không tách word/progress. Từ đơn giản tiếp tục dùng trực tiếp `words.pronunciation`, `words.meaning` và `words.example` như trước.

## Vocabulary pattern syntax

Với hàng từ vựng có `wtype=pattern`, dùng dấu `;` để tách các cấu trúc đều bắt
buộc trong bài Điền từ, và dùng `/` cho các biến thể trong cùng một cấu trúc.
Ví dụ: `sth/sb frustrates sb; sb is frustrated with sth/sb`. Dữ liệu này vẫn là
một word row, một flashcard và một điểm. Với mọi `wtype` khác, dấu `;` tiếp tục
giữ semantics Điền từ cũ.

Hệ thống kiểm tra từ vựng luyện thi IELTS — có đăng nhập phân quyền (admin/học sinh),
trang quản trị, import từ vựng bằng CSV/Excel, và giao diện làm bài cho học sinh.

Đây là ứng dụng **production thật sự**: Next.js (App Router) + PostgreSQL + Drizzle ORM.
Dữ liệu chính được lưu trong PostgreSQL và đọc/ghi qua API. `localStorage` chỉ được sử dụng cho
UI preferences, draft và khả năng khôi phục phiên cục bộ khi phù hợp; không thay thế dữ liệu nghiệp vụ trong database.

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

### Định dạng nâng cao (tuỳ chọn, vẫn tương thích ngược)

File cũ chỉ có `term/meaning/ipa/example/wtype` vẫn nhập bình thường. Có thể bổ sung:

- **Cột nâng cao ngay trên sheet từ vựng**: `wordkey`, `register`, `cefr` (A1–C2), `frequency`,
  `ielts` (yes/no), `ieltsband`, `ieltsskills`, `usagecontext`, `contentstatus` (`draft`/`reviewed`/`approved`),
  `notes`, cùng các cột nhiều giá trị `collocation`, `pattern`, `topic`, `wordfamily`.
  Nhiều giá trị trong một ô được phân cách bằng `|` hoặc `;` (ví dụ `ieltsskills` = `reading | writing`).
- **Sheet liên kết 1-n** trong cùng file `.xlsx`: `Collocations`, `Patterns`, `WordFamilies`, `Topics`.
  Mỗi sheet có cột `wordKey` (ưu tiên, ổn định khi sắp xếp/lọc) hoặc `term` để nối về từ;
  **không** dùng số thứ tự dòng làm khoá.
  - `Collocations`: `wordKey`, `phrase`, `meaning`, `example`, `register`, `contentstatus`
  - `Patterns`: `wordKey`, `pattern`, `meaning`, `example`, `contentstatus`
  - `WordFamilies`: `wordKey`, `family`, `relation`
  - `Topics`: `wordKey`, `topic`

Xuất Excel một bộ từ vẫn giữ sheet `Từ vựng` như cũ, và chỉ khi có dữ liệu mới ghi thêm các sheet
`Collocations` / `Patterns` / `Topics` / `WordFamilies` (không nhân bản một từ thành nhiều dòng trên sheet chính).
Bản PDF có thêm khối tổng hợp “Collocation & cấu trúc”.

Nội dung do AI gợi ý hoặc chưa chắc chắn nên để `contentstatus = draft`: học sinh và khách xem qua link
chia sẻ sẽ không thấy bản nháp, chỉ admin thấy khi quản lý.

## Học theo kỹ năng (vocabulary depth)

Một từ không chỉ có “nghĩa”. Ngoài `wordProgress` (known + lịch spaced repetition) giữ nguyên như cũ,
hệ thống ghi thêm **bằng chứng hành vi theo từng kỹ năng** trong `word_skill_progress`:
`meaning_recognition`, `spelling_production`, `pronunciation_recall`, `listening_recognition`,
`collocation_usage`, `pattern_usage`, `context_usage`, `paraphrase`, `speaking_usage`.

- Điểm kỹ năng chỉ hiện khi đủ số lần luyện; chưa luyện thì báo **“chưa đủ dữ liệu”**, không hiển thị 0%.
- Trả lời đúng nhưng có dùng gợi ý/nghe trước chỉ tính nửa trọng số.
- “Đã nhớ” vẫn là tự đánh giá: từ đã biết nghĩa nhưng collocation yếu vẫn được ôn collocation.
- Smart Review và Ôn tập hôm nay chọn **chế độ luyện theo kỹ năng yếu nhất** và nêu lý do
  (“Collocation còn yếu”, “Bạn đã sai nhiều lần”, “Đã đến hạn ôn”).

Ba chế độ luyện mới (chỉ hiện khi bộ từ thật sự có dữ liệu):

- `/collocation/[setId]` — điền từ vào cụm (`make a ______`) hoặc viết lại cả cụm từ nghĩa tiếng Việt.
- `/pattern/[setId]` — điền giới từ/danh động từ trong cấu trúc (`prevent sb ______ doing sth`),
  hoặc viết lại cả cấu trúc. Cấu trúc nhiều nhóm phân cách `;` (kể cả dữ liệu cũ trong cột `wtype`)
  vẫn được tách thành từng bài riêng.
- `/cloze/[setId]` — điền từ vào chính câu ví dụ đã biên soạn. Chỉ tạo bài khi từ xuất hiện
  nguyên dạng, không mơ hồ và không phá dấu câu/markup; không có ví dụ phù hợp thì bỏ qua.

Chấm điểm dùng lại bộ grader cũ: chuẩn hoá hoa/thường và khoảng trắng, chấp nhận đúng các dạng
đã được biên soạn (`burned/burnt`, `refrigerator / fridge`, `pose a threat / pose a risk`),
không fuzzy-match để “nhận bừa” đáp án sai. Tìm kiếm thì ngược lại: có thể khớp gần đúng và quét cả
collocation/pattern/chủ đề/họ từ, nhưng vẫn tôn trọng phân quyền thư mục và ẩn bản nháp.

Phiên âm: IPA chuẩn **Anh-Anh (UK)** là nguồn sự thật và không bị ghi đè tự động; biến thể theo
từ loại/nét nghĩa được lưu có cấu trúc ở `word_pronunciations` thay vì nhét chuỗi gạch chéo vào một ô.
Trang luyện phát âm cho phép đổi giọng mẫu UK/US; phần nhận diện giọng nói giữ nguyên hành vi cũ và
chỉ là ước lượng tương đồng của trình duyệt.

Sao lưu: file backup lên phiên bản 4, kèm `wordCollocations`, `wordPatterns`, `wordPronunciations`,
`topics`, `wordTopics`, `wordFamilies`, `wordFamilyMembers`, `wordSkillProgress`.
File backup phiên bản 1–3 vẫn khôi phục được (các nhóm mới coi như rỗng).

Migration: `npm run db:push`, hoặc chạy `drizzle/0028_vocabulary_depth.sql`
(toàn bộ là additive + `IF NOT EXISTS`, không phá dữ liệu cũ).
