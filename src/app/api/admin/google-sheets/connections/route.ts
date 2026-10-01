import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { db } from "@/db";
import { googleSheetConnections, googleSheetSyncChannels, vocabSets, words } from "@/db/schema";
import { getGoogleSheetTemplate } from "@/lib/googleSheets/template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await requireAdminPermission("google_sheets.view");
  if (isAuthorizationError(access)) return access;
  const url = new URL(req.url);
  const rawSetIds = url.searchParams.getAll("setId").flatMap((value) => value.split(",")).map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0);
  const connections = await db.select().from(googleSheetConnections).where(rawSetIds.length ? inArray(googleSheetConnections.setId, rawSetIds) : undefined).orderBy(googleSheetConnections.id);
  if (!connections.length) return NextResponse.json({ connections: [] });

  const setIds = [...new Set(connections.map((connection) => connection.setId))];
  const [sets, wordRows, channels] = await Promise.all([
    db.select({ id: vocabSets.id, name: vocabSets.name, type: vocabSets.type, languageCode: vocabSets.languageCode, folderId: vocabSets.folderId }).from(vocabSets).where(inArray(vocabSets.id, setIds)),
    db.select({ setId: words.setId, count: words.id }).from(words).where(inArray(words.setId, setIds)),
    db.select().from(googleSheetSyncChannels).where(inArray(googleSheetSyncChannels.connectionId, connections.map((connection) => connection.id))),
  ]);
  const setById = new Map(sets.map((set) => [set.id, set]));
  const countBySet = new Map<number, number>();
  for (const row of wordRows) countBySet.set(row.setId, (countBySet.get(row.setId) || 0) + 1);
  const channelByConnection = new Map(channels.map((channel) => [channel.connectionId, channel]));

  const items = connections.map((connection) => {
    const set = setById.get(connection.setId);
    const template = getGoogleSheetTemplate({ type: set?.type || "ielts_vocab", languageCode: set?.languageCode || "en" });
    const channel = channelByConnection.get(connection.id);
    return {
      ...connection,
      setName: set?.name ?? null,
      setType: set?.type ?? null,
      languageCode: set?.languageCode ?? null,
      folderId: set?.folderId ?? null,
      wordCount: countBySet.get(connection.setId) || 0,
      columnCount: template.fields.length,
      channelExpiresAt: channel?.expirationAt ?? null,
      nextReconciliationAt: channel?.expirationAt ?? null,
    };
  });
  return NextResponse.json({ connections: items });
}
