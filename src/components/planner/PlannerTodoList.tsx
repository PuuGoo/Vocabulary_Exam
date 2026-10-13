"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PlannerError, PlannerSkeleton } from "@/components/planner/PlannerUiPrimitives";
import {
  PlannerBar,
  PlannerChip,
  PlannerChips,
  PlannerEmpty,
  PlannerPill,
  PlannerPriority,
  PlannerSearch,
  PlannerTable,
  PlannerToolbar,
  PLANNER_INPUT,
  PLANNER_SEARCH_INPUT,
  formatDayMonth,
} from "@/components/planner/PlannerShell";

/**
 * Route 12 — Việc cần làm (client).
 *
 * Premium todo journal: search, count chips, priority/category filters, a real
 * table with inline completion toggles and archive, plus a create/edit drawer.
 * Reads and writes the existing /api/study-planner/todos endpoint only.
 */

type PlannerTodo = {
  id: number;
  taskTitle: string;
  completed: boolean;
  category: string | null;
  priority: string | null;
  dueDate: string | null;
  notes: string | null;
};

const CATEGORIES = ["Học tập", "Gia đình", "Sức khỏe", "Cá nhân"];
const PRIORITIES = ["Cao", "Trung bình", "Thấp"];

type FilterKey = "all" | "active" | "completed" | "overdue";

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function daysLeft(due: string | null, today: string): number | null {
  if (!due) return null;
  return Math.round((new Date(`${due}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);
}

export default function PlannerTodoList({ initial }: { initial: PlannerTodo[] }) {
  const [todos, setTodos] = useState<PlannerTodo[]>(initial);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<{ id: number | null; title: string; category: string; priority: string; dueDate: string; notes: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const today = todayIso();

  const signature = useMemo(() => initial.map((todo) => `${todo.id}:${todo.completed ? 1 : 0}:${todo.taskTitle}`).join("|"), [initial]);
  useEffect(() => {
    setTodos(initial);
  }, [signature, initial]);

  const toast = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? "" : current)), 1900);
  }, []);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/study-planner/todos", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { todos?: PlannerTodo[] };
      setTodos(data.todos ?? []);
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

  const isOverdue = useCallback((todo: PlannerTodo) => !todo.completed && Boolean(todo.dueDate) && (todo.dueDate as string) < today, [today]);

  const counts = useMemo(() => {
    return {
      all: todos.length,
      active: todos.filter((todo) => !todo.completed).length,
      completed: todos.filter((todo) => todo.completed).length,
      overdue: todos.filter(isOverdue).length,
    };
  }, [todos, isOverdue]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return todos.filter((todo) => {
      if (filter === "active" && todo.completed) return false;
      if (filter === "completed" && !todo.completed) return false;
      if (filter === "overdue" && !isOverdue(todo)) return false;
      if (category && (todo.category ?? "") !== category) return false;
      if (priority && (todo.priority ?? "") !== priority) return false;
      if (needle && !`${todo.taskTitle} ${todo.notes ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [todos, filter, category, priority, query, isOverdue]);

  async function toggle(todo: PlannerTodo) {
    const next = !todo.completed;
    setTodos((current) => current.map((item) => (item.id === todo.id ? { ...item, completed: next } : item)));
    setError("");
    try {
      const response = await fetch("/api/study-planner/todos", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: todo.id, completed: next }),
      });
      if (!response.ok) throw new Error("Không cập nhật được trạng thái");
      toast(next ? "Đã đánh dấu hoàn thành" : "Đã bỏ đánh dấu");
    } catch (failure) {
      setTodos((current) => current.map((item) => (item.id === todo.id ? { ...item, completed: todo.completed } : item)));
      setError(failure instanceof Error ? failure.message : "Không cập nhật được trạng thái");
    }
  }

  async function save() {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) {
      toast("Nhập tên việc trước nhé");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const isNew = draft.id == null;
      const payload = {
        taskTitle: title,
        category: draft.category || null,
        priority: draft.priority || null,
        dueDate: draft.dueDate || null,
        notes: draft.notes.trim() || null,
      };
      const response = await fetch("/api/study-planner/todos", {
        method: isNew ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(isNew ? payload : { ...payload, id: draft.id }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Lưu việc thất bại");
      setDraft(null);
      await reload();
      toast(isNew ? "Đã thêm việc" : "Đã lưu thay đổi");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Lưu việc thất bại");
    } finally {
      setSaving(false);
    }
  }

  const chips: { key: FilterKey; label: string }[] = [
    { key: "all", label: "Tất cả" },
    { key: "active", label: "Còn lại" },
    { key: "overdue", label: "Quá hạn" },
    { key: "completed", label: "Đã xong" },
  ];

  return (
    <div className="space-y-3">
      <PlannerToolbar>
        <PlannerSearch>
          <input
            aria-label="Tìm việc cần làm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm việc cần làm…"
            className={PLANNER_SEARCH_INPUT}
          />
        </PlannerSearch>
        <select aria-label="Lọc theo danh mục" value={category} onChange={(event) => setCategory(event.target.value)} className={PLANNER_INPUT}>
          <option value="">Mọi danh mục</option>
          {CATEGORIES.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <select aria-label="Lọc theo ưu tiên" value={priority} onChange={(event) => setPriority(event.target.value)} className={PLANNER_INPUT}>
          <option value="">Mọi ưu tiên</option>
          {PRIORITIES.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setDraft({ id: null, title: "", category: "", priority: "Trung bình", dueDate: today, notes: "" })}
          className="rounded-xl bg-[#1E3989] px-4 py-2 text-sm font-semibold text-white hover:bg-[#17306f]"
        >
          ＋ Thêm việc
        </button>
      </PlannerToolbar>

      <PlannerChips>
        {chips.map((chip) => (
          <PlannerChip key={chip.key} active={filter === chip.key} onClick={() => setFilter(chip.key)} label={chip.label} count={counts[chip.key]} />
        ))}
        {refreshing ? <span className="self-center text-xs text-slate-500">Đang làm mới…</span> : null}
      </PlannerChips>

      {counts.all ? (
        <div className="lexora-card border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Tiến độ hoàn thành</span>
            <span className="font-semibold text-slate-700">{counts.all ? Math.round((counts.completed / counts.all) * 100) : 0}%</span>
          </div>
          <div className="mt-2">
            <PlannerBar value={counts.all ? (counts.completed / counts.all) * 100 : 0} tone="ok" />
          </div>
        </div>
      ) : null}

      {error ? <PlannerError message={error} onRetry={() => void reload()} /> : null}

      {visible.length ? (
        <PlannerTable columns={["Xong", "Việc cần làm", "Danh mục", "Ưu tiên", "Hạn", "Còn lại", "Ghi chú", ""]} minWidth={980}>
          {visible.map((todo) => {
            const left = daysLeft(todo.dueDate, today);
            const overdue = isOverdue(todo);
            return (
              <tr key={todo.id} className="hover:bg-slate-50">
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => void toggle(todo)}
                    aria-pressed={todo.completed}
                    aria-label="Đánh dấu hoàn thành"
                    className={`grid h-6 w-6 place-items-center rounded-full border-2 text-xs transition ${
                      todo.completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent hover:border-[#1E3989]"
                    }`}
                  >
                    ✓
                  </button>
                </td>
                <td className="px-3 py-2.5">
                  <button type="button" onClick={() => setDraft({ id: todo.id, title: todo.taskTitle, category: todo.category ?? "", priority: todo.priority ?? "Trung bình", dueDate: todo.dueDate ?? "", notes: todo.notes ?? "" })} className="text-left">
                    <span className={`font-medium ${todo.completed ? "text-slate-400 line-through" : "text-slate-900"}`}>{todo.taskTitle}</span>
                  </button>
                </td>
                <td className="px-3 py-2.5">
                  {todo.category ? <PlannerPill tone="prog">{todo.category}</PlannerPill> : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2.5 text-slate-700">
                  <PlannerPriority value={todo.priority} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">{todo.dueDate ? formatDayMonth(todo.dueDate) : "—"}</td>
                <td className="px-3 py-2.5">
                  {todo.completed ? (
                    <PlannerPill tone="ok">✔ Xong</PlannerPill>
                  ) : left == null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <PlannerPill tone={overdue ? "late" : left <= 2 ? "or" : "prog"}>
                      {left < 0 ? `Quá hạn ${-left} ngày` : left === 0 ? "Hôm nay" : `Còn ${left} ngày`}
                    </PlannerPill>
                  )}
                </td>
                <td className="max-w-[240px] px-3 py-2.5 text-slate-500">{todo.notes || ""}</td>
                <td className="px-3 py-2.5">
                  <button type="button" onClick={() => setDraft({ id: todo.id, title: todo.taskTitle, category: todo.category ?? "", priority: todo.priority ?? "Trung bình", dueDate: todo.dueDate ?? "", notes: todo.notes ?? "" })} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50">
                    Sửa
                  </button>
                </td>
              </tr>
            );
          })}
        </PlannerTable>
      ) : refreshing ? (
        <PlannerSkeleton rows={4} />
      ) : (
        <PlannerEmpty
          title="Không có việc nào khớp bộ lọc."
          body="Thử đổi bộ lọc, hoặc bấm “＋ Thêm việc” để tạo mới."
        />
      )}

      {draft ? (
        <>
          <div className="fixed inset-0 z-[50] bg-slate-900/40" onClick={() => setDraft(null)} aria-hidden="true" />
          <aside role="dialog" aria-modal="true" aria-label={draft.id == null ? "Việc mới" : "Chi tiết việc"} className="fixed inset-y-0 right-0 z-[51] flex w-full max-w-[420px] flex-col bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">{draft.id == null ? "Việc mới" : "Chi tiết việc"}</h2>
              <button type="button" onClick={() => setDraft(null)} aria-label="Đóng" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm">✕</button>
            </header>
            <div className="flex-1 space-y-3 overflow-auto px-5 py-4">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-500">Việc cần làm</span>
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Ví dụ: Nộp bài tập nhóm" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-500">Danh mục</span>
                  <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <option value="">Chưa chọn</option>
                    {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-500">Ưu tiên</span>
                  <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    {PRIORITIES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-500">Hạn</span>
                <input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-500">Ghi chú</span>
                <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className="min-h-[70px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" />
              </label>
            </div>
            <footer className="flex items-center gap-2 border-t border-slate-200 px-5 py-3">
              <button type="button" onClick={() => setDraft(null)} className="ml-auto rounded-xl border border-slate-200 px-4 py-2 text-sm">Hủy</button>
              <button type="button" disabled={saving} onClick={() => void save()} className="rounded-xl bg-[#1E3989] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? "Đang lưu…" : "Lưu"}
              </button>
            </footer>
          </aside>
        </>
      ) : null}

      {notice ? (
        <div role="status" className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {notice}
        </div>
      ) : null}
    </div>
  );
}
