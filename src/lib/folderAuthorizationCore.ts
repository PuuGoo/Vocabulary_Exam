export const FOLDER_ACCESS_LEVELS = ["viewer", "editor", "manager", "deny"] as const;
export type FolderAccessLevel = (typeof FOLDER_ACCESS_LEVELS)[number];
export type PositiveFolderAccess = Exclude<FolderAccessLevel, "deny">;

const ACCESS_RANK: Record<FolderAccessLevel, number> = { deny: 0, viewer: 1, editor: 2, manager: 3 };

export type FolderAuthorizationRow = { id: number; parentId: number | null; ownerUserId: number | null; kind: string; archivedAt: Date | null };
export type FolderAclRow = { folderId: number; userId: number; accessLevel: string };

export function isFolderAccessLevel(value: unknown): value is FolderAccessLevel {
  return typeof value === "string" && (FOLDER_ACCESS_LEVELS as readonly string[]).includes(value);
}

export function resolveFolderAccessFromRows(userId: number, profile: string, folderId: number, folders: readonly FolderAuthorizationRow[], rules: readonly FolderAclRow[]): FolderAccessLevel | null {
  if (profile === "owner") return "manager";
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const byFolder = new Map(rules.filter((rule) => rule.userId === userId && isFolderAccessLevel(rule.accessLevel)).map((rule) => [rule.folderId, rule.accessLevel as FolderAccessLevel]));
  const visited = new Set<number>();
  let current = byId.get(folderId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.archivedAt) return null;
    const explicit = byFolder.get(current.id);
    if (explicit) return explicit;
    if (current.kind === "personal_root" && current.ownerUserId === userId) return "manager";
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return null;
}

export function folderAccessSatisfies(actual: FolderAccessLevel | null, required: PositiveFolderAccess) {
  return actual !== null && actual !== "deny" && ACCESS_RANK[actual] >= ACCESS_RANK[required];
}

export function normalizeFolderName(value: string) {
  return value.normalize("NFC").replace(/[\u00a0\u202f\u3000]/g, " ").replace(/\s+/g, " ").trim();
}
