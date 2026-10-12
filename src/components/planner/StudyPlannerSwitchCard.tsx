"use client";

import { useState } from "react";

type TemplateInfo = { templateId: string; templateUrl: string; fallback?: string };

/**
 * User-facing switch template (Phase 12): a student who was created from the
 * old template can copy the *current admin template* into a new personal file
 * and flip their connection to it. Old file and study_planner_* rows stay on
 * disk; only the connection spreadsheetId + watch change. Vocabulary untouched.
 */
export default function StudyPlannerSwitchCard({ activeTemplate }: { activeTemplate: TemplateInfo | null }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function switchTemplate() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/study-planner/template-switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Không đổi template được.");
      setNotice(`Đã đổi sang template mới. Spreadsheet mới: ${payload.copiedId ?? ""}`);
      if (payload.spreadsheetId) {
        const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(payload.spreadsheetId)}/edit`;
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Không đổi template được.");
    } finally {
      setBusy(false);
    }
  }

  if (!activeTemplate) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Đổi sang template mới</h2>
      <p className="mt-1 text-xs text-slate-600">
        Nếu bạn đã tạo Planner từ template cũ và muốn dùng mẫu mới của Lexora, bấm nút dưới. Một bản copy mới sẽ được tạo trong Drive của bạn và kết nối đồng bộ sẽ chuyển sang Sheet mới. File cũ và dữ liệu web vẫn được giữ nguyên.
      </p>
      <a href={activeTemplate.templateUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-sky-600 underline">
        Xem template hiện tại
      </a>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void switchTemplate()} className="rounded-xl bg-gold px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "Đang tạo bản sao…" : "Đổi sang template mới"}
        </button>
      </div>
      {notice ? <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
