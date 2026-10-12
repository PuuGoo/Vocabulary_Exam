import { eq } from "drizzle-orm";

import { db } from "@/db";
import { appSettings } from "@/db/schema";

/**
 * Active Study Planner template registry.
 *
 * The admin chooses which Google Sheet new personal copies are made from. The
 * bare spreadsheet id lives in app_settings under `study_planner.template_id`,
 * so the copy flow, the admin UI and the user-facing switch flow all read one
 * value. Only app_settings is touched here: no vocabulary table is involved.
 */
export const STUDY_PLANNER_TEMPLATE_SETTING_KEY = "study_planner.template_id";

/**
 * Accept either a bare spreadsheet id or a full Google Sheets URL
 * (https://docs.google.com/spreadsheets/d/<id>/edit?usp=sharing) and return the
 * bare id. Returns null when the input is not recognisable so callers reject
 * it with a 400 instead of sending a broken id to Google.
 */
export function extractPlannerTemplateId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch?.[1]) return urlMatch[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

/** Active template id, falling back when the setting was never saved. */
export async function getActivePlannerTemplateId(fallback: string): Promise<string> {
  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, STUDY_PLANNER_TEMPLATE_SETTING_KEY))
      .limit(1);
    if (!row?.value) return fallback;
    return extractPlannerTemplateId(row.value) ?? fallback;
  } catch {
    // A settings read failure must never block planner creation: the shipped
    // default template is still a valid fallback.
    return fallback;
  }
}

/** Persist the active template id. The caller validates the id first. */
export async function setActivePlannerTemplateId(templateId: string): Promise<void> {
  const now = new Date();
  await db
    .insert(appSettings)
    .values({ key: STUDY_PLANNER_TEMPLATE_SETTING_KEY, value: templateId, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: templateId, updatedAt: now } });
}

export function plannerTemplateUrl(templateId: string): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(templateId)}/edit`;
}
