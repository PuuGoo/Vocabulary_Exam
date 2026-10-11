import { createHash } from "node:crypto";

import { fingerprintFields } from "@/lib/googleSheets/fingerprint";

/**
 * Mirrors vocabulary's fingerprint contract but for planner domains.
 * One hash per record's stable content columns; display-aggregations and
 * the hidden __lexora_id never enter the hash, so sorting or reinserting
 * never looks like a content change.
 *
 * Planner fields hold numbers and booleans, not just strings, so the input
 * type is wider than the vocabulary FingerprintInput. Values are
 * canonicalized to text before hashing either way.
 */

export type PlannerFingerprintInput = Record<string, unknown>;

export const PLANNER_FINGERPRINT_VERSION = "planner-v1";

function canonicalPlannerValue(value: unknown): string {
  if (value == null) return "";
  return String(value).normalize("NFC").replace(/\s+/g, " ").trim();
}

export function fingerprintPlannerFields(keys: readonly string[], fields: PlannerFingerprintInput): string {
  const payload = keys.map((key) => `${key}=${canonicalPlannerValue(fields[key])}`).join("|");
  return fingerprintFields(
    { __planner: payload, __version: PLANNER_FINGERPRINT_VERSION },
    ["__planner", "__version"],
  );
}

// One key list per domain — only the columns that actually carry user intent
// on the Sheet. Controls (selected_date/month) are versioned separately.
const TASK_KEYS = [
  "task_date",
  "completed",
  "start_time",
  "end_time",
  "category",
  "ielts_skill",
  "task_title",
  "priority",
  "duration_minutes",
  "notes",
  "due_date",
  "compensating_task",
  "status_text",
] as const;
const IELTS_KEYS = ["ielts_material", "ielts_task_type", "ielts_band", "ielts_mistake_analysis"] as const;
const COURSE_KEYS = ["course_name", "course_code", "lecturer", "credits", "notes", "score", "grade_point"] as const;
const SESSION_KEYS = ["weekday", "start_time", "end_time", "room"] as const;
const CURRICULUM_KEYS = ["subject", "topic", "expected_week", "status_text", "completed", "notes"] as const;
const ASSIGNMENT_KEYS = [
  "subject",
  "description",
  "category",
  "status_text",
  "duration_hours",
  "due_time",
  "due_date",
  "notes",
  "grade",
] as const;
const READING_KEYS = ["subject", "title", "author", "target_pages", "current_page", "total_pages", "notes"] as const;
const ATTENDANCE_MARK_KEYS = ["course_name", "session_index", "mark"] as const;
const HABIT_KEYS = ["name"] as const;
const HABIT_COMPLETION_KEYS = ["completion_date", "completed"] as const;
const TODO_KEYS = ["task_title", "category", "priority", "due_date", "notes", "completed"] as const;
const ACTIVITY_KEYS = ["activity_date", "start_time", "end_time", "activity_name", "activity_type", "notes"] as const;
const SETTINGS_KEYS = ["semester_start", "semester_end", "semester_weeks", "target_ielts"] as const;

type Domain =
  | "task"
  | "course"
  | "session"
  | "curriculum"
  | "assignment"
  | "reading"
  | "attendanceMark"
  | "habit"
  | "habitCompletion"
  | "todo"
  | "activity"
  | "settings";

const KEYS_BY_DOMAIN: Record<Domain, readonly string[]> = {
  task: [...TASK_KEYS, ...IELTS_KEYS],
  course: COURSE_KEYS,
  session: SESSION_KEYS,
  curriculum: CURRICULUM_KEYS,
  assignment: ASSIGNMENT_KEYS,
  reading: READING_KEYS,
  attendanceMark: ATTENDANCE_MARK_KEYS,
  habit: HABIT_KEYS,
  habitCompletion: HABIT_COMPLETION_KEYS,
  todo: TODO_KEYS,
  activity: ACTIVITY_KEYS,
  settings: SETTINGS_KEYS,
};

/**
 * Stable key list for a domain, shared by sync, web API and reconciliation,
 * so the same value cannot hash two different ways.
 */
export function plannerFingerprintKeys(domain: Domain): readonly string[] {
  return KEYS_BY_DOMAIN[domain];
}

/**
 * Hash a normalized planner field bag for this domain. Feed this function the
 * same shape that lives in Postgres (never the raw Sheet row without
 * normalization), and it returns the fingerprint stored alongside the record.
 */
export function fingerprintPlannerRecord(domain: Domain, fields: PlannerFingerprintInput): string {
  return fingerprintPlannerFields(plannerFingerprintKeys(domain), fields);
}

/** Hex alias used when a fingerprint is streamed into a Sheets cell. */
export function fingerprintHex(fields: PlannerFingerprintInput, keys: readonly string[]): string {
  const material = keys.map((key) => `${key}=${canonicalPlannerValue(fields[key])}`).join("|");
  return createHash("sha256").update(`${PLANNER_FINGERPRINT_VERSION}:${material}`, "utf8").digest("hex").slice(0, 32);
}
