import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ToastHost from "@/components/Toast";
import { ADMIN_TABS, LEARNING_TABS } from "@/lib/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/study");

  return (
    <AppShell displayName={session.displayName} roleLabel="Admin" tabs={[...LEARNING_TABS, ...ADMIN_TABS]}>
      {children}
      <ToastHost />
    </AppShell>
  );
}
