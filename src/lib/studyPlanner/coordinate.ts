import { db } from "@/db";
import { studyPlannerWriteQueue } from "@/db/schema";
import { fingerprintPlannerRecord, plannerFingerprintKeys } from "@/lib/studyPlanner/fingerprint";
import { WORKBOOK_RANGES, type WorkbookTab } from "@/lib/studyPlanner/workbookMap";

/**
 * Phase 4.3 coordinate — coalesce web writes and tag them for echo matching.
 *
 * Multiple columns of the same row collapse into one contiguous range write.
 * Every queued write carries the fingerprint of the affected domain so the
 * webhook can compare it with the next sync fingerprint and skip the echo
 * instead of treating it as a fresh Sheet edit (no infinite Sheet->DB->Sheet
 * loop).
 */

export type WebWriteDomain = "course" | "task" | "curriculum" | "assignment" | "reading" | "todo" | "activity" | "habit" | "settings" | "session" | "habitCompletion" | "attendanceMark";

export type WebWriteInput = {
  connectionId: number;
  tab: WorkbookTab;
  rowNumber: number;
  valuesByColumn: Record<string, string | number | boolean | null>;
  fingerprintValues: Record<string, unknown>;
  domain: WebWriteDomain;
};

/** Sort column letters in sheet order (A < B < ... < Z < AA). */
export function sortColumnLetters(letters: string[]): string[] {
  return [...letters].sort((left, right) => lettersToIndex(left) - lettersToIndex(right));
}

function lettersToIndex(letters: string): number {
  let index = 0;
  for (const character of letters.toUpperCase()) index = index * 26 + (character.charCodeAt(0) - 64);
  return index;
}

/** Merge the columns of one row into the smallest contiguous range. */
export function contiguousWebRange(tab: WorkbookTab, rowNumber: number, columns: Record<string, unknown>): { rangeA1: string; letters: string[] } {
  const letters = sortColumnLetters(Object.keys(columns));
  if (!letters.length) throw new Error("No web-write columns");
  if (!Number.isSafeInteger(rowNumber) || rowNumber < 1) throw new Error("Invalid web-write row");
  return {
    rangeA1: `'${tab.replace(/'/g, "''")}'!${letters[0]}${rowNumber}:${letters[letters.length - 1]}${rowNumber}`,
    letters,
  };
}

export function fingerprintForWebWrite(domain: WebWriteDomain, values: Record<string, unknown>): string | null {
  const keys = plannerFingerprintKeys(domain);
  if (!keys.length) return null;
  return fingerprintPlannerRecord(domain, values);
}

/** Persist one web write to the queue, enforcing writable-column rules. */
export async function coordinateWebWrites(inputs: WebWriteInput[]): Promise<number[]> {
  const ids: number[] = [];
  for (const input of inputs) {
    const range = WORKBOOK_RANGES[input.tab];
    if (!range) throw new Error(`Tab ${input.tab} is not writable`);
    const writable = new Set([...range.sourceColumns, ...(range.controlColumns ?? [])]);
    for (const letter of Object.keys(input.valuesByColumn)) {
      if (!writable.has(letter)) throw new Error(`Column ${letter} on ${input.tab} is derived`);
    }
    const { rangeA1, letters } = contiguousWebRange(input.tab, input.rowNumber, input.valuesByColumn);
    const values = [letters.map((letter) => input.valuesByColumn[letter])];
    const expectedFingerprint = fingerprintForWebWrite(input.domain, input.fingerprintValues);
    const [row] = await db
      .insert(studyPlannerWriteQueue)
      .values({ connectionId: input.connectionId, rangeA1, valuesJson: JSON.stringify(values), expectedFingerprint, status: "pending", attempts: 0 })
      .returning({ id: studyPlannerWriteQueue.id });
    ids.push(row.id);
  }
  return ids;
}

