"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";

type SetSummary = { id: number; name: string; type: string; count: number; category?: string | null };
type ClassOpt = { id: number; name: string };

export default function AdminImportPage() {
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [classesOpt, setClassesOpt] = useState<ClassOpt[]>([]);
  const [target, setTarget] = useState("__new_vocab");
  const [newSetName, setNewSetName] = useState("");
  const [category, setCategory] = useState("");
  const [classId, setClassId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/sets")
      .then((r) => r.json())
      .then((d) => setSets(d.sets || []));
    fetch("/api/admin/classes")
      .then((r) => (r.ok ? r.json() : { classes: [] }))
      .then((d) => setClassesOpt((d.classes || []).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))));
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
    form.append("category", category);
    form.append("classId", classId);
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
          <label className={cx.label}>Danh mục / thư mục</label>
          <input
            className={cx.input}
            list="import-category-options"
            placeholder="VD: Vocabulary, Irregular Verbs, Unit 1"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <datalist id="import-category-options">
            {Array.from(new Set(sets.map((set) => set.category).filter(Boolean))).map((item) => <option key={item!} value={item!} />)}
          </datalist>
          <label className={cx.label}>Phạm vi hiển thị</label>
          <select className={cx.input} value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Công khai — mọi học sinh đều thấy</option>
            {classesOpt.map((c) => (
              <option key={c.id} value={c.id}>
                Chỉ lớp: {c.name}
              </option>
            ))}
          </select>
        </>
      )}

      <div
        className={`mb-3.5 cursor-pointer rounded-[14px] border-2 border-dashed p-8 text-center text-[0.85rem] transition ${
          dragging ? "scale-[1.01] border-gold bg-goldpale text-golddark" : "border-line text-muted hover:border-gold hover:text-golddark"
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const droppedFile = event.dataTransfer.files?.[0];
          if (droppedFile) void handlePickFile(droppedFile);
        }}
      >
        <div className="text-2xl" aria-hidden="true">{dragging ? "⬇" : "📄"}</div>
        <div className="mt-2 font-semibold">{dragging ? "Thả file vào đây để xem trước" : "Kéo file vào đây hoặc bấm để chọn"}</div>
        <div className="mt-1 text-xs">Hỗ trợ .csv, .xlsx và .xls</div>
        {file && <div className="mt-3 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink">Đã chọn: {file.name}</div>}
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
        <code className="bg-white/60 px-1 rounded">v3</code>,{" "}
        <code className="bg-white/60 px-1 rounded">ipa_v1</code>,{" "}
        <code className="bg-white/60 px-1 rounded">ipa_v2</code>,{" "}
        <code className="bg-white/60 px-1 rounded">ipa_v3</code> (IPA không bắt buộc)
        <br />
        Dòng đầu tiên của file phải là tên cột (header), viết thường, không dấu.
      </div>

      {previewRows && previewRows.length > 0 && (
        <>
          <div className={cx.desc}>
            Xem trước đầy đủ {previewRows.length} dòng dữ liệu:
          </div>
          <div className="max-h-[55vh] overflow-auto border border-line rounded-lg mb-3">
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
                {previewRows.map((r, i) => (
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
