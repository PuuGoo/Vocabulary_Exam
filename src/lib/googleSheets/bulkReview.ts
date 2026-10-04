import { createHash } from "node:crypto";
import type { WordChange } from "./reliability";

export type UpdateReview = { fingerprint: string; activeCount: number; changedCount: number; rows: WordChange[] };

export function blocksBulkUpdate(active: number, changed: number, environment: Record<string, string | undefined> = process.env) {
  const configuredMinimum = Number(environment.GOOGLE_SHEETS_BULK_UPDATE_MIN_ROWS);
  const configuredFraction = Number(environment.GOOGLE_SHEETS_BULK_UPDATE_FRACTION);
  const minimum = Number.isSafeInteger(configuredMinimum) && configuredMinimum > 0 ? configuredMinimum : 20;
  const fraction = Number.isFinite(configuredFraction) && configuredFraction > 0 && configuredFraction <= 1 ? configuredFraction : 0.5;
  return changed >= minimum && active > 0 && changed / active >= fraction;
}

export function bulkDeletionThresholds(environment: Record<string, string | undefined> = process.env) {
  const minimumRows = Number(environment.GOOGLE_SHEETS_BULK_DELETE_MIN_ROWS);
  const fraction = Number(environment.GOOGLE_SHEETS_BULK_DELETE_FRACTION);
  return {
    minimumRows: Number.isSafeInteger(minimumRows) && minimumRows > 0 ? minimumRows : 5,
    fraction: Number.isFinite(fraction) && fraction > 0 && fraction <= 1 ? fraction : 0.25,
  };
}

export type DeletionReview = {
  fingerprint: string;
  activeCount: number;
  missingCount: number;
  rows: Array<{ sourceId: string; wordId: number; word: string }>;
};

export function deletionReviewFingerprint(snapshot: {
  connectionId: number;
  spreadsheetId: string;
  deleteBehavior: string;
  grid: unknown;
  words: unknown;
  mappings: unknown;
}): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
