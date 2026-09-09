import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ToastHost from "@/components/Toast";
import { ADMIN_TABS, filterAdminNavigation } from "@/lib/navigation";
import { getAdminAccess } from "@/lib/adminAuthorization";
import { ADMIN_PROFILE_LABELS } from "@/lib/adminPermissions";
import { AdminPermissionProvider } from "@/components/AdminPermissionProvider";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/study");
  const access = await getAdminAccess(session);
  if (!access) redirect("/study");
  const sections = filterAdminNavigation(access.permissions);
  const tabs = sections.flatMap((section) => section.items);
  const profileLabel = ADMIN_PROFILE_LABELS[access.profile];

  return (
    <AdminPermissionProvider profile={access.profile} profileLabel={profileLabel} permissions={[...access.permissions]}>
      <AppShell displayName={access.displayName} roleLabel="Admin" mode="admin" tabs={tabs.length ? tabs : ADMIN_TABS.slice(0, 1)} navigationSections={sections} adminProfileLabel={profileLabel}>
        {children}
        <ToastHost />
      </AppShell>
    </AdminPermissionProvider>
  );
}
