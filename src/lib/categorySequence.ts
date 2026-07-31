import { sql } from "drizzle-orm";
import { vocabSets } from "@/db/schema";

const PREFIX = /^\d+_/;

export function getCategoryPrefixNumber(name: string) {
  const match = name.trim().match(/^(\d+)_/);
  return match ? Number(match[1]) : null;
}

export function removeCategoryPrefix(name: string) {
  return name.replace(PREFIX, "").trim();
}

export function hasCategoryPrefix(name: string) {
  return PREFIX.test(name.trim());
}

export function formatCategorySetName(order: number, name: string) {
  return `${String(order).padStart(2, "0")}_${removeCategoryPrefix(name)}`;
}

export function prepareCategorySetRename(currentName: string, requestedName: string) {
  const requested = requestedName.trim();
  if (hasCategoryPrefix(requested)) return requested;
  const currentPrefix = currentName.trim().match(/^(\d+)_/)?.[1];
  return currentPrefix ? `${currentPrefix}_${removeCategoryPrefix(requested)}` : requested;
}

/**
 * Uses the larger of the existing set count and the largest numeric prefix.
 * This keeps old unnumbered sets valid and avoids reusing a number after a
 * deletion.
 */
export async function nextCategoryOrder(tx: any, category: string) {
  const [row] = await tx
    .select({
      count: sql<number>`count(*)::int`,
      maxPrefix: sql<number>`coalesce(max(case when ${vocabSets.name} ~ '^[0-9]+_' then cast(substring(${vocabSets.name} from '^[0-9]+') as integer) else 0 end), 0)::int`,
    })
    .from(vocabSets)
    .where(sql`${vocabSets.category} = ${category}`);
  return Math.max(Number(row?.count || 0), Number(row?.maxPrefix || 0)) + 1;
}

