import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getGoogleOAuthConfig, googleOAuthStateFor, GOOGLE_SHEETS_SCOPES, isGoogleOAuthConfigured } from "@/lib/googleSheets/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isGoogleOAuthConfigured()) return NextResponse.json({ error: "Google OAuth chưa được cấu hình." }, { status: 503 });
  const config = getGoogleOAuthConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: [...GOOGLE_SHEETS_SCOPES, "https://www.googleapis.com/auth/drive.readonly"].join(" "), include_granted_scopes: "true", access_type: "offline", prompt: "consent select_account", state: googleOAuthStateFor(session.userId, "/study-planner") }).toString();
  return NextResponse.redirect(url);
}
