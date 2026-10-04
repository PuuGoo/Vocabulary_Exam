import { z } from "zod";

export const syncRequestSchema = z.object({
  updateApproval: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  deletionApproval: z.string().regex(/^[a-f0-9]{64}$/).optional(),
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
  sourceId?: string; rowNumber?: number; fieldsChanged?: string[];
  wordId: number; word: string; action: "update" | "keep_website" | "archive" | "delete";
  before: Record<string, string>; after: Record<string, string>;
};

export function matchingResolution(resolutions: SyncRequest["resolutions"], sourceId: string, sheetFingerprint: string, dbFingerprint: string) {
  return resolutions?.find((item) => item.sourceId === sourceId && item.sheetFingerprint === sheetFingerprint && item.dbFingerprint === dbFingerprint)?.choice;
}

export function blocksBulkDeletion(active: number, missing: number, thresholds?: { minimumRows: number; fraction: number }): boolean {
  const minimumRows = thresholds?.minimumRows ?? 5;
  const fraction = thresholds?.fraction ?? 0.25;
  return missing > 0 && (missing === active || (missing >= minimumRows && missing / active >= fraction));
}

export function syncIsPartial(stats: { conflicts: unknown[]; invalidRows: unknown[]; deletionBlocked?: number; updateBlocked?: number; duplicateCount?: number }): boolean {
  return stats.conflicts.length > 0 || stats.invalidRows.length > 0 || (stats.deletionBlocked ?? 0) > 0 || (stats.updateBlocked ?? 0) > 0 || (stats.duplicateCount ?? 0) > 0;
}
