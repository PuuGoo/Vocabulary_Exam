import { z } from "zod";

export const syncRequestSchema = z.object({
  repairWatch: z.boolean().optional(),
  resolutions: z.array(z.object({
    sourceId: z.string().min(1).max(255),
    choice: z.enum(["sheet", "website"]),
    sheetFingerprint: z.string().length(32),
    dbFingerprint: z.string().length(32),
  })).max(100).optional(),
}).strict();

export type SyncRequest = z.infer<typeof syncRequestSchema>;
export type ConflictDetail = {
  rowNumber: number; sourceId: string; word: string; fieldsChanged: string[]; message: string;
  sheetFingerprint: string; dbFingerprint: string;
  before: Record<string, string>; after: Record<string, string>;
};
export type WordChange = {
  wordId: number; word: string; action: "update" | "keep_website" | "archive" | "delete";
  before: Record<string, string>; after: Record<string, string>;
};

export function matchingResolution(resolutions: SyncRequest["resolutions"], sourceId: string, sheetFingerprint: string, dbFingerprint: string) {
  return resolutions?.find((item) => item.sourceId === sourceId && item.sheetFingerprint === sheetFingerprint && item.dbFingerprint === dbFingerprint)?.choice;
}

export function blocksBulkDeletion(active: number, missing: number): boolean {
  return missing > 0 && (missing === active || (missing >= 5 && missing / active >= 0.25));
}

export function syncIsPartial(stats: { conflicts: unknown[]; invalidRows: unknown[]; deletionBlocked?: number; duplicateCount?: number }): boolean {
  return stats.conflicts.length > 0 || stats.invalidRows.length > 0 || (stats.deletionBlocked ?? 0) > 0 || (stats.duplicateCount ?? 0) > 0;
}
