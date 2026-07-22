# Ứng dụng Android Lexora IELTS

Dự án có hai phiên bản dùng chung mã nguồn và dữ liệu:

- Web: Next.js chạy bằng `npm run dev` hoặc máy chủ production.
- Android: dự án native trong thư mục `android/`, hiển thị cùng ứng dụng từ máy chủ Next.js.
- Android nhẹ (không cần APK): trên Chrome chọn **Thêm vào màn hình chính** để cài PWA Lexora. PWA có icon, chế độ toàn màn hình và không cần Android SDK.

## Yêu cầu trên máy phát triển

1. Cài Android Studio cùng Android SDK 35.
2. Tạo một máy ảo Android, khuyến nghị Android 13 trở lên.
3. Chạy web và cơ sở dữ liệu như bình thường bằng `npm run dev`.

## Chạy trên máy ảo Android

Địa chỉ mặc định trong `capacitor.config.ts` là `http://10.0.2.2:3000`. Đây là địa chỉ đặc biệt để máy ảo Android truy cập cổng `3000` trên máy tính.

```bash
npm run android:sync
npm run android:open
```

Trong Android Studio, chọn máy ảo rồi nhấn **Run**. Có thể dùng `npm run android:run` sau khi Android SDK đã được cấu hình.

Nếu dùng điện thoại thật, điện thoại và máy tính phải cùng mạng Wi-Fi. Tạm thời đặt `CAPACITOR_SERVER_URL` thành địa chỉ LAN của máy tính trước khi đồng bộ, ví dụ `http://192.168.1.10:3000`. Máy chủ Next.js cũng phải lắng nghe trên `0.0.0.0`.

## Chuẩn bị bản phát hành

Bản phát hành phải trỏ tới tên miền HTTPS đang chạy Lexora. Lệnh sau kiểm tra URL và ghi nó vào dự án Android:

```bash
npm run android:sync:production -- https://app.ten-mien-cua-ban.vn
```

Sau đó mở Android Studio, chọn **Build > Generate Signed Bundle / APK**, rồi tạo Android App Bundle (`.aab`) để đăng Google Play.

Không tạo bản phát hành khi cấu hình vẫn là `10.0.2.2`; địa chỉ đó chỉ hoạt động trên máy ảo.

## Build APK không cần cài SDK trên máy cá nhân

Workflow `.github/workflows/android.yml` có thể build trên GitHub Actions. Trong GitHub vào **Settings > Secrets and variables > Actions**, tạo secret `CAPACITOR_SERVER_URL` bằng URL HTTPS của máy chủ. Sau đó vào **Actions > Build Android app > Run workflow** và tải artifact `lexora-android-debug`.

Workflow này dùng máy build của GitHub, nên không chiếm dung lượng ổ đĩa 5 GB của máy phát triển.

## Quy trình sau mỗi thay đổi

- Thay đổi giao diện/logic Next.js: triển khai lại máy chủ web; cả web và Android nhận cùng phiên bản.
- Thay plugin hoặc cấu hình native: chạy lại `npm run android:sync` và build lại ứng dụng Android.
- Kiểm tra môi trường Capacitor: `npm run android:doctor`.
