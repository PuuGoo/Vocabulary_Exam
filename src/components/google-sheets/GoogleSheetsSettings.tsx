"use client";
import { useState } from "react";
import Modal from "@/components/Modal";
import { Connection, danger, formatDate, secondary, templateLabel } from "./types";

export default function GoogleSheetsSettings({ connection, canManage, canSync, busy, channel, onClose, onPause, onDisconnect, onSync, onDeleteBehavior, onAiEnrich }: { connection: Connection; canManage: boolean; canSync: boolean; busy: string | null; channel: Record<string, unknown> | null; onClose: () => void; onPause: () => void; onDisconnect: () => void; onSync: () => void; onDeleteBehavior: (value: string) => void; onAiEnrich: (value: boolean) => void }) {
  const [advanced, setAdvanced] = useState(false);
  const broken = connection.status === "error" || connection.status === "disconnected";
  const autoOn = connection.enabled && !broken;
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