import type { Metadata } from "next";
import { getPublicSharePayload } from "@/lib/shares";
import ShareGuestExperience, { type ShareGuestPayload } from "@/components/ShareGuestExperience";
import SharePasswordGate from "@/components/SharePasswordGate";

export const metadata: Metadata = { title: "Nội dung được chia sẻ · Lexora", robots: { index: false, follow: false } };

export default async function SharedPage({ params, searchParams }: { params: { token: string }; searchParams: { mode?: string; set?: string; collection?: string; folder?: string } }) {
  const setId = Number(searchParams.set);
  const result = await getPublicSharePayload(params.token, searchParams.mode, Number.isInteger(setId) && setId > 0 ? setId : undefined, searchParams.collection, searchParams.folder);
  if (result.error === "password_required" && result.share) return <SharePasswordGate identifier={params.token} title={result.metadata.title} />;
  if (!result.share || result.error === "target_missing") return <ShareError title="Không tìm thấy nội dung được chia sẻ." />;
  if (result.error === "mode_not_allowed") return <ShareError title="Chế độ học này không được bật cho liên kết." />;
  return <ShareGuestExperience token={params.token} initialMode={searchParams.mode || ""} payload={result.payload as ShareGuestPayload} />;
}

function ShareError({ title }: { title: string }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#FAF9FD] p-5"><section className="w-full max-w-md rounded-2xl border border-line bg-white p-7 text-center shadow-sm"><div className="text-lg font-extrabold text-ink">Lexora</div><p className="mt-4 text-sm text-muted">{title}</p><a className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-ink px-5 text-sm font-bold text-white" href="/login">Về Lexora</a></section></main>;
}
