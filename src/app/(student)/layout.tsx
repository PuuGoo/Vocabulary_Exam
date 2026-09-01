import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ToastHost from "@/components/Toast";
import { LEARNING_TABS } from "@/lib/navigation";
import { UserSessionProvider } from "@/components/UserSessionContext";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <UserSessionProvider userId={session.userId}>
      <AppShell
        displayName={session.displayName}
        roleLabel={session.role === "admin" ? "Admin" : "Học sinh"}
        mode="student"
        tabs={session.role === "admin" ? [...LEARNING_TABS, { href: "/admin", label: "Mở khu quản trị" }] : LEARNING_TABS}
      >
        {children}
        <ToastHost />
      </AppShell>
    </UserSessionProvider>
  );
}
