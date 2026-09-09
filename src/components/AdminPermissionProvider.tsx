"use client";
import { createContext, useContext } from "react";
import type { AdminPermission, AdminProfile } from "@/lib/adminPermissions";
type Value = { profile: AdminProfile; profileLabel: string; permissions: readonly AdminPermission[]; can(permission: AdminPermission): boolean };
const Context = createContext<Value | null>(null);
export function AdminPermissionProvider({ profile, profileLabel, permissions, children }: Omit<Value, "can"> & { children: React.ReactNode }) {
  return <Context.Provider value={{ profile, profileLabel, permissions, can: (permission) => permissions.includes(permission) }}>{children}</Context.Provider>;
}
export function useAdminPermissions() {
  const value = useContext(Context);
  if (!value) throw new Error("useAdminPermissions must be used inside AdminPermissionProvider");
  return value;
}
