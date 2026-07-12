import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IELTS Vocab Check — Hệ thống kiểm tra từ vựng",
  description: "Nền tảng kiểm tra và quản lý từ vựng luyện thi IELTS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="font-sans">{children}</body>
    </html>
  );
}
