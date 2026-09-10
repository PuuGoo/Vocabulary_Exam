import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { vocabSets, words } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { normalizePinyinForSearch } from "@/lib/pinyin";
import { getVisibleFolderIds } from "@/lib/folderAuthorization";

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function GET(request: NextRequest) {
  const access = await requireAdminPermission("vocab.view");
  if (isAuthorizationError(access)) return access;

  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (query.length < 2) return NextResponse.json({ matches: [] });

  const pattern = `%${escapeLike(query)}%`;
  const pinyinPattern = `%${escapeLike(normalizePinyinForSearch(query))}%`;
  const visibleFolderIds = await getVisibleFolderIds(access);
  if (!visibleFolderIds.length) return NextResponse.json({ matches: [] });
  const matches = await db
    .select({
      wordId: words.id,
      setId: vocabSets.id,
      setName: vocabSets.name,
      category: vocabSets.category,
      setType: vocabSets.type,
      languageCode:vocabSets.languageCode,
      term: words.term,
      meaning: words.meaning,
      v1: words.v1,
      v2: words.v2,
      v3: words.v3,
      ipa: words.ipa,
      alternateTerm:words.alternateTerm,
      pronunciation:words.pronunciation,
      ipaV1: words.ipaV1,
      ipaV2: words.ipaV2,
      ipaV3: words.ipaV3,
    })
    .from(words)
    .innerJoin(vocabSets, eq(vocabSets.id, words.setId))
    .where(and(inArray(vocabSets.folderId, visibleFolderIds), or(
      ilike(words.term, pattern),
      ilike(words.meaning, pattern),
      ilike(words.example, pattern),
      ilike(words.alternateTerm,pattern),
      ilike(words.pronunciation,pattern),
      sql`replace(replace(translate(lower(coalesce(${words.pronunciation}, '')), 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü', 'aaaaeeeeiiiioooouuuuvvvvv'), ' ', ''), '''', '') like ${pinyinPattern}`,
      ilike(words.examplePronunciation,pattern),
      ilike(words.exampleMeaning,pattern),
      ilike(words.v1, pattern),
      ilike(words.v2, pattern),
      ilike(words.v3, pattern),
      ilike(vocabSets.name, pattern),
      ilike(vocabSets.category, pattern),
    )))
    .orderBy(asc(vocabSets.name), asc(words.term), asc(words.v1))
    .limit(50);

  return NextResponse.json({ matches });
}
