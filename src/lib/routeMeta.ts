export type RouteMeta = { label: string };
export type Breadcrumb = { href: string; label: string };

/** Central route metadata keyed by the leading path segment (without slash), one per context. */
export const ROUTE_META: Record<string, RouteMeta> = {
  dashboard: { label: "Tổng quan" },
  study: { label: "Học & luyện" },
  assignments: { label: "Bài tập" },
  "my-words": { label: "Từ của tôi" },
  "vocabulary-vault": { label: "Từ của tôi" },
  progress: { label: "Tiến độ" },
  dictionary: { label: "Tra cứu" },
  notebook: { label: "Đã lưu" },
  review: { label: "Cần ôn" },
  "review-center": { label: "Ôn tập" },
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
      const segment = parts[parts.length - 1];
      crumb.push({ href: pathname, label: safeSegmentLabel(segment, safeSegmentLabel(parent, "Chi tiết")) });
    }
    return dedup(crumb);
  }

  // Student
  const rootKey = parts[0] || "dashboard";
  const rootMeta = ROUTE_META[rootKey];
  if (rootKey && rootKey !== "dashboard") {
    // If root is a learning mode with an id child, label the mode.
    if (MODE_ROUTES.has(rootKey)) {
      crumb.push({ href: `/${rootKey}`, label: ROUTE_META[rootKey]?.label || MODE_ROUTES.get(rootKey)! });
      const modeLabel = MODE_ROUTES.get(rootKey)!;
      crumb.push({ href: pathname, label: modeLabel });
      return dedup(crumb);
    }
    crumb.push({ href: `/${rootKey}`, label: rootMeta?.label || rootKey.replaceAll("-", " ") });
  } else {
    crumb.push({ href: "/dashboard", label: "Tổng quan" });
  }

  if (parts.length > 1 && !MODE_ROUTES.has(rootKey)) {
    const child = parts[parts.length - 1];
    const childMeta = ROUTE_META[child];
    crumb.push({ href: pathname, label: childMeta?.label || safeSegmentLabel(child, rootMeta?.label || "Chi tiết") });
  }
  return dedup(crumb);
}

function safeSegmentLabel(segment: string, fallback: string): string {
  if (!segment || /^\d+$/.test(segment)) return fallback;
  return ROUTE_META[segment]?.label || ADMIN_ROUTE_META["admin/" + segment]?.label || segment.replaceAll("-", " ");
}

function dedup(crumb: Breadcrumb[]): Breadcrumb[] {
  const out: Breadcrumb[] = [];
  for (const item of crumb) {
    if (out.length && out[out.length - 1].label === item.label) continue;
    out.push(item);
  }
  return out.length ? out : [{ href: "/", label: "Dashboard" }];
}

export function routePageTitle(pathname: string): string {
  return breadcrumbsForPath(pathname).at(-1)?.label || "Lexora";
}
