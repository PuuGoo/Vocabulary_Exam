import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ToastHost from "@/components/Toast";
import { LEARNING_TABS } from "@/lib/navigation";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell
      displayName={session.displayName}
      roleLabel={session.role === "admin" ? "Admin" : "Học sinh"}
      tabs={session.role === "admin" ? [...LEARNING_TABS, { href: "/admin/sets", label: "⚙ Khu quản trị" }] : LEARNING_TABS}
    >
      {children}
      <ToastHost />
    </AppShell>
  );
}
