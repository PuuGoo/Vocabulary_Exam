import {
  categoryBasename,
  categoryBreadcrumbs,
  categoryCollator,
  isDescendant,
  joinCategoryPath,
  listChildCategoryFolders,
  normalizeCategoryPath,
  splitCategoryPath,
} from "@/lib/categoryPath";
import { questionCollectionForType, QUESTION_COLLECTION_KEYS } from "@/lib/questionCollections";

export type SharedSetItem = { id: number; name: string; category: string | null };
export type SharedQuestionItem = { id: number; questionType: string; category: string };
export type SharedDocumentItem = { id: number; title: string; fileName: string; category: string };

export function relativeFolderPath(rootPath: string, fullPath: string) {
  const root = splitCategoryPath(rootPath);
  const full = splitCategoryPath(fullPath);
  if (full.length < root.length || !root.every((part, index) => part === full[index])) return null;
  return joinCategoryPath(full.slice(root.length));
}

export function resolveSharedFolderPath(rootPath: string, relativePath?: string | null) {
  const root = normalizeCategoryPath(rootPath);
  const relative = normalizeCategoryPath(relativePath);
  const current = relative ? joinCategoryPath([root, relative]) : root;
  return current === root || isDescendant(root, current) ? current : null;
}

export function buildSharedFolderView(
  rootPath: string,
  relativePath: string | null | undefined,
  content: { sets: SharedSetItem[]; questions: SharedQuestionItem[]; documents: SharedDocumentItem[] },
) {
  const root = normalizeCategoryPath(rootPath);
  const current = resolveSharedFolderPath(root, relativePath);
  if (!current) return null;
  const allItems = [...content.sets, ...content.questions, ...content.documents];
  const existing = new Set(allItems.flatMap((item) => {
    const parts = splitCategoryPath(item.category);
    return parts.map((_, index) => joinCategoryPath(parts.slice(0, index + 1)));
  }));
  if (current !== root && !existing.has(current)) return null;

  const folders = listChildCategoryFolders(current, [], allItems)
    .filter((folder) => folder.count > 0)
    .map((folder) => ({ ...folder, relativePath: relativeFolderPath(root, folder.path) || "" }));
  const sets = content.sets.filter((item) => normalizeCategoryPath(item.category) === current)
    .sort((left, right) => categoryCollator.compare(left.name, right.name));
  const questions = content.questions.filter((item) => normalizeCategoryPath(item.category) === current);
  const documents = content.documents.filter((item) => normalizeCategoryPath(item.category) === current)
    .sort((left, right) => categoryCollator.compare(left.title || left.fileName, right.title || right.fileName));
  const collections = QUESTION_COLLECTION_KEYS.map((key) => ({
    key,
    count: questions.filter((item) => questionCollectionForType(item.questionType) === key).length,
  })).filter((item) => item.count > 0);
  const rootDepth = splitCategoryPath(root).length;
  const breadcrumbs = categoryBreadcrumbs(current).slice(rootDepth - 1).map((item) => ({
    name: item.label,
    relativePath: relativeFolderPath(root, item.path) || "",
  }));

  return {
    root: { path: root, name: categoryBasename(root) },
    currentFolder: { path: current, relativePath: relativeFolderPath(root, current) || "", name: categoryBasename(current), breadcrumbs },
    folders,
    sets,
    questions,
    documents,
    collections,
  };
}
