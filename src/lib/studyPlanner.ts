import { createHmac } from "node:crypto";
import { google } from "googleapis";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { studyPlanners } from "@/db/schema";
import { getGoogleOAuthConfig, loadGoogleToken } from "./googleSheets/auth";
import { GoogleSheetsError } from "./googleSheets/errors";

export const PLANNER_TEMPLATE_ID = "1uA6I3fGgr9Sh4pKxmw5I6UVX6Ib4PKa2WCSCFgH-MTY";
export const PLANNER_TAB_ID = 2127813405;
export const plannerUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit#gid=${PLANNER_TAB_ID}`;

export async function findStudyPlanner(userId: number) {
  const [planner] = await db.select().from(studyPlanners).where(eq(studyPlanners.userId, userId));
  return planner ? { url: plannerUrl(planner.spreadsheetId) } : null;
}

export type PlannerCopyApi = { find: (key: string) => Promise<string | null>; copy: (key: string, name: string) => Promise<string> };

async function googlePlannerApi(userId: number): Promise<PlannerCopyApi> {
  const token = await loadGoogleToken(userId);
  if (!token?.refreshToken) throw new GoogleSheetsError("Kết nối Google để tạo Study Planner trong Drive của bạn.", "OAUTH_REQUIRED");
  if (!token.scope.split(/\s+/).includes("https://www.googleapis.com/auth/drive.readonly")) throw new GoogleSheetsError("Kết nối Google để cấp quyền đọc Sheet mẫu.", "OAUTH_REQUIRED");
  const config = getGoogleOAuthConfig();
  const auth = new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
  auth.setCredentials({ access_token: token.accessToken, refresh_token: token.refreshToken, expiry_date: token.expiresAt.getTime() });
  const drive = google.drive({ version: "v3", auth });
  return {
    find: async key => {
      const result = await drive.files.list({ q: `trashed = false and appProperties has { key='lexoraPlanner' and value='${key}' }`, fields: "files(id)", pageSize: 2 });
      if ((result.data.files?.length ?? 0) > 1) throw new Error("Multiple planner copies need review");
      return result.data.files?.[0]?.id ?? null;
    },
    copy: async (key, name) => {
      const result = await drive.files.copy({ fileId: PLANNER_TEMPLATE_ID, fields: "id", requestBody: { name: `Study Planner - ${name}`, appProperties: { lexoraPlanner: key } } }, { retry: false });
      if (!result.data.id) throw new Error("Google did not return a copied file");
      return result.data.id;
    },
  };
}

export async function ensureStudyPlanner(user: { userId: number; displayName: string }, override?: PlannerCopyApi) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(73421, ${user.userId})`);
    const [existing] = await tx.select().from(studyPlanners).where(eq(studyPlanners.userId, user.userId));
    if (existing) return { url: plannerUrl(existing.spreadsheetId) };
    const api = override ?? await googlePlannerApi(user.userId);
    const secret = process.env.GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY;
    if (!secret) throw new Error("Planner identity secret not configured");
    const key = createHmac("sha256", secret).update(`study-planner:${user.userId}`).digest("hex");
    const spreadsheetId = await api.find(key) ?? await api.copy(key, user.displayName);
    await tx.insert(studyPlanners).values({ userId: user.userId, spreadsheetId });
    return { url: plannerUrl(spreadsheetId) };
  });
}
