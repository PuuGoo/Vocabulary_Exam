"use client";

import { useMemo, useState } from "react";

type PlannerTodo = {
  id: number;
  taskTitle: string;
  completed: boolean;
  category: string | null;
  priority: string | null;
  dueDate: string | null;
  notes: string | null;
};

const FILTERS = [
  { key: "all", label: "Tất cả" },
  { key: "active", label: "Đang làm" },
  { key: "completed", label: "Hoàn thành" },
  { key: "overdue", label: "Quá hạn" },
] as const;

export default function PlannerTodoList({ initial }: { initial: PlannerTodo[] }) {
  const [todos, setTodos] = useState<PlannerTodo[]>(initial);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  const visible = useMemo(
    () =>
      todos.filter((todo) => {
        if (filter === "active") return !todo.completed;
        if (filter === "completed") return todo.completed;
        if (filter === "overdue") return !todo.completed && Boolean(todo.dueDate) && (todo.dueDate as string) < today;
        return true;
      }),
    [todos, filter, today],
  );

  async function create() {
    const value = title.trim();
    if (!value) return;
    setError("");
    const response = await fetch("/api/study-planner/todos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskTitle: value }),
    });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "Tạo việc cần làm thất bại"); return; }
    setTodos((current) => [data.todo as PlannerTodo, ...current]);
    setTitle("");
  }

  async function toggle(id: number, completed: boolean) {
    const previous = todos;
    setTodos((current) => current.map((todo) => todo.id === id ? { ...todo, completed: !completed } : todo));
    const response = await fetch("/api/study-planner/todos", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, completed: !completed }),
    });
    if (!response.ok) setTodos(previous);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-full px-3 py-1 text-xs ${filter === item.key ? "bg-gold text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input aria-label="Việc cần làm mới" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void create(); }} placeholder="Việc mới…" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
          <button type="button" onClick={() => void create()} className="rounded-xl bg-gold px-3 py-2 text-sm font-semibold text-white">Thêm</button>
        </div>
      </div>
      {visible.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {visible.map((todo) => {
            const overdue = !todo.completed && todo.dueDate && todo.dueDate < today;
            const remaining = todo.dueDate ? Math.round((new Date(`${todo.dueDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000) : null;
            return (
              <li key={todo.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <button type="button" onClick={() => void toggle(todo.id, todo.completed)} aria-pressed={todo.completed} aria-label="Đánh dấu hoàn thành" className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border text-xs ${todo.completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent"}`}>✓</button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${todo.completed ? "line-through text-slate-400" : ""}`}>{todo.taskTitle}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {todo.category ?? "—"} · {todo.priority ?? "—"}
                      {todo.dueDate ? ` · ${overdue ? "quá hạn" : remaining != null && remaining >= 0 ? `còn ${remaining} ngày` : `hạn ${todo.dueDate}`}` : ""}
                    </p>
                    {todo.notes ? <p className="mt-1 text-xs text-slate-600">{todo.notes}</p> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">Không có việc nào trong bộ lọc này.</p>
      )}
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
