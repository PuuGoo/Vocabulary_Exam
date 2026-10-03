"use client";
import Modal from "@/components/Modal";
import { primary, secondary } from "./types";
export default function GoogleSheetsCreateDialog({ busy, phase, aiEnrich, onAiEnrich, onClose, onCreate }: { busy: boolean; phase: string; aiEnrich: boolean; onAiEnrich: (value: boolean) => void; onClose: () => void; onCreate: () => void }) {
  return (
    <Modal title="Tạo Google Sheet" onClose={onClose}>
      <p className="text-sm leading-6 text-muted">
        Lexora tạo Sheet theo template của bộ từ, đưa toàn bộ vocabulary hiện tại vào Sheet và bật tự động đồng bộ. Bạn chỉ cần chỉnh sửa trong Google Sheets.
      </p>
      {/* The only AI involved is Google's own Sheets AI function. Lexora plants
          the instructions; Google Sheets generates the values; the existing
          webhook + sync path persists them. No Gemini API key, no Lexora AI. */}
      <div className="mt-4 rounded-xl bg-gray-50 p-4">
        <label className="flex items-start gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={aiEnrich}
            disabled={busy}
            onChange={(event) => onAiEnrich(event.target.checked)}
          />
          <span>
            Chuẩn bị sẵn cột AI trong Google Sheets
            <span className="mt-1 block text-xs font-normal leading-5 text-muted">
              Lexora chuẩn bị sẵn các lệnh AI trong Google Sheets. Bạn có thể dùng Gemini ngay trong Sheet để điền nội dung.
            </span>
          </span>
        </label>
        <p className="mt-2 text-xs leading-5 text-muted">
          Sau khi nhập Word, chọn các ô AI rồi dùng thao tác AI của Google Sheets (Generate and Insert / Refresh and Insert) để điền. Lexora tự đồng bộ kết quả về.
        </p>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className={secondary} disabled={busy} onClick={onClose}>
          Hủy
        </button>
        <button type="button" className={primary} disabled={busy} onClick={onCreate} autoFocus>
          {phase === "connecting" ? "Đang kết nối Google…" : busy ? "Đang tạo Google Sheet…" : "Tạo Google Sheet"}
        </button>
      </div>
    </Modal>
  );
}