import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

// Pages that must be reachable without a session: the auth pages plus the
// public marketing/legal pages Google reads for the OAuth consent screen.
const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/", "/privacy", "/terms"];
// Exact public paths that never redirect an authenticated visitor away from
// the page itself. They are still exempt from the login redirect above.
const PUBLIC_PAGE_PATHS: readonly string[] = ["/", "/privacy", "/terms"];
export const BACKUP_CRON_PATH = "/api/cron/backup-email/daily";
// One daily entry point does both reconciliation and watch-channel renewal because
// Vercel Hobby rejects cron schedules that run more than once per day.
export const GOOGLE_SHEETS_CRON_PATHS = ["/api/cron/google-sheets/reconcile"] as const;

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Vercel Cron has no browser session. The route itself remains protected by
  // Authorization: Bearer <CRON_SECRET> and must be allowed to reach it.
  if (pathname === BACKUP_CRON_PATH || GOOGLE_SHEETS_CRON_PATHS.some((path) => pathname === path)) {

    return NextResponse.next();
  }

  // Always allow Next internals, api auth routes, and static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icons/")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  const isPublic = PUBLIC_PATHS.includes(pathname);
  const isSharePath = pathname === "/s" || pathname.startsWith("/s/") || pathname === "/api/share" || pathname.startsWith("/api/share/");
  // Drive push notifications arrive without a browser session; the route validates
  // the channel id/resource id/token itself. The OAuth callback redirects back in the
  // same authenticated browser tab, so it needs no session on the way in.
  const isGoogleSheetsPublic = pathname === "/api/webhooks/google-drive" || pathname === "/api/admin/google-sheets/oauth/callback";

  if (!session && !isPublic && !isSharePath && !isGoogleSheetsPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const isAuthPage = PUBLIC_PAGE_PATHS.includes(pathname) ? false : PUBLIC_PATHS.includes(pathname);
  if (session && isAuthPage) {
    const url = req.nextUrl.clone();
    url.pathname = session.role === "admin" ? "/admin" : "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (session && pathname.startsWith("/admin") && session.role !== "admin") {
    const url = req.nextUrl.clone();
    url.pathname = "/study";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (session && pathname.startsWith("/api/admin") && session.role !== "admin" && pathname !== "/api/admin/google-sheets/oauth/callback") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Note: "/" is intentionally left to the landing page. It renders the public
  // homepage for anonymous visitors and redirects signed-in users to their own
  // workspace, so no middleware redirect is applied here.

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
