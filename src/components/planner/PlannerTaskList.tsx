"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  PlannerDeleteConfirm,
  PlannerError,
  PlannerSkeleton,
} from "@/components/planner/PlannerUiPrimitives";

/**
 * Nhật ký nhiệm vụ — sheet-faithful, premium task journal.
 *
 * Reads the real rows handed down by the server page and owns every
 * interaction: search, status chips, category/priority/date filters, grouping
 * by day, optimistic completion toggles, and a right-hand drawer that creates,
 * edits and archives a task through the existing /api/study-planner/tasks
 * endpoint. No local sample data: an empty journal renders an empty state.
 */

type PlannerTask = {
  id: number;
  lexoraId?: string;
  taskDate: string;
  taskTitle: string;
  completed: boolean;
  startTime?: number | null;
  endTime?: number | null;
  category?: string | null;
  ieltsSkill?: string | null;
  priority?: string | null;
  durationMinutes?: number | null;
  notes?: string | null;
  dueDate?: string | null;
  statusText?: string | null;
  compensatingTask?: string | null;
  ieltsMaterial?: string | null;
  ieltsTaskType?: string | null;
  ieltsBand?: string | number | null;
  ieltsMistakeAnalysis?: string | null;
};

type Tone = "ok" | "late" | "or" | "prog";

const CATEGORIES = ["Học tập", "IELTS", "Thể thao", "Cá nhân", "Ôn tập", "Làm thêm"];
const SKILLS = ["Vocabulary", "Grammar", "Pronunciation", "Listening", "Reading", "Speaking", "Writing"];
const PRIORITIES = ["Khẩn cấp", "Cao", "Bình thường", "Thấp"];
const WEEKDAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

const PRIORITY_DOT: Record<string, string> = {
  "Khẩn cấp": "bg-red-500",
  Cao: "bg-amber-500",
  "Bình thường": "bg-sky-500",
  Thấp: "bg-slate-400",
};

const BADGE: Record<Tone, string> = {
  ok: "bg-emerald-100 text-emerald-700",
  late: "bg-red-100 text-red-700",
  or: "bg-amber-100 text-amber-800",
  prog: "bg-sky-100 text-sky-800",
};

const RAIL: Record<Tone, string> = {
  ok: "border-l-emerald-500",
  late: "border-l-red-500",
  or: "border-l-amber-500",
  prog: "border-l-sky-500",
};

const TONE_BY_STATUS: Record<string, Tone> = {
  "Hoàn thành": "ok",
  "Đã hoàn thành bù": "ok",
  "Hoàn thành bù": "or",
  "Dời lịch": "or",
  "Quá hạn": "late",
  "Đang thực hiện": "prog",
};

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Sheets stores time as a fraction of a day; the drawer speaks HH:MM. */
function fractionToClock(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  const minutes = Math.round((value % 1) * 1440) % 1440;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function clockToFraction(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return Math.round(((hours * 60 + minutes) / 1440) * 1_000_000) / 1_000_000;
}

function taskMinutes(task: PlannerTask): number {
  if (task.durationMinutes != null) return task.durationMinutes;
  if (task.startTime != null && task.endTime != null) {
    const span = Math.round((task.endTime - task.startTime) * 1440);
    return span > 0 ? span : span + 1440;
  }
  return 0;
}

function formatDay(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [year, month, day] = iso.split("-").map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]}, ${pad(day)}/${pad(month)}/${year}`;
}

function shortDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

/**
 * Status parity with the workbook: the sheet's own derived column wins when it
 * has synced down, otherwise derive from completion, deadline and the notes
 * wording the workbook also keys off ("bù", "dời", "hoãn").
 */
function statusOf(task: PlannerTask, today: string): { label: string; tone: Tone } {
  const sheetStatus = (task.statusText ?? "").trim();
  if (sheetStatus) {
    const known = TONE_BY_STATUS[sheetStatus];
    if (known) return { label: sheetStatus, tone: known };
  }
  const haystack = `${task.notes ?? ""} ${task.taskTitle}`.toLowerCase();
  if (task.completed) {
    const makeUp = Boolean(task.compensatingTask) || /bù|dời/.test(haystack);
    return makeUp ? { label: "Hoàn thành bù", tone: "or" } : { label: "Hoàn thành", tone: "ok" };
  }
  if (/dời|hoãn/.test((task.notes ?? "").toLowerCase())) return { label: "Dời lịch", tone: "or" };
  const deadline = task.dueDate || task.taskDate;
  if (deadline && deadline < today) return { label: "Quá hạn", tone: "late" };
  return { label: "Đang thực hiện", tone: "prog" };
}

function groupKeyOf(task: PlannerTask): "todo" | "late" | "done" {
  const status = statusOf(task, todayIso());
  if (status.tone === "late") return "late";
  if (status.label === "Hoàn thành" || status.label === "Đã hoàn thành bù") return "done";
  return "todo";
}

type Draft = {
  taskTitle: string;
  taskDate: string;
  dueDate: string;
  startTime: string;
  endTime: string;
  category: string;
  priority: string;
  durationMinutes: string;
  notes: string;
  completed: boolean;
};

function draftFrom(task: PlannerTask): Draft {
  return {
    taskTitle: task.taskTitle ?? "",
    taskDate: task.taskDate ?? todayIso(),
    dueDate: task.dueDate ?? "",
    startTime: fractionToClock(task.startTime),
    endTime: fractionToClock(task.endTime),
    category: task.category ?? "",
    priority: task.priority ?? "Bình thường",
    durationMinutes: task.durationMinutes != null ? String(task.durationMinutes) : "",
    notes: task.notes ?? "",
    completed: task.completed,
  };
}

const emptyDraft = (): Draft => ({
  taskTitle: "",
  taskDate: todayIso(),
  dueDate: "",
  startTime: "",
  endTime: "",
  category: "",
  priority: "Bình thường",
  durationMinutes: "",
  notes: "",
  completed: false,
});

export default function PlannerTaskList({ initial }: { initial: PlannerTask[] }) {
  const [tasks, setTasks] = useState<PlannerTask[]>(initial);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "todo" | "late" | "done">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [editing, setEditing] = useState<{ id: number | null; task: PlannerTask | null } | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PlannerTask | null>(null);

  const signature = useMemo(
    () => initial.map((task) => `${task.id}:${task.completed ? 1 : 0}:${task.taskDate}:${task.taskTitle}`).join("|"),
    [initial],
  );

  useEffect(() => {
    setTasks(initial);
  }, [signature, initial]);

  const toast = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? "" : current)), 1900);
  }, []);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/study-planner/tasks", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { tasks?: PlannerTask[] };
      setTasks(data.tasks ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const onUpdated = () => {
      void reload();
    };
    window.addEventListener("study-planner:updated", onUpdated);
    return () => window.removeEventListener("study-planner:updated", onUpdated);
  }, [reload]);

  const today = todayIso();
  const visible = useMemo(() => tasks.filter((task) => task.taskTitle), [tasks]);

  const counts = useMemo(() => {
    const result = { all: visible.length, todo: 0, late: 0, done: 0 };
    for (const task of visible) {
      const key = groupKeyOf(task);
      result[key] += 1;
    }
    return result;
  }, [visible]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return visible.filter((task) => {
      if (statusFilter !== "all" && groupKeyOf(task) !== statusFilter) return false;
      if (categoryFilter && (task.category ?? "") !== categoryFilter) return false;
      if (priorityFilter && (task.priority ?? "") !== priorityFilter) return false;
      if (fromFilter && task.taskDate < fromFilter) return false;
      if (toFilter && task.taskDate > toFilter) return false;
      if (needle) {
        const haystack = `${task.taskTitle} ${task.notes ?? ""} ${task.category ?? ""} ${task.ieltsSkill ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [visible, query, statusFilter, categoryFilter, priorityFilter, fromFilter, toFilter]);

  const groups = useMemo(() => {
    const byDate = new Map<string, PlannerTask[]>();
    for (const task of filtered) {
      const bucket = byDate.get(task.taskDate);
      if (bucket) bucket.push(task);
      else byDate.set(task.taskDate, [task]);
    }
    return [...byDate.entries()]
      .sort((left, right) => right[0].localeCompare(left[0]))
      .map(([date, rows]) => ({
        date,
        rows: rows.slice().sort((left, right) => (left.startTime ?? 0) - (right.startTime ?? 0) || left.id - right.id),
        minutes: rows.reduce((sum, row) => sum + taskMinutes(row), 0),
        done: rows.filter((row) => row.completed).length,
      }));
  }, [filtered]);

  async function toggle(task: PlannerTask) {
    const nextCompleted = !task.completed;
    setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, completed: nextCompleted } : item)));
    setError("");
    try {
      const response = await fetch("/api/study-planner/tasks", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: task.id, completed: nextCompleted }),
      });
      if (!response.ok) throw new Error("Không cập nhật được trạng thái");
      toast(nextCompleted ? "Đã đánh dấu hoàn thành" : "Đã bỏ đánh dấu hoàn thành");
    } catch (failure) {
      setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, completed: !nextCompleted } : item)));
      setError(failure instanceof Error ? failure.message : "Không cập nhật được trạng thái");
    }
  }

  function openCreate() {
    setDraft(emptyDraft());
    setEditing({ id: null, task: null });
    setError("");
  }

  function openEdit(task: PlannerTask) {
    setDraft(draftFrom(task));
    setEditing({ id: task.id, task });
    setError("");
  }

  async function save() {
    const title = draft.taskTitle.trim();
    if (!title) {
      toast("Nhập tên nhiệm vụ trước nhé");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.taskDate)) {
      toast("Chọn ngày cho nhiệm vụ");
      return;
    }
    const start = clockToFraction(draft.startTime);
    const end = clockToFraction(draft.endTime);
    if (draft.startTime && draft.endTime && start === end) {
      toast("Giờ bắt đầu và kết thúc đang trùng nhau");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        taskTitle: title,
        taskDate: draft.taskDate,
        completed: draft.completed,
        dueDate: draft.dueDate || null,
        startTime: draft.startTime || null,
        endTime: draft.endTime || null,
        category: draft.category || null,
        priority: draft.priority || null,
        durationMinutes: draft.durationMinutes.trim() === "" ? null : Number(draft.durationMinutes),
        notes: draft.notes.trim() || null,
      };
      const isNew = editing?.id == null;
      const response = await fetch("/api/study-planner/tasks", {
        method: isNew ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(isNew ? payload : { ...payload, id: editing?.id }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Lưu nhiệm vụ thất bại");
      setEditing(null);
      await reload();
      toast(isNew ? "Đã thêm nhiệm vụ" : "Đã lưu thay đổi");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Lưu nhiệm vụ thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    setError("");
    try {
      const response = await fetch(`/api/study-planner/tasks?id=${encodeURIComponent(String(target.id))}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Lưu trữ nhiệm vụ thất bại");
      setEditing(null);
      await reload();
      toast("Đã lưu trữ nhiệm vụ");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Lưu trữ nhiệm vụ thất bại");
    }
  }

  const chips: { key: "all" | "todo" | "late" | "done"; label: string }[] = [
    { key: "all", label: "Tất cả" },
    { key: "todo", label: "Cần làm" },
    { key: "late", label: "Quá hạn" },
    { key: "done", label: "Hoàn thành" },
  ];

  return (
    <div className="space-y-3">
      <div className="lexora-card border-slate-200 bg-white p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
            <span aria-hidden="true" className="text-slate-400">
              ⌕
            </span>
            <input
              aria-label="Tìm nhiệm vụ, ghi chú"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm nhiệm vụ, ghi chú…"
              className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm outline-none"
            />
          </label>
          <select
            aria-label="Lọc theo phân loại"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">Mọi phân loại</option>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <select
            aria-label="Lọc theo mức ưu tiên"
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">Mọi mức ưu tiên</option>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
          <input
            aria-label="Từ ngày"
            type="date"
            value={fromFilter}
            onChange={(event) => setFromFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <input
            aria-label="Đến ngày"
            type="date"
            value={toFilter}
            onChange={(event) => setToFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={openCreate}
            className="rounded-xl bg-[#1A3A6E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16305a]"
          >
            ＋ Thêm nhiệm vụ
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((chip) => {
            const active = statusFilter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                aria-pressed={active}
                onClick={() => setStatusFilter(chip.key)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                  active
                    ? "border-[#1A3A6E] bg-[#1A3A6E] text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {chip.label}
                <span className="ml-1.5 text-xs opacity-80">{counts[chip.key]}</span>
              </button>
            );
          })}
          {refreshing ? <span className="self-center text-xs text-slate-500">Đang làm mới…</span> : null}
        </div>
      </div>

      {error ? <PlannerError message={error} onRetry={() => void reload()} /> : null}

      {groups.length === 0 ? (
        refreshing ? (
          <PlannerSkeleton rows={4} />
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
            <p className="font-semibold text-slate-800">Không có nhiệm vụ nào khớp bộ lọc.</p>
            <p className="mt-1">Thử đổi bộ lọc, hoặc bấm “＋ Thêm nhiệm vụ” để tạo mới.</p>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.date}>
              <header className="sticky top-0 z-10 flex flex-wrap items-baseline gap-2 bg-paper/95 py-2 backdrop-blur">
                <h2 className="text-sm font-semibold text-slate-800">{formatDay(group.date)}</h2>
                {group.date === today ? (
                  <span className="rounded-full bg-[#1A3A6E] px-2.5 py-0.5 text-xs font-medium text-white">Hôm nay</span>
                ) : null}
                <span className="ml-auto text-xs text-slate-500">
                  {group.done}/{group.rows.length} xong · {group.minutes.toLocaleString("vi-VN")} phút
                </span>
              </header>
              <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {group.rows.map((task) => {
                  const status = statusOf(task, today);
                  const minutes = taskMinutes(task);
                  const start = fractionToClock(task.startTime);
                  const end = fractionToClock(task.endTime);
                  return (
                    <li key={task.id} className={`border-l-4 ${RAIL[status.tone]} border-b border-slate-100 last:border-b-0`}>
                      <div className="flex flex-wrap items-center gap-3 px-3 py-3 sm:px-4">
                        <button
                          type="button"
                          onClick={() => void toggle(task)}
                          aria-pressed={task.completed}
                          aria-label="Đánh dấu hoàn thành"
                          className={`grid h-6 w-6 flex-none place-items-center rounded-full border-2 text-xs transition ${
                            task.completed
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : "border-slate-300 bg-transparent text-transparent hover:border-[#1A3A6E]"
                          }`}
                        >
                          ✓
                        </button>
                        <div className="w-[74px] flex-none text-xs leading-tight text-slate-500">
                          <b className="block text-sm font-semibold text-slate-800">{start || "--:--"}</b>
                          {end ? `→ ${end}` : ""}
                        </div>
                        <button type="button" onClick={() => openEdit(task)} className="min-w-0 flex-1 text-left">
                          <p className={`truncate text-sm font-medium ${task.completed ? "text-slate-400 line-through" : "text-slate-900"}`}>
                            {task.taskTitle}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <span
                              className={`rounded-full px-2 py-0.5 font-medium ${
                                task.category === "IELTS" ? "bg-[#e9eeff] text-[#1E3989]" : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {task.category || "Chưa phân loại"}
                            </span>
                            {task.ieltsSkill ? <span className="rounded-full bg-slate-100 px-2 py-0.5">{task.ieltsSkill}</span> : null}
                            {task.priority ? (
                              <span className="inline-flex items-center gap-1.5">
                                <i className={`h-2 w-2 rounded-full ${PRIORITY_DOT[task.priority] ?? "bg-slate-400"}`} aria-hidden="true" />
                                {task.priority}
                              </span>
                            ) : null}
                            {minutes ? <span>{minutes} phút</span> : null}
                            {task.dueDate && task.dueDate !== task.taskDate ? <span>hạn {shortDate(task.dueDate)}</span> : null}
                            {task.notes ? <span className="truncate">· {task.notes}</span> : null}
                          </div>
                        </button>
                        <span className={`flex-none rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE[status.tone]}`}>{status.label}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing ? (
        <TaskDrawer
          draft={draft}
          setDraft={setDraft}
          isNew={editing.id == null}
          task={editing.task}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={() => void save()}
          onDelete={() => {
            if (editing.task) setPendingDelete(editing.task);
          }}
        />
      ) : null}

      {pendingDelete ? (
        <PlannerDeleteConfirm
          title="Lưu trữ nhiệm vụ?"
          body={`“${pendingDelete.taskTitle}” sẽ được lưu trữ (không xoá vĩnh viễn) và có thể khôi phục từ Sheet.`}
          confirmLabel="Lưu trữ"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}

      {notice ? (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          {notice}
        </div>
      ) : null}
    </div>
  );
}

function TaskDrawer({
  draft,
  setDraft,
  isNew,
  task,
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  draft: Draft;
  setDraft: (next: Draft) => void;
  isNew: boolean;
  task: PlannerTask | null;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });

  const status = task ? statusOf(task, todayIso()) : null;

  return (
    <>
      <div className="fixed inset-0 z-[50] bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? "Nhiệm vụ mới" : "Chi tiết nhiệm vụ"}
        className="fixed inset-y-0 right-0 z-[51] flex w-full max-w-[440px] flex-col bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-2 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{isNew ? "Nhiệm vụ mới" : "Chi tiết nhiệm vụ"}</h2>
            <p className="text-xs text-slate-500">{isNew ? "Điền thông tin rồi bấm Lưu" : `${status?.label ?? ""}${task?.lexoraId ? ` · ${task.lexoraId}` : ""}`}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-auto px-5 py-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">Nhiệm vụ</span>
            <input
              ref={titleRef}
              value={draft.taskTitle}
              onChange={(event) => set("taskTitle", event.target.value)}
              placeholder="Ví dụ: Luyện đọc IELTS Passage Cam"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">Ngày</span>
              <input
                type="date"
                value={draft.taskDate}
                onChange={(event) => set("taskDate", event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">Hạn chót</span>
              <input
                type="date"
                value={draft.dueDate}
                onChange={(event) => set("dueDate", event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">Bắt đầu</span>
              <input
                type="time"
                step={300}
                value={draft.startTime}
                onChange={(event) => set("startTime", event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">Kết thúc</span>
              <input
                type="time"
                step={300}
                value={draft.endTime}
                onChange={(event) => set("endTime", event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">Phân loại</span>
              <select
                value={draft.category}
                onChange={(event) => set("category", event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <option value="">Chưa phân loại</option>
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">Mức ưu tiên</span>
              <select
                value={draft.priority}
                onChange={(event) => set("priority", event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">Thời lượng (phút)</span>
            <input
              type="number"
              min={0}
              max={1440}
              value={draft.durationMinutes}
              onChange={(event) => set("durationMinutes", event.target.value)}
              placeholder="Tự tính từ giờ bắt đầu / kết thúc nếu để trống"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">Ghi chú</span>
            <textarea
              value={draft.notes}
              onChange={(event) => set("notes", event.target.value)}
              className="min-h-[70px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
            />
          </label>

          {task && (task.ieltsSkill || task.ieltsMaterial || task.ieltsBand != null || task.ieltsMistakeAnalysis) ? (
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-700">Thông tin IELTS (đồng bộ từ Sheet)</p>
              {task.ieltsSkill ? <p className="mt-1">Kỹ năng: {task.ieltsSkill}</p> : null}
              {task.ieltsMaterial ? <p>Tài liệu: {task.ieltsMaterial}</p> : null}
              {task.ieltsTaskType ? <p>Dạng bài: {task.ieltsTaskType}</p> : null}
              {task.ieltsBand != null && task.ieltsBand !== "" ? <p>Band: {String(task.ieltsBand)}</p> : null}
              {task.ieltsMistakeAnalysis ? <p>Phân tích lỗi: {task.ieltsMistakeAnalysis}</p> : null}
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={draft.completed}
              onChange={(event) => set("completed", event.target.checked)}
              className="h-5 w-5 accent-[#1A3A6E]"
            />
            Đã hoàn thành
          </label>
        </div>

        <footer className="flex items-center gap-2 border-t border-slate-200 px-5 py-3">
          {isNew ? null : (
            <button type="button" onClick={onDelete} className="rounded-xl px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
              Lưu trữ
            </button>
          )}
          <button type="button" onClick={onClose} className="ml-auto rounded-xl border border-slate-200 px-4 py-2 text-sm">
            Hủy
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="rounded-xl bg-[#1A3A6E] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </footer>
      </aside>
    </>
  );
}
