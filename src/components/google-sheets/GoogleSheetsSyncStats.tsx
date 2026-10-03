import { SyncRun } from "./types";

/** The +created / ~updated / -archived / =unchanged summary shown after every sync. */
export default function GoogleSheetsSyncStats({ run, invalid }: { run: SyncRun | null; invalid?: Array<{ rowNumber: number; message: string }> }) {
  const invalidCount = run ? run.validationErrorCount ?? run.rowsSkipped ?? 0 : 0;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
      {run ? (
        <>
          <span className="text-emerald-700">+{run.rowsCreated} mới</span>
          <span className="text-amber-700">~{run.rowsUpdated} cập nhật</span>
          <span className="text-muted">−{run.rowsDeleted} lưu trữ/xóa</span>
          <span className="text-muted">={run.rowsUnchanged} không đổi</span>
          {invalidCount > 0 ? <span className="text-red-700">!{invalidCount} dòng cần xem</span> : null}
        </>
      ) : (
        <p className="text-xs text-muted">Chưa có kết quả đồng bộ.</p>
      )}
      {invalid && invalid.length > 0 ? (
        <ul className="mt-2 w-full space-y-1 text-xs text-red-700">
          {invalid.slice(0, 5).map((row, index) => (
            <li key={`${row.rowNumber}-${index}`} className="break-words">
              Dòng {row.rowNumber}: {row.message}
            </li>
          ))}
          {invalid.length > 5 ? <li>…và {invalid.length - 5} dòng khác</li> : null}
        </ul>
      ) : null}
    </div>
  );
}