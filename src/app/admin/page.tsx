import Link from "next/link";
import { isPublicRegistrationOpen } from "@/lib/registration";

const actions = [
  { href: "/admin/sets", title: "Bộ từ & câu hỏi", detail: "Quản lý nội dung học", icon: "Aa" },
  { href: "/admin/users", title: "Người dùng", detail: "Quản lý tài khoản học viên", icon: "◎" },
  { href: "/admin/classes", title: "Lớp học", detail: "Tổ chức học viên theo lớp", icon: "▦" },
  { href: "/admin/assignments", title: "Giao bài", detail: "Tạo và theo dõi bài tập", icon: "✓" },
];

export default async function AdminDashboardPage() {
  const registrationOpen = await isPublicRegistrationOpen();
  return <div className="lexora-page-enter space-y-6">
    <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="mb-2 text-sm font-semibold text-gold">Khu quản trị</p><h1 className="text-[clamp(1.8rem,4vw,2.5rem)] font-extrabold tracking-[-0.045em]">Quản lý học viện</h1><p className="mt-2 text-[0.95rem] text-muted">Quản lý nội dung, học viên và vận hành hệ thống.</p></div>
      <Link href="/admin/sets" className="inline-flex h-11 items-center justify-center self-start rounded-[11px] bg-gold px-4 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-golddark sm:self-auto">+ Tạo bộ từ</Link>
    </section>
    <section><p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted">Thao tác nhanh</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{actions.map((item) => <Link href={item.href} key={item.href} className="lexora-card flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-[#D8D2FF]"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-[#EFECFF] text-sm font-extrabold text-[#6550DB]">{item.icon}</span><span className="min-w-0"><b className="block text-sm">{item.title}</b><span className="mt-1 block text-xs text-muted">{item.detail}</span></span></Link>)}</div></section>
    <section className="lexora-card max-w-2xl p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Trạng thái hệ thống</p><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-extrabold">Đăng ký công khai</h2><p className="mt-1 text-xs text-muted">{registrationOpen ? "Học viên mới có thể tự đăng ký tài khoản." : "Đăng ký công khai hiện đang tắt."}</p></div><Link href="/admin/users#registration-settings" className="inline-flex h-10 items-center justify-center self-start rounded-[10px] border border-line bg-white px-3 text-xs font-bold hover:border-[#CFC7FF] hover:text-gold">Quản lý đăng ký</Link></div></section>
  </div>;
}
