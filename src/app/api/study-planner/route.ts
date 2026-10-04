import { getSession } from "@/lib/auth";
import { ensureStudyPlanner, findStudyPlanner } from "@/lib/studyPlanner";
import { loadGoogleToken } from "@/lib/googleSheets/auth";
import { classifyGoogleApiError } from "@/lib/googleSheets/errors";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const planner = await findStudyPlanner(session.userId);
  const token = planner ? null : await loadGoogleToken(session.userId);
  return Response.json({ planner, googleConnected: Boolean(planner || (token?.refreshToken && token.scope.split(/\s+/).includes("https://www.googleapis.com/auth/drive.readonly"))) });
}

export async function POST() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { return Response.json({ planner: await ensureStudyPlanner(session) }); }
  catch (error) {
    const classified = classifyGoogleApiError(error);
    const oauthRequired = ["OAUTH_REQUIRED", "OAUTH_REVOKED"].includes(classified.code);
    return Response.json({ oauthRequired, error: oauthRequired ? "Hãy kết nối Google của bạn." : "Chưa tạo được Planner. Kiểm tra quyền xem/sao chép Sheet mẫu của tài khoản Google, rồi thử lại." }, { status: oauthRequired ? 401 : 502 });
  }
}
