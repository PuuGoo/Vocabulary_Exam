export type RouteMeta = { label: string };
export type Breadcrumb = { href: string; label: string };

/** Central route metadata keyed by the leading path segment (without slash), one per context. */
export const ROUTE_META: Record<string, RouteMeta> = {
  dashboard: { label: "Tổng quan" },
  library: { label: "Library & Vault" },
  analytics: { label: "Insights & Tiến độ" },
  study: { label: "Học & luyện" },
  assignments: { label: "Bài tập" },
  "my-words": { label: "Từ của tôi" },
  "vocabulary-vault": { label: "Từ của tôi" },
  progress: { label: "Tiến độ" },
  dictionary: { label: "Tra cứu" },
  notebook: { label: "Đã lưu" },
  review: { label: "Cần ôn" },
  "review-center": { label: "Ôn tập" },
  "review-today": { label: "Ôn tập hôm nay" },
  "smart-review": { label: "Ôn tập thông minh" },
  "daily-challenge": { label: "Thử thách hôm nay" },
  "mixed-practice": { label: "Luyện tập tổng hợp" },
  feynman: { label: "Feynman Lab" },
  writing: { label: "Luyện câu hỏi" },
  history: { label: "Lịch sử" },
  leaderboard: { label: "Bảng xếp hạng" },
  settings: { label: "Cài đặt tài khoản" },
  "print-sets": { label: "Phiếu học PDF" },
  "weekly-report": { label: "Báo cáo tuần" },
};

/** Admin route metadata keyed like the path segment: "admin/sets", "admin/users", ... */
export const ADMIN_ROUTE_META: Record<string, RouteMeta> = {
  admin: { label: "Tổng quan" },
  "admin/sets": { label: "Bộ từ & câu hỏi" },
  "admin/import": { label: "Nhập dữ liệu" },
  "admin/users": { label: "Người dùng" },
  "admin/classes": { label: "Lớp học" },
  "admin/assignments": { label: "Giao bài" },
  "admin/results": { label: "Kết quả" },
  "admin/progress": { label: "Tiến độ" },
  "admin/backup": { label: "Sao lưu dữ liệu" },
};

/** Learning mode child routes whose title should always describe the mode, never the raw id. */
const MODE_ROUTES = new Map([
  ["learn", "Flashcard"],
  ["quiz", "Luyện từ"],
  ["match", "Ghép cặp"],
  ["dictation", "Nghe & viết"],
  ["listen", "Nghe rảnh tay"],
  ["pronunciation", "Phát âm"],
  ["sentence", "Xếp câu"],
]);

export function breadcrumbsForPath(pathname: string): Breadcrumb[] {
  const parts = pathname.split("/").filter(Boolean);
  const crumb: Breadcrumb[] = [];
  const isAdmin = parts[0] === "admin";

  if (isAdmin) {
    crumb.push({ href: "/admin", label: "Tổng quan" });
    if (parts.length >= 2) {
      const key = "admin/" + parts[1];
      const meta = ADMIN_ROUTE_META[key];
      if (meta) crumb.push({ href: "/" + parts.slice(0, 2).join("/"), label: meta.label });
    }
    if (parts.length > 2) {
      const parent = parts[parts.length - 2];
      const label = parent === "sets" ? "Chi tiết bộ nội dung" : parts[parts.length - 1];
      crumb.push({ href: pathname, label });
    }
    return crumb;
  }

  crumb.push({ href: "/dashboard", label: "Tổng quan" });
  if (parts.length >= 1 && parts[0] !== "dashboard") {
    const modeLabel = MODE_ROUTES.get(parts[0]);
    if (modeLabel) {
      crumb.push({ href: "/study", label: "Học & luyện" });
      crumb.push({ href: pathname, label: modeLabel });
      return crumb;
    }
    const meta = ROUTE_META[parts[0]];
    if (meta) crumb.push({ href: "/" + parts[0], label: meta.label });
  }
  return crumb;
}

export function routePageTitle(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return null;
  if (parts[0] === "admin") {
    if (parts.length === 1) return ADMIN_ROUTE_META.admin.label;
    const key = "admin/" + parts[1];
    const meta = ADMIN_ROUTE_META[key];
    if (parts.length > 2 && parts[1] === "sets") return "Chi tiết bộ nội dung";
    return meta?.label ?? null;
  }
  const modeLabel = MODE_ROUTES.get(parts[0]);
  if (modeLabel) return modeLabel;
  return ROUTE_META[parts[0]]?.label ?? null;
}
