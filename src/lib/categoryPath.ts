export const CATEGORY_SEPARATOR = " / ";
export const UNCATEGORIZED_PATH = "__uncategorized__";
export const UNCATEGORIZED_LABEL = "Chưa phân loại";

export function splitCategoryPath(path?: string | null) {
  return (path || "").split(/\s*\/\s*/u).map((part) => part.trim()).filter(Boolean);
}

export function joinCategoryPath(parts: Array<string | null | undefined>) {
  return parts.flatMap((part) => splitCategoryPath(part)).join(CATEGORY_SEPARATOR);
}

export function normalizeCategoryPath(path?: string | null) {
  return joinCategoryPath([path]);
}

export function categoryBasename(path?: string | null) {
  return splitCategoryPath(path).at(-1) || "";
}

export function parentCategoryPath(path?: string | null) {
  return joinCategoryPath(splitCategoryPath(path).slice(0, -1));
}

export function isDirectChild(parent: string, candidate: string) {
  const parentParts = splitCategoryPath(parent);
  const candidateParts = splitCategoryPath(candidate);
  return candidateParts.length === parentParts.length + 1 && parentParts.every((part, index) => part === candidateParts[index]);
}

export function isDescendant(parent: string, candidate: string) {
  const parentParts = splitCategoryPath(parent);
  const candidateParts = splitCategoryPath(candidate);
  return candidateParts.length > parentParts.length && parentParts.every((part, index) => part === candidateParts[index]);
}

export const categoryCollator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });

export type CategorizedItem = { category?: string | null };
export type CategoryFolder = { path: string; name: string; count: number };

export function categoryPathsWithAncestors(paths: Array<string | null | undefined>) {
  const result = new Set<string>();
  for (const rawPath of paths) {
    const parts = splitCategoryPath(rawPath);
    for (let index = 1; index <= parts.length; index += 1) result.add(joinCategoryPath(parts.slice(0, index)));
  }
  return [...result];
}

export function listChildCategoryFolders(parent: string, paths: Array<string | null | undefined>, items: CategorizedItem[]): CategoryFolder[] {
  const normalizedParent = normalizeCategoryPath(parent);
  const allPaths = categoryPathsWithAncestors([...paths, ...items.map((item) => item.category)]);
  const folders = allPaths.filter((path) => isDirectChild(normalizedParent, path)).map((path) => ({
    path,
    name: categoryBasename(path),
    count: items.filter((item) => {
      const itemPath = normalizeCategoryPath(item.category);
      return itemPath === path || isDescendant(path, itemPath);
    }).length,
  }));
  if (!normalizedParent && items.some((item) => !normalizeCategoryPath(item.category))) folders.push({ path: UNCATEGORIZED_PATH, name: UNCATEGORIZED_LABEL, count: items.filter((item) => !normalizeCategoryPath(item.category)).length });
  return folders.sort((left, right) => {
    if (left.path === UNCATEGORIZED_PATH) return 1;
    if (right.path === UNCATEGORIZED_PATH) return -1;
    return categoryCollator.compare(left.name, right.name);
  });
}

export function setsDirectlyInFolder<T extends CategorizedItem>(folder: string, items: T[]) {
  if (folder === UNCATEGORIZED_PATH) return items.filter((item) => !normalizeCategoryPath(item.category));
  const normalized = normalizeCategoryPath(folder);
  return items.filter((item) => normalizeCategoryPath(item.category) === normalized);
}

export function searchCategorizedItems<T extends CategorizedItem & { name: string; className?: string | null }>(query: string, items: T[]) {
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  if (!normalizedQuery) return [];
  return items.filter((item) => `${item.name} ${normalizeCategoryPath(item.category)} ${item.className || ""}`.toLocaleLowerCase("vi").includes(normalizedQuery));
}

export function categoryBreadcrumbs(path: string) {
  if (!path || path === UNCATEGORIZED_PATH) return path === UNCATEGORIZED_PATH ? [{ label: UNCATEGORIZED_LABEL, path }] : [];
  const parts = splitCategoryPath(path);
  return parts.map((label, index) => ({ label, path: joinCategoryPath(parts.slice(0, index + 1)) }));
}
