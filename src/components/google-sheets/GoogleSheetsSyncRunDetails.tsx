"use client";
import Modal from "@/components/Modal";
import { SyncRun, formatDate } from "./types";
import GoogleSheetsSyncStats from "./GoogleSheetsSyncStats";
import { runStatus, triggerLabel } from "./GoogleSheetsSyncHistory";
import type { WordChange } from "@/lib/googleSheets/reliability";

export type ChangeDetail = { rowNumber: number; sourceId?: string; word?: string; fieldsChanged?: string[]; result: string; message?: string };

/** A run records aggregates; the row narrations below are the engine's own per-row reasons. */
export function runChangeDetails(run: SyncRun): ChangeDetail[] {
  let parsed: { invalidRows?: Array<{ rowNumber: number; message: string; sourceId?: string; word?: string; fieldsChanged?: string[] }>; conflictRows?: Array<{ rowNumber?: number; sourceId?: string; word?: string; fieldsChanged?: string[]; message?: string }> } = {};
  try {
    parsed = JSON.parse(run.metadata || "{}");
  } catch {
    parsed = {};
  }
  const invalid = (parsed.invalidRows ?? []).map((row) => ({
    rowNumber: row.rowNumber,
    sourceId: row.sourceId,
    word: row.word,
    fieldsChanged: row.fieldsChanged,
    result: "Không hợp lệ",
    message: row.message,
  }));
  const conflicts = (parsed.conflictRows ?? []).map((row, index) => ({
    rowNumber: row.rowNumber ?? 0,
    sourceId: row.sourceId,
    word: row.word,
    fieldsChanged: row.fieldsChanged,
    result: row.message || "Xung đột dữ liệu cần kiểm tra",
    message: row.message,
    key: `conflict-${index}`,
  }));
  void conflicts;
  return invalid;
}

export default function GoogleSheetsSyncRunDetails({ run, onClose }: { run: SyncRun; onClose: () => void }) {
  let metadata: { invalidRows?: Array<{ rowNumber: number; message: string; sourceId?: string; word?: string; fieldsChanged?: string[] }>; conflictRows?: Array<{ rowNumber?: number; sourceId?: string; word?: string; fieldsChanged?: string[]; message?: string }> } = {};
  let conflicts: Array<{ rowNumber?: number; sourceId?: string; word?: string; fieldsChanged?: string[]; message?: string }> = [];
  try {
    metadata = JSON.parse(run.metadata || "{}");
    if (!Array.isArray(metadata.conflictRows)) metadata.conflictRows = [];
    conflicts = metadata.conflictRows;
  } catch {
    metadata = {};
    conflicts = [];
  }
  const details = runChangeDetails(run);
  let changes: WordChange[] = [];
  try { changes = JSON.parse(run.metadata || "{}").changes ?? []; } catch { changes = []; }
  return (
    <Modal title="Chi tiết thay đổi" onClose={onClose}>
      <p className="text-sm font-semibold">{formatDate(run.finishedAt || run.startedAt)}</p>
      <p className="mb-4 mt-1 text-xs text-muted">
        {runStatus(run.status)} · {triggerLabel(run.triggerType)}
      </p>
      <GoogleSheetsSyncStats run={run} />
      {changes.map((change, index) => <details key={`${change.wordId}-${index}`} className="mt-3 rounded-xl border border-line p-3 text-sm"><summary>{change.word} · {change.action === "update" ? "Cập nhật" : change.action === "keep_website" ? "Giữ bản website" : change.action === "archive" ? "Lưu trữ" : "Xóa"}</summary><div className="overflow-x-auto"><table className="mt-2 w-full text-left text-xs"><thead><tr><th>Trường</th><th>Trước</th><th>Sau</th></tr></thead><tbody>{Object.keys(change.before).filter((key) => change.before[key] !== change.after[key]).map((key) => <tr key={key}><td className="p-2">{key}</td><td className="p-2 whitespace-pre-wrap">{change.before[key] || "—"}</td><td className="p-2 whitespace-pre-wrap">{change.after[key] || "—"}</td></tr>)}</tbody></table></div></details>)}
      {run.errorMessage ? <p className="mt-4 break-words rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{run.errorMessage}</p> : null}
      <h4 className="mb-2 mt-5 text-sm font-semibold">Chi tiết dòng</h4>
      {details.length === 0 && conflicts.length === 0 && changes.length === 0 ? (
        <p className="text-xs leading-5 text-muted">
          Lần chạy này chỉ lưu tổng số thay đổi (+tạo mới, ~cập nhật, −lưu trữ, =không đổi). Từng từ và từng trường thay đổi không được backend lưu riêng; Lexora không suy đoán dữ liệu đó.
        </p>
      ) : null}
      {details.map((row, index) => (
        <div key={`invalid-${index}`} className="mt-3 rounded-xl border border-line p-3 text-sm">
          <b>Dòng {row.rowNumber}</b>
          {row.sourceId ? <p className="break-all text-xs text-muted">ID: {row.sourceId}</p> : null}
          {row.word ? <p className="mt-1">Từ: {row.word}</p> : null}
          {row.fieldsChanged && row.fieldsChanged.length ? <p className="mt-1 text-xs text-muted">Trường đã đổi: {row.fieldsChanged.join(", ")}</p> : null}
          <p className="mt-1 break-words text-red-700">{row.message}</p>
        </div>
      ))}
      {conflicts.map((row, index) => (
        <div key={`conflict-${index}`} className="mt-3 rounded-xl border border-line p-3 text-sm">
          <b>Dòng {row.rowNumber ?? "—"}</b>
          <p className="break-all text-xs text-muted">ID: {row.sourceId || "Chưa có"}</p>
          {row.word ? <p className="mt-1">Từ: {row.word}</p> : null}
          {row.fieldsChanged && row.fieldsChanged.length ? <p className="mt-1 text-xs text-muted">Trường đã đổi: {row.fieldsChanged.join(", ")}</p> : null}
          <p className="mt-1">{row.message || "Xung đột dữ liệu cần kiểm tra"}</p>
        </div>
      ))}
    </Modal>
  );
}
