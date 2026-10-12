"use client";

import { useCallback, useEffect, useState } from "react";

type TemplateInfo = { templateId: string; templateUrl: string; fallback: string; isDefault: boolean };

/**
 * Admin Study Planner template panel.
 *
 * Shows the template every future personal copy is made from and lets an owner
 * swap it. Accepts either a full docs.google.com/spreadsheets/d/<id>/... URL
 * or a bare spreadsheet id; the server normalises it and stores the bare id.
 * The API only writes one app_settings row plus an audit event, so no
 * vocabulary table is ever involved.
 */
export default function StudyPlannerTemplateCard() {
  const [info, setInfo] = useState<TemplateInfo | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/study-planner/template", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? FAILED_LOAD);
      setInfo(data as TemplateInfo);
      setInput(data.templateUrl ?? "");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : FAILED_LOAD);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/study-planner/template", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateUrlOrId: input.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? FAILED_SAVE);
      setInfo((previous) => previous
        ? { ...previous, templateId: data.templateId, templateUrl: data.templateUrl, isDefault: data.templateId === previous.fallback }
        : previous);
      setNotice(SAVED);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : FAILED_SAVE);
    } finally {
      setBusy(false);
    }
  }

  async function resetToDefault() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/study-planner/template", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? FAILED_RESET);
      setInfo((previous) => previous
        ? { ...previous, templateId: data.templateId, templateUrl: data.templateUrl, isDefault: true }
        : previous);
      setNotice(RESET);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : FAILED_RESET);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="lexora-card space-y-3 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold">Study Planner: template Google Sheet</h2>
          <p className="mt-1 text-xs text-muted">{DESCRIPTION}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs ${info?.isDefault ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-700"}`}>
          {loading ? LOADING : info?.isDefault ? USING_DEFAULT : USING_CUSTOM}
        </span>
      </div>
      <form onSubmit={save} className="space-y-2">
        <label className="text-xs font-bold" htmlFor="planner-template-input">{LABEL}</label>
        <input
          id="planner-template-input"
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={PLACEHOLDER}
          className="h-11 w-full rounded-[11px] border border-line px-3 text-sm"
          disabled={busy || loading}
        />
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy || loading} className="h-11 rounded-[11px] bg-gold px-4 text-sm font-bold text-white disabled:opacity-50">
            {busy ? SAVING : SAVE}
          </button>
          <button type="button" disabled={busy || loading || info?.isDefault} onClick={() => void resetToDefault()} className="h-11 rounded-[11px] border border-line bg-white px-4 text-sm font-bold disabled:opacity-50">
            RESET_BUTTON
          </button>
          {info?.templateUrl ? (
            <a href={info.templateUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center rounded-[11px] border border-line bg-white px-4 text-sm">
              OPEN_TEMPLATE
            </a>
          ) : null}
        </div>
      </form>
      <p className="text-xs text-muted">{HINT}</p>
      {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </section>
  );
}

const FAILED_LOAD = "Không tải được template.";
const FAILED_SAVE = "Không lưu được template.";
const FAILED_RESET = "Không đặt lại được template.";
const SAVED = "Đã lưu template. Bản mới tạo sẽ copy từ Sheet này.";
const RESET = "Đã đặt lại về template mặc định.";
const DESCRIPTION = "Template này là mẫu mọi bản sao mới copy từ. Học viên đã có Planner cũ vẫn giữ nguyên dữ liệu; hệ chuyển sang template mới bằng nût đổi template trong trang Study Planner.";
const LOADING = "Đang tải…";
const USING_DEFAULT = "Đang dùng mặc định";
const USING_CUSTOM = "Đã đổi template";
const LABEL = "Link Google Sheet template";
const PLACEHOLDER = "https://docs.google.com/spreadsheets/d/…/edit";
const SAVE = "Lưu template";
const SAVING = "Đang lưu…";
const RESET_BUTTON = "Về mặc định";
const OPEN_TEMPLATE = "Mở template";
const HINT = "Dạng id Sheet Google thường bắt đầu bằng 1 và dài khoảng 44 ký tự.";
