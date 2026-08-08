import { NextResponse } from "next/server";
import { isPublicRegistrationOpen } from "@/lib/registration";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ open: await isPublicRegistrationOpen() });
}
