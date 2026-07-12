"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";

type SetSummary = { id: number; name: string; type: string; count: number };

export default function AdminImportPage() {
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [target, setTarget] = useState("__new_vocab");
  const [newSetName, setNewSetName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/sets")
      .then((r) => r.json())
      .then((d) => setSets(d.sets || []));
  }, []);

  async function handlePickFile(f: File) {
    setFile(f);
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext === "csv") {
      const Papa = (await import("papaparse")).default;
      const text = await f.text();
      const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
      setPreviewRows(parsed.data);
    } else if (ext === "xlsx" || ext === "xls") {
      const XLSX = await import("xlsx");
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      setPreviewRows(rows);
    } else {
      toast("Định dạng file không được hỗ trợ.");
      setPreviewRows(null);
    }
  }

  async function confirmImport() {
    if (!file) return;
    setSubmitting(true);
    const form = new FormData();
    form.append("file", file);
    form.append("target", target);
    form.append("newSetName", newSetName);
    const res = await fetch("/api/admin/import", { method: "POST", body: form });
    setSubmitting(false);
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || "Nhập dữ liệu thất bại.");
      return;
    }
    toast(`Đã nhập ${data.added}/${data.total} dòng thành công!`);
    setFile(null);
    setPreviewRows(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    const setsRes = await fetch("/api/sets");
    setSets((await setsRes.json()).sets || []);
  }

  const cols = previewRows && previewRows.length > 0 ? Object.keys(previewRows[0]) : [];

  return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Nhập dữ liệu từ vựng (CSV / Excel)</h2>
      <div className={cx.desc}>
        Tải lên file .csv hoặc .xlsx để nhập nhanh từ vựng vào một bộ mới hoặc bộ đã có.
      </div>

      <label className={cx.label}>Chọn đích nhập dữ liệu</label>
      <select className={cx.input} value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="__new_vocab">+ Tạo bộ mới — Từ vựng IELTS</option>
        <option value="__new_verb">+ Tạo bộ mới — Động từ bất quy tắc</option>
        {sets.map((s) => (
          <option key={s.id} value={s.id}>
            Thêm vào: {s.name}
          </option>
        ))}
      </select>

      {(target === "__new_vocab" || target === "__new_verb") && (
        <>
          <label className={cx.label}>Tên bộ từ vựng mới</label>
          <input
            className={cx.input}
            placeholder="VD: Từ vựng chủ đề Giáo dục"
            value={newSetName}
            onChange={(e) => setNewSetName(e.target.value)}
          />
        </>
      )}

      <div
        className="border-2 border-dashed border-line rounded-[10px] p-6 text-center text-muted text-[0.85rem] cursor-pointer mb-3.5 hover:border-gold hover:text-golddark"
        onClick={() => fileInputRef.current?.click()}
      >
        <div>📄 Kéo/thả hoặc bấm để chọn file .csv hoặc .xlsx</div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handlePickFile(e.target.files[0])}
        />
      </div>

      <div className="text-[0.74rem] text-muted bg-goldpale px-3 py-2.5 rounded-lg mb-3.5 leading-relaxed">
        <b>Định dạng cột — Từ vựng IELTS:</b> <code className="bg-white/60 px-1 rounded">term</code>,{" "}
        <code className="bg-white/60 px-1 rounded">meaning</code>,{" "}
        <code className="bg-white/60 px-1 rounded">example</code> (tùy chọn),{" "}
        <code className="bg-white/60 px-1 rounded">wtype</code> (tùy chọn)
        <br />
        <b>Định dạng cột — Động từ bất quy tắc:</b> <code className="bg-white/60 px-1 rounded">meaning</code>,{" "}
        <code className="bg-white/60 px-1 rounded">v1</code>, <code className="bg-white/60 px-1 rounded">v2</code>,{" "}
        <code className="bg-white/60 px-1 rounded">v3</code>
        <br />
        Dòng đầu tiên của file phải là tên cột (header), viết thường, không dấu.
      </div>

      {previewRows && previewRows.length > 0 && (
        <>
          <div className={cx.desc}>
            Xem trước {previewRows.length} dòng dữ liệu (tối đa 8 dòng hiển thị):
          </div>
          <div className="max-h-[220px] overflow-auto border border-line rounded-lg mb-3">
            <table className={cx.table}>
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th className={cx.th} key={c}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 8).map((r, i) => (
                  <tr key={i}>
                    {cols.map((c) => (
                      <td className={cx.td} key={c}>
                        {String(r[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className={`${cx.btn} ${cx.btnGold}`} disabled={submitting} onClick={confirmImport}>
            {submitting ? "Đang nhập..." : `Xác nhận nhập ${previewRows.length} mục`}
          </button>
        </>
      )}
    </div>
  );
}
