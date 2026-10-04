"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import type { SheetHealthReport } from "@/lib/googleSheets/health";

export default function GoogleSheetsHealthDialog({ connectionId, onClose }: { connectionId: number; onClose: () => void }) {
  const [report, setReport] = useState<SheetHealthReport | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function inspect() {
      try {
        const response = await fetch(`/api/admin/google-sheets/connections/${connectionId}/health`, { method: "POST", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Không thể kiểm tra Sheet.");
        setReport(data);
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Không thể kết nối."); }
    }
    void inspect();
    return () => controller.abort();
  }, [connectionId]);
  return <Modal title="Kiểm tra Sheet" onClose={onClose}>
    {!report && !error && <p role="status">Đang kiểm tra quyền truy cập, cột, ID, công thức và webhook…</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {report && <div className="space-y-3 text-sm"><p className="font-semibold">{report.healthy ? "✓ Bình thường" : "⚠ Có vấn đề cần xử lý"}</p><p>{report.rowsScanned} dòng từ vựng · {report.pendingAiCells} ô chứa công thức AI. Google Sheets quyết định việc tạo kết quả.</p>{report.issues.map((issue, index) => <div key={`${issue.code}-${index}`} className="rounded-xl bg-amber-50 p-3"><p>{issue.message}</p>{issue.rows?.length ? <p className="mt-1 text-xs">Dòng: {issue.rows.join(", ")}</p> : null}</div>)}<p className="text-xs text-muted">Kiểm tra chỉ đọc, không sửa Sheet. Quyền ghi và khả năng nhận webhook thực tế cần được xác minh bằng thao tác sửa có chủ đích; kết quả này không thay thế kiểm thử realtime.</p></div>}
  </Modal>;
}
