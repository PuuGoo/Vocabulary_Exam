import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ToastHost from "@/components/Toast";

const TABS = [
  { href: "/study", label: "Chọn bộ từ & làm bài" },
  { href: "/history", label: "Lịch sử của tôi" },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell displayName={session.displayName} roleLabel={session.role === "admin" ? "Admin" : "Học sinh"} tabs={TABS}>
      {children}
      <ToastHost />
    </AppShell>
  );
}
