"use client";
import { useState } from "react";
import Modal from "@/components/Modal";
import { Connection, danger, formatDate, primary, secondary, templateLabel } from "./types";
import { AI_PROMPTS, aiColumnsForTemplate, type AiPromptKey } from "@/lib/googleSheets/aiFormula";

export type AiPromptApplyStats = {
  updatedFormulaCells: number;
  blankCellsFilled: number;
  protectedUserCells: number;
  columnsUpdated: number;
  rowsScanned: number;
};

export default function GoogleSheetsSettings({ connection, canManage, canSync, busy, channel, onClose, onPause, onDisconnect, onSync, onDeleteBehavior, onAiEnrich, onAiPrompts }: { connection: Connection; canManage: boolean; canSync: boolean; busy: string | null; channel: Record<string, unknown> | null; onClose: () => void; onPause: () => void; onDisconnect: () => void; onSync: () => void; onDeleteBehavior: (value: string) => void; onAiEnrich: (value: boolean) => void; onAiPrompts: (value: Record<string, string>, handlers?: { onStats?: (stats: AiPromptApplyStats) => void; onError?: (message: string) => void }) => void }) {
  const [advanced, setAdvanced] = useState(false);
  const [promptDraft, setPromptDraft] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const plan of aiColumnsForTemplate(connection.templateType)) {
      initial[plan.key] = connection.aiPrompts?.[plan.key] ?? AI_PROMPTS[plan.prompt];
    }
    return initial;
  });
  const broken = connection.status === "error" || connection.status === "disconnected";
  const autoOn = connection.enabled && !broken;
  // Operation B ("Lưu & áp dụng cho Sheet") rewrites live formulas, so it is
  // confirmed first. Operation A ("Lưu prompt") only touches the database.
  const [confirmApply, setConfirmApply] = useState(false);
  const [applyStats, setApplyStats] = useState<AiPromptApplyStats | null>(null);
  const [applyError, setApplyError] = useState("");
  const dirty = aiColumnsForTemplate(connection.templateType).some((plan) => (promptDraft[plan.key] ?? "") !== (connection.aiPrompts?.[plan.key] ?? AI_PROMPTS[plan.prompt as AiPromptKey]));
  return (
    <Modal title="Cài đặt Google Sheets" onClose={onClose}>
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-50 p-4">
          <div>
            <b>Tự động đồng bộ: {autoOn ? "BẬT" : "TẮT"}</b>
            <p className="mt-1 text-xs text-muted">Lexora tự nhận thay đổi từ Google Sheet.</p>
          </div>
          {canManage ? (
            <button type="button" role="switch" aria-checked={autoOn} aria-label="Tự động đồng bộ" className={secondary} disabled={!!busy || broken} onClick={onPause}>
              {connection.enabled ? "Tắt" : "Bật"}
            </button>
          ) : null}
        </div>
        {/* Google Sheets owns AI generation; Lexora only decides whether the
            Sheet is created with the native AI formula columns. This toggle
            never triggers an AI API call from Lexora. */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-50 p-4">
          <div className="min-w-0">
            <b>Google Sheets AI enrichment: {connection.aiEnrich === false ? "TẮT" : "BẬT"}</b>
            <p className="mt-1 text-xs leading-5 text-muted">
              Lexora chuẩn bị sẵn các lệnh AI trong Google Sheets. Bạn có thể dùng Gemini ngay trong Sheet để điền nội dung.
            </p>
          </div>
          {canManage ? (
            <button
              type="button"
              role="switch"
              aria-checked={connection.aiEnrich !== false}
              aria-label="Google Sheets AI enrichment"
              className={secondary}
              disabled={!!busy}
              onClick={() => onAiEnrich(connection.aiEnrich === false)}
            >
              {connection.aiEnrich === false ? "Bật" : "Tắt"}
            </button>
          ) : null}
        </div>
        {connection.aiEnrich !== false && (
          <div className="rounded-xl border border-line p-4">
            <p className="font-semibold">Prompt cho cột AI</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Đây là câu lệnh Lexora ghi vào Sheet dưới dạng <code>=AI(&quot;câu lệnh&quot;;C6)</code>.
              Google Sheets vẫn chạy AI, Lexora chỉ đồng bộ kết quả. Bấm &ldquo;Lưu &amp; áp dụng cho Sheet&rdquo; để cập nhật các ô đang dùng AI formula; nội dung bạn tự nhập sẽ được giữ nguyên.
            </p>
            <div className="mt-3 space-y-3">
              {aiColumnsForTemplate(connection.templateType).map((plan) => {
                const inputId = `gs-ai-prompt-${plan.key}`;
                const defaultPrompt = AI_PROMPTS[plan.prompt as AiPromptKey];
                const value = promptDraft[plan.key] ?? defaultPrompt;
                const isCustom = (connection.aiPrompts?.[plan.key] ?? "") !== "" && connection.aiPrompts?.[plan.key] !== defaultPrompt;
                return (
                  <div key={plan.key}>
                    <label htmlFor={inputId} className="mb-1 block text-xs font-semibold">
                      {plan.key}
                    </label>
                    <textarea
                      id={inputId}
                      rows={3}
                      className="w-full rounded-xl border border-line p-2 font-mono text-xs"
                      value={value}
                      disabled={!canManage || !!busy}
                      onChange={(event) => setPromptDraft((prev) => ({ ...prev, [plan.key]: event.target.value }))}
                    />
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                      {isCustom ? <span className="text-[11px] text-amber-700">Đã tùy chỉnh</span> : <span className="text-[11px] text-muted">Mặc định</span>}
                      <button
                        type="button"
                        className="text-[11px] underline"
                        disabled={!canManage || !!busy || value === defaultPrompt}
                        onClick={() => setPromptDraft((prev) => ({ ...prev, [plan.key]: defaultPrompt }))}
                      >
                        Khôi phục mặc định
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={`${secondary} flex-1`}
                disabled={!canManage || !!busy || !dirty}
                onClick={() => onAiPrompts(promptDraft)}
              >
                Lưu prompt
              </button>
              <button
                type="button"
                className={`${primary} flex-1`}
                disabled={!canManage || !!busy || !dirty}
                onClick={() => { setApplyError(""); setApplyStats(null); setConfirmApply(true); }}
              >
                {busy === "aiPrompts" ? "Đang cập nhật prompt trên Sheet…" : "Lưu & áp dụng cho Sheet"}
              </button>
            </div>
            {applyStats ? (
              <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-800" role="status">
                ✓ Đã cập nhật prompt AI trên Sheet.
                <br />
                {applyStats.updatedFormulaCells} công thức AI đã được cập nhật. {applyStats.blankCellsFilled} ô trống đã được điền. {applyStats.protectedUserCells} ô được giữ nguyên.
                <br />
                Google Sheets sẽ tạo/làm mới nội dung theo lệnh mới.
              </p>
            ) : null}
            {applyError ? (
              <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700" role="alert">{applyError}</p>
            ) : null}
            {confirmApply ? (
              <div className="mt-3 rounded-xl border border-line p-3" role="alertdialog" aria-modal="true" aria-labelledby="gs-ai-apply-title">
                <p id="gs-ai-apply-title" className="text-sm font-semibold">Cập nhật prompt AI trên Sheet?</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  Lexora sẽ cập nhật các ô đang dùng AI formula và giữ nguyên nội dung bạn đã nhập thủ công.
                </p>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button type="button" className={secondary} disabled={!!busy} onClick={() => setConfirmApply(false)}>Hủy</button>
                  <button
                    type="button"
                    className={primary}
                    disabled={!!busy}
                    onClick={() => {
                      setConfirmApply(false);
                      void onAiPrompts(promptDraft, {
                        onStats: (stats) => setApplyStats(stats),
                        onError: (message) => setApplyError(message),
                      });
                    }}
                  >
                    Cập nhật
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
        <div>
          <label htmlFor="gs-delete-behavior" className="mb-2 block font-semibold">
            Khi xóa dòng trong Google Sheet
          </label>
          <select id="gs-delete-behavior" className="w-full rounded-xl border border-line p-3" value={connection.deleteBehavior} disabled={!canManage || !!busy} onChange={(event) => onDeleteBehavior(event.target.value)}>
            <option value="archive">Lưu trữ (khuyên dùng)</option>
            <option value="delete">Xóa</option>
            <option value="ignore">Bỏ qua</option>
          </select>
        </div>
        <div>
          <b>Template: {templateLabel(connection.templateType)}</b>
          <p className="mt-1 text-xs text-muted">Template theo loại bộ từ vựng; không thay đổi cấu trúc Sheet đang kết nối.</p>
          <dl className="mt-3 space-y-2 text-xs">
            <div>
              <dt className="font-semibold">STT</dt>
              <dd className="text-muted">Số thứ tự hiển thị, tự động cập nhật.</dd>
            </div>
            <div>
              <dt className="font-semibold">__lexora_id</dt>
              <dd className="text-muted">ID nội bộ của Lexora. Không chỉnh sửa.</dd>
            </div>
          </dl>
        </div>
        <div className="border-t border-line pt-4">
          <button type="button" className={`${secondary} w-full text-left`} aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>
            Cài đặt nâng cao {advanced ? "▴" : "▾"}
          </button>
          {advanced ? (
            <dl className="mt-3 space-y-3 rounded-xl bg-gray-50 p-4 text-xs">
              <div>
                <dt className="text-muted">Connection ID</dt>
                <dd>{connection.id}</dd>
              </div>
              {[
                ["Channel ID", channel?.channelId],
                ["Channel state", channel?.status],
                ["Expiration", formatDate((channel?.expirationAt as string) || connection.channelExpiresAt)],
                ["Last message number", channel?.lastMessageNumber],
                ["Last webhook", "Chưa được backend ghi nhận thời gian riêng"],
                ["Resource ID", channel?.resourceId],
                ["Last error", connection.lastError],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="text-muted">{String(label)}</dt>
                  <dd className="break-all">{value == null ? "—" : String(value)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        {canSync ? (
          <div className="border-t border-line pt-4">
            <p className="mb-2 text-xs text-muted">Đồng bộ thủ công chỉ cần khi bạn muốn kiểm tra ngay.</p>
            <button type="button" className={secondary} disabled={!!busy || broken} onClick={onSync}>
              {busy === "sync" ? "Đang đồng bộ…" : "Đồng bộ ngay"}
            </button>
          </div>
        ) : null}
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {connection.enabled ? null : (
              <button type="button" className={secondary} disabled={!!busy} onClick={onPause}>
                Tiếp tục đồng bộ
              </button>
            )}
            <button type="button" className={`${danger} ml-auto`} disabled={!!busy} onClick={onDisconnect}>
              Ngắt kết nối
            </button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
