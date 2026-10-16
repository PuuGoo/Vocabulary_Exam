import type { AdminPermission } from "@/lib/adminPermissions";

export interface NavItem {
  id: string;
  href: string;
  label: string;
  labelKey: string;
  defaultLabel: string;
  icon: string;
  matchPrefixes: string[];
  permissions?: AdminPermission[];
}

export type NavigationItem = {
  id?: string;
  href: string;
  label: string;
  labelKey?: string;
  defaultLabel?: string;
  icon: string;
  matchPrefixes?: string[];
  permissions?: AdminPermission[];
};

export type NavigationSection = { label?: string; items: NavigationItem[] };

/**
 * Streamlined 4-Pillar B2C Navigation for Personal Self-Learners
 * Replaces old LMS navigation (/dashboard, /study, /assignments, /my-words)
 */
export const STUDENT_PRIMARY_NAV: NavItem[] = [
  {
    id: "today",
    href: "/dashboard",
    label: "Today (SRS)",
    labelKey: "nav.today",
    defaultLabel: "Today (SRS)",
    icon: "⚡",
    matchPrefixes: ["/dashboard", "/study-planner", "/daily-challenge", "/review", "/review-today", "/smart-review", "/review-center"],
  },
  {
    id: "library",
    href: "/library",
    label: "Library & Vault",
    labelKey: "nav.library",
    defaultLabel: "Library & Vault",
    icon: "📚",
    matchPrefixes: ["/library", "/my-words", "/vocabulary-vault", "/notebook", "/dictionary", "/s/"],
  },
  {
    id: "study",
    href: "/study",
    label: "4-Stage Study",
    labelKey: "nav.study",
    defaultLabel: "4-Stage Study",
    icon: "🎯",
    matchPrefixes: [
      "/study",
      "/learn",
      "/quiz",
      "/cloze",
      "/collocation",
      "/dictation",
      "/listen",
      "/match",
      "/pattern",
      "/pronunciation",
      "/sentence",
      "/tone",
      "/feynman",
      "/writing",
      "/mixed-practice",
    ],
  },
  {
    id: "analytics",
    href: "/analytics",
    label: "Insights",
    labelKey: "nav.analytics",
    defaultLabel: "Insights",
    icon: "📈",
    matchPrefixes: ["/analytics", "/progress", "/history", "/weekly-report", "/leaderboard"],
  },
];

export const ADMIN_NAV_SECTIONS: NavigationSection[] = [
  { items: [{ href: "/admin", label: "Tổng quan", icon: "⌂", permissions: ["admin.dashboard.view"] }] },
  {
    label: "Nội dung",
    items: [
      {
        href: "/admin/workspaces",
        label: "Không gian nội dung",
        icon: "▤",
        permissions: ["admin.dashboard.view", "vocab.view", "questions.view", "documents.view", "folders.create", "folders.share"],
      },
      {
        href: "/admin/sets",
        label: "Bộ từ & câu hỏi",
        icon: "Aa",
        permissions: ["vocab.view", "questions.view", "documents.view"],
      },
      {
        href: "/admin/import",
        label: "Nhập dữ liệu",
        icon: "↑",
        permissions: ["vocab.import", "questions.import"],
      },
    ],
  },
  {
    label: "Học viên",
    items: [
      { href: "/admin/users", label: "Người dùng", icon: "◎", permissions: ["users.view"] },
      { href: "/admin/classes", label: "Lớp học", icon: "▦", permissions: ["classes.view"] },
    ],
  },
  {
    label: "Đánh giá",
    items: [
      { href: "/admin/assignments", label: "Giao bài", icon: "✓", permissions: ["assignments.view"] },
      { href: "/admin/results", label: "Kết quả", icon: "◇", permissions: ["results.view"] },
      { href: "/admin/progress", label: "Tiến độ", icon: "↗", permissions: ["results.view"] },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      { href: "/admin/backup", label: "Sao lưu dữ liệu", icon: "↓", permissions: ["backup.create", "backup.restore"] },
      { href: "/admin/audit", label: "Nhật ký quản trị", icon: "◷", permissions: ["audit.view"] },
    ],
  },
];

export function filterAdminNavigation(permissions: ReadonlySet<AdminPermission>) {
  return ADMIN_NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.permissions?.length || item.permissions.some((permission) => permissions.has(permission)),
    ),
  })).filter((section) => section.items.length);
}

export const STUDENT_QUICK_LINKS: NavigationItem[] = [
  ...STUDENT_PRIMARY_NAV,
  { href: "/smart-review", label: "Smart Review", icon: "↻" },
  { href: "/review-center", label: "Ôn tập", icon: "↻" },
  { href: "/daily-challenge", label: "Thử thách hôm nay", icon: "✦" },
  { href: "/mixed-practice", label: "Luyện tập tổng hợp", icon: "◎" },
  { href: "/feynman", label: "Feynman Lab", icon: "F" },
  { href: "/writing", label: "Luyện câu hỏi", icon: "Q" },
  { href: "/dictionary", label: "Tra cứu", icon: "D" },
  { href: "/notebook", label: "Đã lưu", icon: "N" },
  { href: "/review", label: "Cần ôn", icon: "↻" },
  { href: "/leaderboard", label: "Bảng xếp hạng", icon: "#" },
  { href: "/history", label: "Lịch sử", icon: "◷" },
  { href: "/print-sets", label: "Phiếu học PDF", icon: "P" },
  { href: "/my-words", label: "Từ của tôi", icon: "Aa" },
  { href: "/progress", label: "Tiến độ", icon: "↗" },
];

export const ADMIN_QUICK_LINKS = ADMIN_NAV_SECTIONS.flatMap((section) => section.items);
export const LEARNING_TABS = STUDENT_QUICK_LINKS;
export const ADMIN_TABS = ADMIN_QUICK_LINKS;
