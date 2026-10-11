"use client";

import { useCallback, useEffect, useState } from "react";

type PlannerTask = {
  id: number;
  taskDate: string;
  taskTitle: string;
  completed: boolean;
  category: string | null;
  priority: string | null;
  durationMinutes: number | null;
  dueDate: string | null;
};

export default function PlannerTaskList({ initial }: { initial: PlannerTask[] }) {
  const [tasks, setTasks] = useState<PlannerTask[]>(initial);
  const [filterPriority, setFilterPriority] = useState<string>("");
  const [filterDate, setFilterDate] = useState<string>("");
  const [newTitle, setNewTitle] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  const sameDeps = [initial.length, ...initial.map((task) => task.id)];
  useEffect(() => { setTasks(initial); }, [initial.map((task) => `${task.id}-${task.completed}-${task.taskTitle}`).join("|")]);

  const reload = useCallback(async () => {
    const response = await fetch("/api/study-planner/tasks", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setTasks(data.tasks ?? []);
  }, []);

  useEffect(() => {
    const onUpdated = () => { void reload(); };
    window.addEventListener("study-planner:updated", onUpdated);
    return () => window.removeEventListener("study-planner:updated", onUpdated);
  }, [reload]);

  async function create() {
    const title = newTitle.trim();
    if (!title) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/study-planner/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskTitle: title, taskDate: new Date().toISOString().slice(0, 10) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Tạo nhiệm vụ thất bại");
      setNewTitle("");
      await reload();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Tạo nhiệm vụ thất bại"); }
    finally { setSaving(false); }
  }

  async function toggle(task: PlannerTask) {
    const nextCompleted = !task.completed;
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, completed: nextCompleted } : item));
    const response = await fetch("/api/study-planner/tasks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: task.id, completed: nextCompleted }),
    });
    if (!response.ok) {
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, completed: !nextCompleted } : item));
    }
  }

  async function archive(id: number) {
    const response = await fetch(`/api/study-planner/tasks?id=${encodeURIComponent(String(id))}`, { method: "DELETE" });
    if (response.ok) await reload();
  }

  const filtered = tasks.filter((task) => {
    if (filterPriority && (task.priority ?? "") !== filterPriority) return false;
    if (filterDate && task.taskDate !== filterDate) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Lọc theo ngày" type="date" value={filterDate} onChange={(event) => setFilterDate(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
        <select aria-label="Lọc theo mức ưu tiên" value={filterPriority} onChange={(event) => setFilterPriority(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Mọi mức ưu tiên</option>
          <option value="Cao">Cao</option>
          <option value="Trung bình">Trung bình</option>
          <option value="Thấp">Thấp</option>
        </select>
        <input aria-label="Tên nhiệm vụ mới" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void create(); }} placeholder="Thêm nhiệm vụ hôm nay…" className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
        <button type="button" disabled={saving || !newTitle.trim()} onClick={() => void create()} className="rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Thêm</button>
      </div>
      {filtered.length ? (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {filtered.map((task) => (
            <li key={task.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <button type="button" onClick={() => void toggle(task)} aria-pressed={task.completed} className={`flex h-7 w-7 items-center justify-center rounded-full border text-sm ${task.completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent"}`}>✓</button>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${task.completed ? "line-through text-slate-400" : ""}`}>{task.taskTitle}</p>
                <p className="text-xs text-slate-500">{task.taskDate} · {task.category ?? "—"} · {task.durationMinutes != null ? `${task.durationMinutes} phút` : "—"}{task.dueDate ? ` · hạn ${task.dueDate}` : ""}</p>
              </div>
              <button type="button" onClick={() => void archive(task.id)} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200">Lưu trữ</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">Chưa có nhiệm vụ nào cho bộ lọc hiện tại.</p>
      )}
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
