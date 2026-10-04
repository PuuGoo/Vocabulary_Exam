"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { formatDate } from "./types";

type Resource = { id: number; spreadsheetId: string; spreadsheetName: string; status: string; managedByLexora: boolean; createdAt: string };
const labels: Record<string, string> = { preparing: "Đang chuẩn bị hoặc thao tác đã gián đoạn", failed: "Chuẩn bị thất bại — chưa kích hoạt", active: "Đang hoạt động", replaced: "Đã thay thế — giữ trong Drive", trashed: "Đã đưa vào Thùng rác" };

export default function GoogleSheetsResourcesDialog({ connectionId, onClose }: { connectionId: number; onClose: () => void }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/google-sheets/connections/${connectionId}/resources`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "Không thể tải tài nguyên."); if (!controller.signal.aborted) setResources(result.resources); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Không thể tải tài nguyên."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [connectionId]);
  return <Modal title="Lịch sử tài nguyên Google Sheet" onClose={onClose}>
    <p className="mb-3 text-sm">Sheet tạo dở được giữ lại để kiểm tra, không tự xóa. Việc thay kết nối không xóa từ vựng hay lịch sử học.</p>
    {loading && <p role="status">Đang tải…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && !resources.length && <p>Chưa có lịch sử thay Sheet.</p>}
    <ul className="max-h-96 space-y-3 overflow-y-auto">{resources.map(resource => <li key={resource.id} className="rounded-lg border border-line p-3 text-sm">
      <a className="underline" href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(resource.spreadsheetId)}/edit`} target="_blank" rel="noopener noreferrer">{resource.spreadsheetName}</a>
      <p>{labels[resource.status] ?? resource.status}</p>
      <p>{resource.managedByLexora ? "Do Lexora tạo" : "Sheet bên ngoài"} · {formatDate(resource.createdAt)}</p>
    </li>)}</ul>
  </Modal>;
}
