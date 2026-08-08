import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";

export const REGISTRATION_SETTING_KEY = "public_registration_open";

export async function isPublicRegistrationOpen() {
  try {
    const [setting] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, REGISTRATION_SETTING_KEY)).limit(1);
    return setting?.value !== "false";
  } catch {
    // Keep existing installations usable until their migration has run.
    return true;
  }
}
