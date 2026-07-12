import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import SettingsForm from "./SettingsForm";
import Link from "next/link";
import ToastHost from "@/components/Toast";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const homeHref = session.role === "admin" ? "/admin/sets" : "/study";

  return (
    <div className="max-w-[560px] mx-auto px-4 pt-8 pb-16">
      <Link href={homeHref} className="text-[0.85rem] text-golddark hover:underline">
        ← Quay lại
      </Link>
      <h1 className="font-serif text-xl mt-3 mb-5">Cài đặt tài khoản</h1>
      <SettingsForm />
      <ToastHost />
    </div>
  );
}
