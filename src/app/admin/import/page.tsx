"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";

type SetSummary = { id: number; name: string; type: string; count: number; category?: string | null };
type ClassOpt = { id: number; name: string };
type CategoryOpt = { id: number; name: string };
const ALL_CATEGORIES = "__all__";
const UNCATEGORIZED = "__uncategorized__";

export default function AdminImportPage() {
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [classesOpt, setClassesOpt] = useState<ClassOpt[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOpt[]>([]);
  const [target, setTarget] = useState("__new_vocab");
  const [destinationCategory, setDestinationCategory] = useState(ALL_CATEGORIES);
  const [destinationSearch, setDestinationSearch] = useState("");
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
      .then((d) => {
        const loadedSets: SetSummary[] = d.sets || [];
        setSets(loadedSets);
        const requestedTarget = new URLSearchParams(window.location.search).get("target");
        const requestedSet = loadedSets.find((item) => String(item.id) === requestedTarget);
        if (requestedSet) {
          setTarget(String(requestedSet.id));
          setDestinationCategory(requestedSet.category?.trim() || UNCATEGORIZED);
        }
      });
    fetch("/api/admin/classes")
      .then((r) => (r.ok ? r.json() : { classes: [] }))
      .then((d) => setClassesOpt((d.classes || []).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))));
    fetch("/api/admin/categories")
      .then((r) => (r.ok ? r.json() : { categories: [] }))
      .then((d) => setCategoryOptions(d.categories || []));
  }, []);

  const destinationCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const set of sets) {
      const key = set.category?.trim() || UNCATEGORIZED;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries()).sort(([left], [right]) => {
      if (left === UNCATEGORIZED) return 1;
      if (right === UNCATEGORIZED) return -1;
      return left.localeCompare(right, "vi");
    });
  }, [sets]);

  const filteredDestinationSets = useMemo(() => {
    const query = destinationSearch.trim().toLocaleLowerCase("vi");
    return sets.filter((set) => {
      const categoryKey = set.category?.trim() || UNCATEGORIZED;
      const categoryMatches = destinationCategory === ALL_CATEGORIES || destinationCategory === categoryKey;
      const searchMatches = !query || `${set.name} ${set.category || ""}`.toLocaleLowerCase("vi").includes(query);
      return categoryMatches && searchMatches;
    });
  }, [destinationCategory, destinationSearch, sets]);

  const destinationSets = useMemo(() => {
    const selected = sets.find((set) => String(set.id) === target);
    return selected && !filteredDestinationSets.some((set) => set.id === selected.id)
      ? [selected, ...filteredDestinationSets]
      : filteredDestinationSets;
  }, [filteredDestinationSets, sets, target]);

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

      <div className="mb-3 grid gap-3 rounded-[14px] border border-line bg-[#FBFAFE] p-3 sm:grid-cols-2">
        <label>
          <span className={cx.label}>Lọc theo danh mục</span>
          <select className={`${cx.input} !mb-0`} value={destinationCategory} onChange={(event) => setDestinationCategory(event.target.value)}>
            <option value={ALL_CATEGORIES}>Tất cả danh mục ({sets.length})</option>
            {destinationCategories.map(([name, count]) => (
              <option key={name} value={name}>{name === UNCATEGORIZED ? "Chưa phân loại" : name} ({count})</option>
            ))}
          </select>
        </label>
        <label>
          <span className={cx.label}>Tìm bộ từ</span>
          <input className={`${cx.input} !mb-0`} type="search" placeholder="Nhập tên bộ từ..." value={destinationSearch} onChange={(event) => setDestinationSearch(event.target.value)} />
        </label>
      </div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <label className={cx.label}>Chọn đích nhập dữ liệu</label>
        <span className="text-xs font-semibold text-muted">{filteredDestinationSets.length}/{sets.length} bộ phù hợp</span>
      </div>
      <select className={cx.input} value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="__new_vocab">+ Tạo bộ mới — Từ vựng IELTS</option>
        <option value="__new_verb">+ Tạo bộ mới — Động từ bất quy tắc</option>
        {destinationSets.map((s) => (
          <option key={s.id} value={s.id}>
            Thêm vào: {s.name}{s.category ? ` · ${s.category}` : " · Chưa phân loại"}
          </option>
        ))}
      </select>
      {sets.length > 0 && filteredDestinationSets.length === 0 && (
        <div className="mb-3 rounded-[10px] border border-[#E4DFFC] bg-[#F7F5FF] px-3 py-2.5 text-xs text-muted">
          Không có bộ từ khớp bộ lọc. Hãy đổi danh mục hoặc xóa từ khóa tìm kiếm.
        </div>
      )}

      {(target === "__new_vocab" || target === "__new_verb") && (
        <>
          <label className={cx.label}>Tên bộ từ vựng mới</label>
          <input
            className={cx.input}
            placeholder="VD: Từ vựng chủ đề Giáo dục"
            value={newSetName}
            onChange={(e) => setNewSetName(e.target.value)}
          />
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className={cx.label}>Danh mục / thư mục</span>
              <select className={`${cx.input} !mb-0`} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Chưa phân loại</option>
                {categoryOptions.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
              </select>
            </label>
            <Link href="/admin/sets" className={`${cx.btn} ${cx.btnGhost} shrink-0`}>Quản lý</Link>
          </div>
          <p className="mb-3 mt-1.5 text-xs text-muted">Danh mục mới được tạo và đổi tên tại trang Bộ từ vựng.</p>
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
