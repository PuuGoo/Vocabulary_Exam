import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Phase 4.3/4.4 — Planner conflict, bulk-change and archival policy.
 *
 * Mirrors src/lib/googleSheets/{reliability,bulkReview}.ts for the planner
 * domain, on the same architectural rules:
 *
 * - A normal Sheet edit is never a conflict just because its fingerprint
 *   differs from an older baseline. A conflict only exists when BOTH sides
 *   changed the same record since the last successful sync.
 * - Sorting/moving rows is movement, never delete+create (identity is the
 *   hidden __lexora_id, never the row number).
 * - A single vanished row is soft-archived by (connectionId, lexoraId) — no
 *   learning history is lost. Re-inserting the same lexoraId un-archives it.
 * - A large destructive change creates a snapshot + a planner bulk review and
 *   holds without applying, until an explicit approval with a matching
 *   fingerprint arrives.
 */

export const plannerSyncRequestSchema = z.object({
  updateApproval: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  deletionApproval: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  resolutions: z.array(z.object({
    lexoraId: z.string().min(1).max(64),
    choice: z.enum(["sheet", "website"]),
    sheetFingerprint: z.string().length(32),
    dbFingerprint: z.string().length(32),
  })).max(100).optional(),
}).strict();

export type PlannerSyncRequest = z.infer<typeof plannerSyncRequestSchema>;

export type PlannerConflictDetail = {
  domain: string;
  lexoraId: string;
  rowNumber: number;
  entityId: number | null;
  label: string;
  fieldsChanged: string[];
  message: string;
  sheetFingerprint: string;
  dbFingerprint: string;
  sheet: Record<string, string>;
  db: Record<string, string>;
};

export function matchingPlannerResolution(
  resolutions: PlannerSyncRequest["resolutions"],
  lexoraId: string,
  sheetFingerprint: string,
  dbFingerprint: string,
): "sheet" | "website" | undefined {
  return resolutions?.find(
    (item) => item.lexoraId === lexoraId && item.sheetFingerprint === sheetFingerprint && item.dbFingerprint === dbFingerprint,
  )?.choice;
}

export function plannerBulkDeletionThresholds(environment: Record<string, string | undefined> = process.env) {
  const minimumRows = Number(environment.STUDY_PLANNER_BULK_DELETE_MIN_ROWS);
  const fraction = Number(environment.STUDY_PLANNER_BULK_DELETE_FRACTION);
  return {
    minimumRows: Number.isSafeInteger(minimumRows) && minimumRows > 0 ? minimumRows : 5,
    fraction: Number.isFinite(fraction) && fraction > 0 && fraction <= 1 ? fraction : 0.25,
  };
}

/**
 * Hold when the change is large enough to deserve review: at least
 * `minimumRows` vanished and they are at least `fraction` of the active set,
 * or every single row vanished (a cleared tab is never an implicit delete-all).
 */
export function blocksPlannerBulkDeletion(active: number, missing: number, thresholds?: { minimumRows: number; fraction: number }): boolean {
  const minimumRows = thresholds?.minimumRows ?? 5;
  const fraction = thresholds?.fraction ?? 0.25;
  return missing > 0 && (missing === active || (missing >= minimumRows && missing / active >= fraction));
}

export function plannerBulkUpdateThresholds(environment: Record<string, string | undefined> = process.env) {
  const minimum = Number(environment.STUDY_PLANNER_BULK_UPDATE_MIN_ROWS);
  const fraction = Number(environment.STUDY_PLANNER_BULK_UPDATE_FRACTION);
  return {
    minimum: Number.isSafeInteger(minimum) && minimum > 0 ? minimum : 20,
    fraction: Number.isFinite(fraction) && fraction > 0 && fraction <= 1 ? fraction : 0.5,
  };
}

export function blocksPlannerBulkUpdate(active: number, changed: number, thresholds?: { minimum: number; fraction: number }): boolean {
  const minimum = thresholds?.minimum ?? 20;
  const fraction = thresholds?.fraction ?? 0.5;
  return changed >= minimum && active > 0 && changed / active >= fraction;
}

export function plannerReviewFingerprint(snapshot: unknown): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function plannerSyncIsPartial(stats: { conflicts: unknown[]; invalidRows: unknown[]; deletionBlocked?: number; updateBlocked?: number; duplicateCount?: number }): boolean {
  return (
    stats.conflicts.length > 0 ||
    stats.invalidRows.length > 0 ||
    (stats.deletionBlocked ?? 0) > 0 ||
    (stats.updateBlocked ?? 0) > 0 ||
    (stats.duplicateCount ?? 0) > 0
  );
}

