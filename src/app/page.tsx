import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();
  redirect(session ? (session.role === "admin" ? "/admin/sets" : "/study") : "/login");
}
