import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ToastHost from "@/components/Toast";

const TABS = [
  { href: "/admin/sets", label: "Bộ từ vựng" },
  { href: "/admin/import", label: "Nhập dữ liệu" },
  { href: "/admin/users", label: "Người dùng" },
  { href: "/admin/results", label: "Kết quả học sinh" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/study");

  return (
    <AppShell displayName={session.displayName} roleLabel="Admin" tabs={TABS}>
      {children}
      <ToastHost />
    </AppShell>
  );
}
