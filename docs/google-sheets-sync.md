# Google Sheets Sync cho Lexora

Google Sheet là **workspace chỉnh sửa vocabulary do Lexora quản lý**, không phải file import tạm thời.

```text
Admin tạo Vocabulary Set
        ↓
Create Google Sheet
        ↓
Lexora tự tạo Spreadsheet + template/header
        ↓
Lexora đưa toàn bộ vocabulary hiện tại vào Sheet
        ↓
Lexora lưu connection + spreadsheetId + sheetId + row mappings
        ↓
Bật watch channel (Google Drive push)
        ↓
Admin chỉ cần chỉnh Google Sheet
        ↓
Webhook (sync inline) + daily reconcile cron
        ↓
Sync engine: parse → normalize → identity → fingerprint → diff
        ↓
PostgreSQL (không reset learning data)
```

---

## 1. Architecture

```text
                 ┌─────────────────────────┐
                 │     Vocabulary Set      │
                 │         Lexora          │
                 └────────────┬────────────┘
                              │ Create Sheet
                              ▼
                 ┌─────────────────────────┐
                 │    Google Spreadsheet   │
                 │ __lexora_id | Word | …  │
                 └────────────┬────────────┘
                              │ edit
                              ▼
                    Google Drive Watch
                              │ POST /api/webhooks/google-drive
                              ▼
                 ┌─────────────────────────┐
                 │      Lexora Webhook     │  → validate + mark pending + sync (202)
                 └────────────┬────────────┘
                              ▼
              Daily reconcile cron (safety net, 18:00 UTC)
                              ▼
                 ┌─────────────────────────┐
                 │      Sync Engine        │
                 │ Parse Normalize Identity│
                 │ Fingerprint Diff Validate│
                 └────────────┬────────────┘
                              ▼
                 ┌─────────────────────────┐
                 │       PostgreSQL        │
                 │ vocab_sets, words,      │
                 │ google_sheet_* tables   │
                 └────────────┬────────────┘
                   ┌──────────┼──────────┐
                   ▼          ▼          ▼
               Progress    Mistakes   Skills   ← KHÔNG BAO GIỜ bị sync đụng tới
```

### Code layout

| File | Responsibility |
|---|---|
| `src/lib/googleSheets/template.ts` | Template tự sinh theo `vocabSet.type` + `languageCode` |
| `src/lib/googleSheets/parser.ts` | Header → canonical key, A1 range → rows |
| `src/lib/googleSheets/fingerprint.ts` | Fingerprint từ business fields, không gồm row number/formatting |
| `src/lib/googleSheets/identity.ts` | `__lexora_id` sinh/validate + fallback identity |
| `src/lib/googleSheets/diff.ts` | CREATED/UPDATED/UNCHANGED/DELETED/DUPLICATE/INVALID/CONFLICT |
| `src/lib/googleSheets/syncVocabulary.ts` | Đồng bộ Google → Lexora (DB transaction) |
| `src/lib/googleSheets/sheetLifecycle.ts` | Tạo Sheet, write-back ID, orchestrate sync |
| `src/lib/googleSheets/auth.ts` / `crypto.ts` | OAuth + mã hóa token AES-256-GCM |
| `src/lib/googleSheets/createFlow.ts` | Response contract của create-sheet: OAuth redirect, message tiếng Việt, anti-duplicate |
| `src/lib/googleSheets/client.ts` | Google API thật (googleapis) |
| `src/lib/googleSheets/api.ts` | Interface trừu tượng + fake cho test |
| `src/lib/googleSheets/store.ts` | Lock, pending state, sync runs |
| `src/lib/googleSheets/watch.ts` | Watch channel tạo/mới hạn |
| `src/lib/vocabImport/*` | Common import pipeline dùng chung CSV/XLSX/Google Sheets |

---

## 2. Google Cloud Console setup

1. Tạo dự án mới (hoặc dùng dự án sẵn có).
2. **APIs & Services → Library** → bật:
   - **Google Sheets API**
   - **Google Drive API**
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** (hoặc Internal nếu dùng Workspace).
   - Scopes tối thiểu:
     - `https://www.googleapis.com/auth/spreadsheets`
     - `https://www.googleapis.com/auth/drive.file`
4. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized redirect URI:
     ```text
     https://your-domain.com/api/admin/google-sheets/oauth/callback
     ```
   - Ghi lại `Client ID` và `Client secret`.

`drive.file` giới hạn quyền đúng các file do ứng dụng tạo/dùng chia sẻ, phù hợp least-privilege.

---

## 3. Redirect URI và webhook

- Redirect URI (đăng ký chính xác): `GOOGLE_REDIRECT_URI`.
- Webhook base URL: `GOOGLE_WEBHOOK_BASE_URL`. Lexora tự POST tới
  `{GOOGLE_WEBHOOK_BASE_URL}/api/webhooks/google-drive`.
- **Google Drive push notification yêu cầu HTTPS public URL** (không dùng localhost).
- Khi phát triển local, dùng tunnel (ngrok/cloudflared) và đặt `GOOGLE_WEBHOOK_BASE_URL`
  theo URL public đó, đổi `GOOGLE_REDIRECT_URI` cho khớp.

---

## 4. Environment variables

| Biến | Giải thích |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth Client ID từ Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret (chỉ server-side) |
| `GOOGLE_REDIRECT_URI` | Redirect URI đã đăng ký, kết thúc bằng `/api/admin/google-sheets/oauth/callback` |
| `GOOGLE_WEBHOOK_BASE_URL` | Base HTTPS public của deployment |
| `GOOGLE_WEBHOOK_TOKEN_SECRET` | HMAC secret cho header `x-goog-channel-token` (`openssl rand -hex 32`) | *(legacy — webhook hiện xác thực bằng channel token ngẫu nhiên do Google trả về; không cần secret này ở production mới)*
| `GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY` | Khóa AES-256-GCM mã hóa OAuth token tại rest (`openssl rand -hex 32`) |
| `CRON_SECRET` | Đã có sẵn, dùng cho cron daily (reconcile + renew) |

Không commit secret. Xem `.env.example`.

---

## 5. Create Sheet workflow

1. Admin mở **Bộ từ → tab Cài đặt → Google Sheets Sync**.
2. Bấm **Tạo Google Sheet** → preview template + số cột + số dòng sẽ xuất.
3. Bấm **Tạo**, server:
   - xác thực admin + quyền folder;
   - `spreadsheets.create` (title, tab);
   - `values.update` ghi header + toàn bộ từ vựng (chunk 2000 dòng/request);
   - `batchUpdate` freeze row 1, bold header, column widths, wrap, basic filter;
   - sinh `__lexora_id` cho từng dòng và lưu `google_sheet_row_mappings`;
   - tạo Drive watch channel;
   - ghi audit `google_sheet.create`;
   - trả `spreadsheetUrl`.

## 6. Connect existing Sheet (workflow phụ)

- Bấm **Kết nối Sheet hiện có** → dán link (không cần nhập spreadsheetId thủ công).
- Server parse `spreadsheetId`, `verifyAccess`, lấy metadata tab, admin chọn tab.
- Tạo connection → initial sync → watch channel.

## 7. Template fields

- **IELTS**: `__lexora_id, Word, Meaning, IPA, Part of Speech, Example, Example Pronunciation, Example Meaning, Level, CEFR, IELTS Band, IELTS Skills, Usage Context, Register, Frequency, Notes`
- **Irregular verbs**: `__lexora_id, Meaning, V1, V2, V3, IPA V1, IPA V2, IPA V3`
- **Mandarin (`languageCode = zh-CN`)**: `__lexora_id, Chữ Hán, Phồn thể, Pinyin, Nghĩa, Loại từ, Lượng từ, HSK, Ví dụ, Pinyin ví dụ, Nghĩa ví dụ, IPA, Notes`

Header aliases tương thích importer CSV/XLSX hiện có (`Word/Từ/Term`, `Chữ Hán/Hanzi/Simplified`, `Pinyin`, `HSK`, `Nghĩa/Meaning`, `V1/V2/V3`...).

`templateVersion = 1` được lưu trong connection. Thêm field ở phiên bản sau → `templateVersion = 2`, không phá template cũ.

## 8. Sync behavior

- Direction: `google_to_lexora` (v1), plus Lexora → Google cho write-back `__lexora_id`.
- Identity: `__lexora_id` trước; nếu trống → fallback identity đúng như CSV importer
  (normalized `term`, hoặc `v1|v2|v3` cho irregular verbs).
- Fingerprint = SHA-256 của business fields canonicalized (NFC, whitespace collapsed),
  **không** gồm row number/formatting/metadata.
- Đổi meaning → UPDATE cùng `wordId`; sort/move/insert row → không tạo duplicate.

## 9. Delete policy

`connection.deleteBehavior`:

| Giá trị | Hành vi |
|---|---|
| `archive` (default) | Gắn `deletedAt` ở mapping, **không** xóa `words`/learning data |
| `delete` | Hard delete `words` (opt-in) |
| `ignore` | Không đổi DB |

UI hiển thị rõ chính sách.

## 10. Conflict handling

Nếu `lastSyncedFingerprint ≠ current DB fingerprint` và Sheet cũng đổi → **CONFLICT**
(ghi nhận trong sync run, không silent overwrite).

## 11. OAuth / token security

- Token server-only, mã hóa AES-256-GCM (`GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY`).
- Không log access/refresh token/client secret.
- `state` OAuth được HMAC-sign để chống CSRF.
- Scope tối thiểu: `spreadsheets` + `drive.file`.

## 11a. Cột STT tự động

Mỗi Google Sheet do Lexora tạo đều có cột **STT** ở vị trí đầu tiên:

```text
| STT | __lexora_id | Word      | Meaning     | ... |
|-----|-------------|-----------|-------------|-----|
| 1   | v_8f21a     | abandon   | từ bỏ       | ... |
| 2   | v_2e91c     | acquire   | đạt được     | ... |
| 3   | v_7bd92     | facilitate| tạo điều kiện| ... |
```

STT là **cột hiển thị**, không phải identity của vocabulary:

- Không lưu vào PostgreSQL (không cột `stt` nào trong `words`).
- Không nằm trong fingerprint, không dùng để dedupe, không map word → DB.
- Không gửi vào vocabulary import model (`ParsedWordDraft` không có `stt`).
- Identity vẫn là `__lexora_id` (fallback: logic của importer).

Công thức được ghi một lần khi tạo Sheet (formula trên từng dòng, tham chiếu
tương đối để Sheets tự shift):

```text
=IF(B2="","",COUNTIF($B$2:B2,"<>"))
```

- `B` là cột `__lexora_id`; đếm số ô đã điền từ dòng đầu tới dòng hiện tại
  nên STT luôn liên tục `1, 2, 3...` sau khi thêm / xóa / sort / filter row.
- Dòng chưa có `__lexora_id` (admin nhập mà chưa có từ) để trống, không ăn số.
- Không dùng `ROW()` vì sẽ để sót số khi có dòng trống (đã bị test chặn).
- Format: căn giữa, cột hẹp (56px), không wrap, có trong basic filter.
- Sheet cũ (không có STT) vẫn sync bình thường — parser chỉ yêu cầu có
  `__lexora_id`, không ép vị trí cột 0.

Template version đã nâng lên **2** vì layout header đổi (thêm cột STT).

## 11b. Create Sheet: OAuth onboarding

Thiếu khi admin chưa kết nối Google **không phải** là lỗi từ phía máy chủ — đó là trạng thái onboarding bình thường.

```text
Admin bấm “Tạo Google Sheet”
        ↓
POST /api/admin/google-sheets/create
   ├─ Google đã có token → tạo Sheet ngay (201)
   └─ Chưa có token   → 202 { oauthRequired, oauthUrl, setId }
        ↓ (UI tự redirect)
GET /api/admin/google-sheets/oauth/start?next=/admin/sets?openSet=123&gSheetCreate=1
        ↓
GET /api/admin/google-sheets/oauth/callback  → storeGoogleToken
        ↓
/admin/sets?openSet=123&gSheetCreate=1  → tự tạo tiếp (hoặc nút “Tiếp tục tạo Google Sheet”)
```

- **Không có OAuth implementation thứ hai**: tái sử dụng `getGoogleOAuthConfig`,
  `googleOAuthStateFor`, `parseGoogleOAuthState`, `storeGoogleToken`, `loadGoogleToken`.
- `setId` được mang qua OAuth trong `state` đã ký HMAC; chỉ nhận URL
  cùng-site (bắt đầu bằng `/`, từ chối `//` để tránh open redirect).
- **Callback không bao giờ tạo spreadsheet** — nó chỉ lưu token. Nhờ vậy refresh/replay
  callback không thể tạo sheet thứ hai. `create` route cũng idempotent: đã có
  `google_sheet_connections` thì trả lại kết nối cũ thay vì tạo sheet mới.
- Trạng thái UI: `Kết nối Google để tiếp tục` / `Đang kết nối Google...` /
  `Đang tạo Google Sheet...` / `Tạo Google Sheet thành công`. Lỗi thô kỹ thuật chỉ log server-side.

## 12. Reconciliation & channel renewal

- Vercel **Hobby** chỉ cho cron chạy tối đa 1 lần/ngày (nó reject cả `*/5 * * * *` và `0 * * * *`),
  nên toàn bộ Google Sheets dùng **đúng 1 cron entry**: `0 18 * * *` → `/api/cron/google-sheets/reconcile`.
  Cron này làm 2 việc trong 1 route:
  1. **Reconcile** — xử lý các connection còn `pending` (bắt webhook bị miss, retry lỗi transient).
  2. **Renew watch channel** — channel mới có lifetime ~23h; renew khi còn < 6h (`WATCH_CHANNEL_RENEW_THRESHOLD_MS`);
     channel tokenless (legacy trước fix) cũng được tạo lại ngay trong lần chạy cron kế tiếp.
  Renew **lười (lazy)**: mỗi webhook hợp lệ cũng gọi `renewWatchChannelIfExpiring()` nên channel thường được
  gia hạn ngay khi có tương tác, không phụ thuộc cron.
  Auth: `Authorization: Bearer CRON_SECRET`.
- **Near-real-time đến từ webhook, không phải từ cron.** Webhook Drive nhận sheet, mark pending
  rồi chạy sync ngay trong request (`maxDuration = 60`). Nếu invocation chết giữa chừng,
  timeout, hoặc OAuth bị thu hồi — cờ `pending` đã ghi trước đó nên cron daily tự dọn.

### Webhook authentication (post-fix)

- **Không** dùng `HMAC-SHA256(body)` — notification body của `files.watch` là rỗng.
- Mỗi watch channel Lexora tạo gửi `requestBody.token` (random 32 byte hex, `crypto.randomBytes`),
  Google chuyển header `X-Goog-Channel-Token` tương ứng. Server chỉ lưu SHA-256 digest
  (`google_sheet_sync_channels.channel_token_hash`) và so sánh digest constant-time khi nhận webhook.
- Webhook 403 nếu thiếu/sai token hoặc `resourceId` không khớp. Channel legacy (trước fix,
  `channel_token_hash IS NULL`) fail closed và được cron/webhook lazy-renew tạo lại channel mới có token.
- Trạng thái `sync` chỉ xác nhận channel; `update` (và các state khác) mới mark pending + sync.
- Webhook **idempotent**: kiểm tra `channelId`, `resourceId`, `x-goog-message-number`
  (lọc duplicate/out-of-order) → mọi trigger đều qua `runPendingConnection()` (shared connection lock).
## 13. Concurrency & retry

- Lock theo connection (`google_sheet_sync_locks`, TTL 5 phút):
  webhook/manual/cron không chạy đồng thời → `409 Sync already in progress`.
- Retryable (timeout, network, 429, 5xx) vs non-retryable (401 revoked, 403, 404, invalid schema)
  phân loại trong `errors.ts`.

## 14. API routes

```text
GET    /api/admin/google-sheets/connections?setId=123
POST   /api/admin/google-sheets/create
POST   /api/admin/google-sheets/connect
GET    /api/admin/google-sheets/oauth/start
GET    /api/admin/google-sheets/oauth/callback
GET    /api/admin/google-sheets/connections/[id]
PATCH  /api/admin/google-sheets/connections/[id]
DELETE /api/admin/google-sheets/connections/[id]
POST   /api/admin/google-sheets/connections/[id]/preview
POST   /api/admin/google-sheets/connections/[id]/sync
GET    /api/admin/google-sheets/connections/[id]/runs
POST   /api/webhooks/google-drive
GET    /api/cron/google-sheets/reconcile   (daily: reconcile + renewal)
```

RBAC: quyền mới `google_sheets.view` / `google_sheets.manage` / `google_sheets.sync`
(owner, manager, content_editor; viewer không có). Mọi route đều check
`requireAdminPermission` + `requireAdminResourceAccess` (folder level).

## 15. Troubleshooting

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| `NOT_CONFIGURED` | Thiếu `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` |
| `OAUTH_REQUIRED` / 401 | Admin chưa kết nối Google → `/api/admin/google-sheets/oauth/start` |
| `PERMISSION_DENIED` | Redirect URI sai, hoặc user không phải chủ file; dùng Sheet do Lexora tạo |
| `SHEET_NOT_FOUND` | Sheet bị xóa/chia sẻ bị thu hồi |
| Webhook 403 | `GOOGLE_WEBHOOK_TOKEN_SECRET` sai/không khớp |
| Webhook không tới | URL không public HTTPS; kiểm tra `GOOGLE_WEBHOOK_BASE_URL` |
| Channel hết hạn | Renew chạy 1 lần/ngày → kiểm tra `CRON_SECRET`, cron `0 18 * * *` đã đăng ký, webhook còn tới được |
| Webhook 403 liên tục | Channel chưa có token (legacy) hoặc token không khớp — cron sẽ tạo lại channel mới; đảm bảo cron `0 18 * * *` chạy |
| `409` | Sync khác đang chạy cho connection này |

## 16. Migration

- `drizzle/0033_google_sheets_sync.sql` — **additive**:
  `google_sheet_connections`, `google_sheet_sync_channels`,
  `google_sheet_row_mappings`, `google_sheet_sync_runs`,
  `google_sheet_sync_locks`, `google_sheet_sync_pending`,
  `google_sheet_oauth_tokens`.
- Không drop/alter bảng cũ, không đổi PK của `words`.
- Chạy: `node scripts/apply-google-sheets-migration.mjs` (hoặc `psql -f`).
- Backup mở rộng thêm 4 collections (backward-compatible: backup cũ vẫn restore).
