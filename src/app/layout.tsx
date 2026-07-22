import type { Metadata } from "next";
import type { Viewport } from "next";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import MobileAppBridge from "@/components/MobileAppBridge";
import PwaRegister from "@/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lexora IELTS Academy",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/lexora.svg", apple: "/icons/lexora.svg" },
  description: "Không gian học IELTS tập trung, hiện đại dành cho người Việt.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F8F8FC",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const themeScript = `(function(){try{var s=localStorage.getItem('ivc_theme')||'light';var d=s==='dark'||(s==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('theme-dark',d);document.documentElement.dataset.themeSetting=s;document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()`;
  return <html lang="vi" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body className="font-sans"><PwaRegister /><MobileAppBridge /><InstallAppPrompt />{children}</body></html>;
}
