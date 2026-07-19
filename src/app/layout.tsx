import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IELTS Vocab Check — Hệ thống kiểm tra từ vựng",
  description: "Nền tảng kiểm tra và quản lý từ vựng luyện thi IELTS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const themeScript = `(function(){try{var s=localStorage.getItem('ivc_theme')||'system';var d=s==='dark'||(s==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('theme-dark',d);document.documentElement.dataset.themeSetting=s;document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()`;
  return (
    <html lang="vi" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
