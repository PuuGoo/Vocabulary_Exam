# Lexora Global B2C UI Redesign Package (`PuuGoo/Vocabulary_Exam`)

Bộ mã nguồn này giúp chuyển đổi kho lưu trữ `Vocabulary_Exam` từ mô hình pha trộn Lớp học (LMS) + Cá nhân sang **Nền tảng Tự học Từ vựng Cá nhân Thương mại Toàn cầu (Global B2C SaaS)**.

## 1. Dọn dẹp các Route Lớp học (LMS) & Route trùng lặp
Chạy kịch bản dọn dẹp tại thư mục gốc của dự án:
```bash
bash scripts/cleanup-b2c-routes.sh
```
Kịch bản này sẽ:
- **Xóa hoàn toàn nhánh LMS/Giao bài:** `src/app/(student)/assignments`, `src/app/admin/assignments`, `src/app/admin/classes`, `src/app/admin/results`, `AssignmentReminder.tsx`, `FolderAccessManager.tsx`.
- **Gộp 5 route ôn tập về 1:** Xóa `review`, `review-center`, `review-today`, `smart-review`, `mixed-practice` để hợp nhất vào hàng đợi **Smart SRS Queue** ngay trên `/dashboard`.
- **Gộp 4 route lưu trữ từ về 1:** Hợp nhất `my-words`, `vocabulary-vault`, `notebook`, `dictionary` vào `/library`.
- **Gộp 13 route bài tập rời rạc về 1:** Hợp nhất vào `src/components/learning/LearnExperience.tsx` với 4 giai đoạn nhận thức (*Recall → Context → Audio/Tone → Feynman Mastery AI*).

## 2. Các tệp chính trong gói nâng cấp
- `src/lib/navigation.ts`: Cấu hình 4 mục điều hướng B2C mới (`Today`, `Library & Vault`, `4-Stage Study`, `Insights`).
- `src/app/globals.css`: Hệ thống biến màu đa giao diện (`saas` Indigo hiện đại, `editorial` giấy ấm vàng kim nguyên bản của Lexora, và `dark` mode).
- `src/components/AppShell.tsx`: Khung ứng dụng cá nhân tích hợp chuyển đổi ngôn ngữ (`VI` / `EN` / `ZH`), chuyển đổi chủ đề màu, chuỗi ngày học (Streak) và nút nâng cấp gói Pro.
- `src/components/learning/LearnExperience.tsx`: Trình học 4 cấp độ nhận thức tích hợp `SpeakButton`, `VerbIpa`, luyện thanh điệu tiếng Trung và chấm điểm Feynman.
