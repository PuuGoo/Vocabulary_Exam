import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { questionParsingProfiles } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { ensureQuestionImportSchema } from "@/lib/questionImportDb";
const configSchema = z.object({ name: z.string().trim().min(1).max(128), config: z.object({ questionPattern: z.string().max(512).optional(), optionPattern: z.string().max(512).optional(), answerPattern: z.string().max(512).optional(), explanationPattern: z.string().max(512).optional(), defaultType: z.enum(["multiple_choice", "true_false", "essay", "speaking", "unknown"]).optional() }) });
export async function GET() { const session = await getSession(); if (session?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 }); await ensureQuestionImportSchema(); const profiles = await db.select().from(questionParsingProfiles).where(eq(questionParsingProfiles.createdBy, session.userId)).orderBy(asc(questionParsingProfiles.name)); return NextResponse.json({ profiles: profiles.map((row) => ({ ...row, config: JSON.parse(row.config) })) }); }
export async function POST(request: NextRequest) { const session = await getSession(); if (session?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 }); await ensureQuestionImportSchema(); const parsed = configSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Profile không hợp lệ." }, { status: 400 }); const [profile] = await db.insert(questionParsingProfiles).values({ name: parsed.data.name, config: JSON.stringify(parsed.data.config), createdBy: session.userId }).onConflictDoUpdate({ target: [questionParsingProfiles.createdBy, questionParsingProfiles.name], set: { config: JSON.stringify(parsed.data.config), updatedAt: new Date() } }).returning(); return NextResponse.json({ profile }, { status: 201 }); }
