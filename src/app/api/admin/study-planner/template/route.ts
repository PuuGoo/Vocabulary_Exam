import { NextRequest, NextResponse } from "next/server";

import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { extractPlannerTemplateId, getActivePlannerTemplateId, plannerTemplateUrl, setActivePlannerTemplateId, STUDY_PLANNER_TEMPLATE_SETTING_KEY } from "@/lib/studyPlanner/template";
import { PLANNER_TEMPLATE_ID } from "@/lib/studyPlanner";
import { writeAdminAudit } from "@/lib/adminAudit";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin Study Planner template. Only google_sheets.manage can read or write it.
 *
 * GET  returns the active template url/id (resolved from app_settings or the
 *      built-in fallback) and whether it differs from the shipped constant.
 * POST { templateUrlOrId?, templateId? } accepts a full spreadsheet url or a
 *      bare id; it normalises with extractPlannerTemplateId so the stored value
 *      is always a bare id. Assignments / users / backups are never touched.
 */
export async function GET() {
  const access = await requireAdminPermission("google_sheets.manage");
  if (isAuthorizationError(access)) return access;
  const templateId = await getActivePlannerTemplateId(PLANNER_TEMPLATE_ID);
  return NextResponse.json({
    settingKey: STUDY_PLANNER_TEMPLATE_SETTING_KEY,
    templateId,
    templateUrl: plannerTemplateUrl(templateId),
    fallback: PLANNER_TEMPLATE_ID,
    isDefault: templateId === PLANNER_TEMPLATE_ID,
  });
}

export async function PUT(req: NextRequest) {
  const access = await requireAdminPermission("google_sheets.manage");
  if (isAuthorizationError(access)) return access;
  const body = (await req.json().catch(() => null)) as { templateUrlOrId?: unknown; templateId?: unknown; templateUrl?: unknown; spreadsheetId?: unknown; url?: unknown } | null;
  const raw = (body?.templateUrlOrId as string | undefined)
    ?? (body?.templateId as string | undefined)
    ?? (body?.templateUrl as string | undefined)
    ?? (body?.spreadsheetId as string | undefined)
    ?? (body?.url as string | undefined)
    ?? "";
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return NextResponse.json({ error: "Thi\u1ebfu link ho\u1eb7c id Google Sheet." }, { status: 400 });
  }
  const templateId = extractPlannerTemplateId(raw);
  if (!templateId) return NextResponse.json({ error: "Link ho\u1eb7c id Google Sheet kh\u00f4ng h\u1ee3p l\u1ec7." }, { status: 400 });
  await setActivePlannerTemplateId(templateId);
  await writeAdminAudit(
    { actorUserId: access.userId, action: "study_planner.template.update", resourceType: "system_setting", resourceId: STUDY_PLANNER_TEMPLATE_SETTING_KEY, metadata: { templateId } },
  );
  const url = plannerTemplateUrl(templateId);
  return NextResponse.json({ ok: true, templateId, templateUrl: url });
}

export async function DELETE() {
  const access = await requireAdminPermission("google_sheets.manage");
  if (isAuthorizationError(access)) return access;
  await db.delete(appSettings).where(eq(appSettings.key, STUDY_PLANNER_TEMPLATE_SETTING_KEY));
  // Snap back to the shipped default so new copies still work.
  return NextResponse.json({ ok: true, templateId: PLANNER_TEMPLATE_ID, templateUrl: plannerTemplateUrl(PLANNER_TEMPLATE_ID), fallback: true });
}
