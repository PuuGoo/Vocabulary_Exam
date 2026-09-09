import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { questionParsingProfiles } from "@/db/schema";
import { isAuthorizationError, requireAdminPermission } from "@/lib/adminAuthorization";
import { ensureQuestionImportSchema } from "@/lib/questionImportDb";
const configSchema = z.object({ name: z.string().trim().min(1).max(128), config: z.record(z.unknown()) });
export async function GET() { const access = await requireAdminPermission("questions.view"); if (isAuthorizationError(access)) return access; await ensureQuestionImportSchema(); const profiles = await db.select().from(questionParsingProfiles).where(eq(questionParsingProfiles.createdBy, access.userId)).orderBy(asc(questionParsingProfiles.name)); return NextResponse.json({ profiles: profiles.map((row) => ({ ...row, config: JSON.parse(row.config) })) }); }
export async function POST(request: NextRequest) { const access = await requireAdminPermission("questions.import"); if (isAuthorizationError(access)) return access; await ensureQuestionImportSchema(); const parsed = configSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Profile không hợp lệ." }, { status: 400 }); const [profile] = await db.insert(questionParsingProfiles).values({ name: parsed.data.name, config: JSON.stringify(parsed.data.config), createdBy: access.userId }).onConflictDoUpdate({ target: [questionParsingProfiles.createdBy, questionParsingProfiles.name], set: { config: JSON.stringify(parsed.data.config), updatedAt: new Date() } }).returning(); return NextResponse.json({ profile }, { status: 201 }); }
