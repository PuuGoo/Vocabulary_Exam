export const ADMIN_PROFILES = ["owner", "manager", "content_editor", "viewer", "custom"] as const;
export type AdminProfile = (typeof ADMIN_PROFILES)[number];

export const ADMIN_PERMISSIONS = [
  "admin.dashboard.view",
  "vocab.view", "vocab.create", "vocab.edit", "vocab.delete", "vocab.import", "vocab.export", "vocab.reorder", "vocab.move",
  "questions.view", "questions.create", "questions.edit", "questions.delete", "questions.import", "questions.export", "questions.reorder",
  "documents.view", "documents.upload", "documents.edit", "documents.delete", "documents.download",
  "classes.view", "classes.create", "classes.edit", "classes.delete", "classes.members",
  "assignments.view", "assignments.create", "assignments.edit", "assignments.delete",
  "results.view", "results.export",
  "users.view", "users.create", "users.edit", "users.delete", "users.reset_password",
  "permissions.view", "permissions.manage",
  "sharing.view", "sharing.manage",
  "registration.view", "registration.manage",
  "backup.create", "backup.restore", "audit.view",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];
export const ADMIN_PERMISSION_SET = new Set<string>(ADMIN_PERMISSIONS);

export const ADMIN_PROFILE_LABELS: Record<AdminProfile, string> = {
  owner: "Owner",
  manager: "Quản trị viên",
  content_editor: "Biên tập nội dung",
  viewer: "Chỉ xem",
  custom: "Tùy chỉnh",
};

const VIEW_DEPENDENCIES: Partial<Record<AdminPermission, AdminPermission>> = Object.fromEntries(
  ADMIN_PERMISSIONS.flatMap((permission) => {
    const [group, action] = permission.split(".");
    const view = `${group}.view`;
    return action !== "view" && ADMIN_PERMISSION_SET.has(view) ? [[permission, view as AdminPermission]] : [];
  }),
);

const VIEWER: AdminPermission[] = [
  "admin.dashboard.view", "vocab.view", "vocab.export", "questions.view", "questions.export",
  "documents.view", "documents.download", "classes.view", "assignments.view", "results.view", "sharing.view",
];
const CONTENT_EDITOR: AdminPermission[] = [
  "admin.dashboard.view",
  "vocab.view", "vocab.create", "vocab.edit", "vocab.import", "vocab.export", "vocab.reorder", "vocab.move",
  "questions.view", "questions.create", "questions.edit", "questions.import", "questions.export", "questions.reorder",
  "documents.view", "documents.upload", "documents.edit", "documents.download",
  "sharing.view", "sharing.manage",
];
const MANAGER: AdminPermission[] = [
  "admin.dashboard.view",
  "vocab.view", "vocab.create", "vocab.edit", "vocab.delete", "vocab.import", "vocab.export", "vocab.reorder", "vocab.move",
  "questions.view", "questions.create", "questions.edit", "questions.delete", "questions.import", "questions.export", "questions.reorder",
  "documents.view", "documents.upload", "documents.edit", "documents.delete", "documents.download",
  "classes.view", "classes.create", "classes.edit", "classes.delete", "classes.members",
  "assignments.view", "assignments.create", "assignments.edit", "assignments.delete",
  "results.view", "results.export", "users.view", "users.create", "users.edit", "users.reset_password",
  "sharing.view", "sharing.manage", "registration.view", "registration.manage",
];

export const ADMIN_PROFILE_PERMISSIONS: Record<AdminProfile, readonly AdminPermission[]> = {
  owner: ADMIN_PERMISSIONS,
  manager: MANAGER,
  content_editor: CONTENT_EDITOR,
  viewer: VIEWER,
  custom: ["admin.dashboard.view"],
};

export type PermissionOverride = { permission: string; allowed: boolean };

export function isAdminProfile(value: unknown): value is AdminProfile {
  return typeof value === "string" && (ADMIN_PROFILES as readonly string[]).includes(value);
}

export function isAdminPermission(value: unknown): value is AdminPermission {
  return typeof value === "string" && ADMIN_PERMISSION_SET.has(value);
}

export function resolveAdminPermissions(profile: AdminProfile, overrides: readonly PermissionOverride[] = []) {
  if (profile === "owner") return new Set<AdminPermission>(ADMIN_PERMISSIONS);
  const permissions = new Set<AdminPermission>(ADMIN_PROFILE_PERMISSIONS[profile]);
  for (const override of overrides) {
    if (!isAdminPermission(override.permission)) continue;
    if (override.allowed) permissions.add(override.permission);
    else permissions.delete(override.permission);
  }
  for (const permission of [...permissions]) {
    const view = VIEW_DEPENDENCIES[permission];
    if (view) permissions.add(view);
  }
  return permissions;
}

export function normalizePermissionSelection(values: readonly string[]) {
  const selected = new Set<AdminPermission>(values.filter(isAdminPermission));
  for (const permission of [...selected]) {
    const view = VIEW_DEPENDENCIES[permission];
    if (view) selected.add(view);
  }
  for (const permission of ADMIN_PERMISSIONS) {
    if (permission.endsWith(".view") && !selected.has(permission)) {
      const group = permission.split(".")[0];
      for (const child of [...selected]) if (child.startsWith(`${group}.`) && child !== permission) selected.delete(child);
    }
  }
  return [...selected];
}

export const ADMIN_PERMISSION_GROUPS = [
  { label: "Tổng quan", permissions: ["admin.dashboard.view"] },
  { label: "Bộ từ vựng", permissions: ADMIN_PERMISSIONS.filter((p) => p.startsWith("vocab.")) },
  { label: "Câu hỏi", permissions: ADMIN_PERMISSIONS.filter((p) => p.startsWith("questions.")) },
  { label: "Tài liệu", permissions: ADMIN_PERMISSIONS.filter((p) => p.startsWith("documents.")) },
  { label: "Lớp học", permissions: ADMIN_PERMISSIONS.filter((p) => p.startsWith("classes.")) },
  { label: "Bài tập", permissions: ADMIN_PERMISSIONS.filter((p) => p.startsWith("assignments.")) },
  { label: "Kết quả", permissions: ADMIN_PERMISSIONS.filter((p) => p.startsWith("results.")) },
  { label: "Người dùng", permissions: ADMIN_PERMISSIONS.filter((p) => p.startsWith("users.")) },
  { label: "Bảo mật quản trị", permissions: ADMIN_PERMISSIONS.filter((p) => p.startsWith("permissions.")) },
  { label: "Chia sẻ", permissions: ADMIN_PERMISSIONS.filter((p) => p.startsWith("sharing.")) },
  { label: "Hệ thống", permissions: ADMIN_PERMISSIONS.filter((p) => p.startsWith("registration.") || p.startsWith("backup.") || p === "audit.view") },
] as const;

export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, string> = Object.fromEntries(
  ADMIN_PERMISSIONS.map((permission) => [permission, ({ view: "Xem", create: "Tạo", edit: "Sửa", delete: "Xóa", import: "Nhập", export: "Xuất", reorder: "Sắp xếp", move: "Di chuyển", upload: "Tải lên", download: "Tải xuống", members: "Thành viên", reset_password: "Đặt lại mật khẩu", manage: "Quản lý", restore: "Khôi phục" } as Record<string, string>)[permission.split(".").at(-1)!] || permission]),
) as Record<AdminPermission, string>;
