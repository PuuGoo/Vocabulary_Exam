"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cx } from "@/components/ui";
import SetPicker from "@/components/SetPicker";
import { toast } from "@/components/Toast";

type SetSummary = { id: number; name: string; type: string; count: number; category?: string | null };
type ClassOpt = { id: number; name: string };
type CategoryOpt = { id: number; name: string };
const ALL_CATEGORIES = "__all__";
const UNCATEGORIZED = "__uncategorized__";

export default function AdminImportPage() {
  const router = useRouter();
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
  const [previewLimit, setPreviewLimit] = useState(50);
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
    setPreviewLimit(50);
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
    form.append("languageCode", target === "__new_language" ? "zh-CN" : "en");
    const res = await fetch("/api/admin/import", { method: "POST", body: form });
    setSubmitting(false);
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || (target === "__new_language" ? "导入失败。" : "Nhập dữ liệu thất bại."));
      return;
    }
    const duplicateNote = data.skippedDuplicates ? (target === "__new_language" ? ` 已跳过 ${data.skippedDuplicates} 个重复或已存在的词。` : ` Bỏ qua ${data.skippedDuplicates} từ đã tồn tại hoặc bị lặp.`) : "";
    const invalidNote = data.skippedInvalid ? (target === "__new_language" ? ` 已跳过 ${data.skippedInvalid} 行缺少必填数据。` : ` Bỏ qua ${data.skippedInvalid} dòng thiếu dữ liệu bắt buộc.`) : "";
    const toneWarning = data.warnings?.find?.((warning: { code?: string }) => warning.code === "PINYIN_TONE_MISSING");
    const warningNote = toneWarning?.rows?.length ? (target === "__new_language" ? ` 拼音缺少声调，请检查第 ${toneWarning.rows.join(", ")} 行。` : ` Cảnh báo: Pinyin chưa có thanh điệu ở dòng ${toneWarning.rows.join(", ")}.`) : "";
    toast(target === "__new_language" ? `已导入 ${data.added} 个词，共 ${data.total} 行。${duplicateNote}${invalidNote}${warningNote}` : `Đã thêm ${data.added} từ trên ${data.total} dòng.${duplicateNote}${invalidNote}${warningNote}`);
    const returnTo = new URLSearchParams(window.location.search).get("returnTo");
    if (returnTo?.startsWith("/admin/sets")) {
      router.replace(returnTo);
      return;
    }
    setFile(null);
    setPreviewRows(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    const setsRes = await fetch("/api/sets");
    setSets((await setsRes.json()).sets || []);
  }

  const cols = previewRows && previewRows.length > 0 ? Object.keys(previewRows[0]) : [];

  return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>{target === "__new_language" ? "导入中文词汇" : "Nhập dữ liệu từ vựng (CSV / Excel)"}</h2>
      <div className={cx.desc}>
        {target === "__new_language"
          ? "上传 Excel 文件以快速导入中文词汇到新建或现有的词汇集中。"
          : "Tải lên file .csv hoặc .xlsx để nhập nhanh từ vựng vào một bộ mới hoặc bộ đã có."}
      </div>

      <div className="mb-3 grid gap-3 rounded-[14px] border border-line bg-[#FBFAFE] p-3 sm:grid-cols-2">
        <label>
          <span className={cx.label}>{target === "__new_language" ? "按分类筛选" : "Lọc theo danh mục"}</span>
          <select className={`${cx.input} !mb-0`} value={destinationCategory} onChange={(event) => setDestinationCategory(event.target.value)}>
            <option value={ALL_CATEGORIES}>{target === "__new_language" ? `全部分类 (${sets.length})` : `Tất cả danh mục (${sets.length})`}</option>
            {destinationCategories.map(([name, count]) => (
              <option key={name} value={name}>{name === UNCATEGORIZED ? (target === "__new_language" ? "未分类" : "Chưa phân loại") : name} ({count})</option>
            ))}
          </select>
        </label>
        <label>
          <span className={cx.label}>{target === "__new_language" ? "搜索词汇集" : "Tìm bộ từ"}</span>
          <input className={`${cx.input} !mb-0`} type="search" placeholder={target === "__new_language" ? "输入词汇集名称..." : "Nhập tên bộ từ..."} value={destinationSearch} onChange={(event) => setDestinationSearch(event.target.value)} />
        </label>
      </div>
      <div className="mb-3">
        <span className={cx.label}>{target === "__new_language" ? "选择导入目标" : "Chọn đích nhập dữ liệu"}</span>
        <div className="flex flex-wrap gap-2">
          {[["__new_vocab", "+ Tạo bộ mới — Từ vựng IELTS"], ["__new_verb", "+ Tạo bộ mới — Động từ bất quy tắc"], ["__new_language", "+ 新建中文词汇集"]].map(([value, label]) => (
            <button key={value} type="button" onClick={() => setTarget(value)} className={`rounded-full border px-3.5 py-2 text-xs font-bold ${target === value ? "border-ink bg-ink text-white" : "border-line bg-white text-muted hover:border-gold"}`}>{label}</button>
          ))}
        </div>
        <div className="mt-3">
          <span className="mb-1.5 block text-xs font-bold text-muted">{target === "__new_language" ? "添加到现有词汇集" : "Thêm vào bộ có sẵn"}</span>
          <SetPicker
            sets={sets}
            mode="single"
            selected={target && String(Number(target)) === target ? [Number(target)] : []}
            onSelect={(ids) => { setTarget(ids[0] != null ? String(ids[0]) : "__new_vocab"); }}
            renderTrigger={(count, label) => (
              <span className={`flex min-h-11 w-full items-center justify-between rounded-[11px] border border-gold/60 bg-goldpale/30 px-4 text-sm font-bold ${count ? "text-golddark" : "text-muted"}`}>
                {count ? (sets.find((item) => item.id === Number(target))?.name || label) : target === "__new_language" ? "选择文件夹 / 词汇集以添加" : "Chọn thư mục / bộ từ để thêm vào"}
                <span aria-hidden="true">▾</span>
              </span>
            )}
          />
        </div>
      </div>

      {(target === "__new_vocab" || target === "__new_verb" || target === "__new_language") && (
        <>
          <label className={cx.label}>{target === "__new_language" ? "词汇集名称" : "Tên bộ từ vựng mới"}</label>
          <input
            className={cx.input}
            placeholder={target === "__new_language" ? "例如：HSK 1 中文词汇" : "VD: Từ vựng chủ đề Giáo dục"}
            value={newSetName}
            onChange={(e) => setNewSetName(e.target.value)}
          />
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className={cx.label}>{target === "__new_language" ? "分类 / 文件夹" : "Danh mục / thư mục"}</span>
              <select className={`${cx.input} !mb-0`} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">{target === "__new_language" ? "未分类" : "Chưa phân loại"}</option>
                {categoryOptions.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
              </select>
            </label>
            <Link href="/admin/sets" className={`${cx.btn} ${cx.btnGhost} shrink-0`}>{target === "__new_language" ? "管理" : "Quản lý"}</Link>
          </div>
          <p className="mb-3 mt-1.5 text-xs text-muted">{target === "__new_language" ? "可在“词汇集”页面创建和重命名分类。" : "Danh mục mới được tạo và đổi tên tại trang Bộ từ vựng."}</p>
          <label className={cx.label}>{target === "__new_language" ? "可见范围" : "Phạm vi hiển thị"}</label>
          <select className={cx.input} value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{target === "__new_language" ? "公开 — 所有学生可见" : "Công khai — mọi học sinh đều thấy"}</option>
            {classesOpt.map((c) => (
              <option key={c.id} value={c.id}>
                {target === "__new_language" ? `仅限班级：${c.name}` : `Chỉ lớp: ${c.name}`}
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
        <div className="mt-2 font-semibold">{target === "__new_language" ? (dragging ? "将文件拖到此处预览" : "将 Excel 文件拖到这里，或点击选择") : dragging ? "Thả file vào đây để xem trước" : "Kéo file vào đây hoặc bấm để chọn"}</div>
        <div className="mt-1 text-xs">{target === "__new_language" ? "支持 .csv、.xlsx 和 .xls  |  需包含表头行" : "Hỗ trợ .csv, .xlsx và .xls"}</div>
        {file && <div className="mt-3 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink">{target === "__new_language" ? `已选择：${file.name}` : `Đã chọn: ${file.name}`}</div>}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handlePickFile(e.target.files[0])}
        />
      </div>

            <div className="text-[0.74rem] text-muted bg-goldpale px-3 py-2.5 rounded-lg mb-3.5 leading-relaxed">
        {target === "__new_language" ? (
          <>
            <b>导入格式 — 中文词汇：</b>
            <div className="mt-1.5 grid gap-1.5">
              <div>必填：<code className="bg-white/70 px-1 rounded">生词</code> + <code className="bg-white/70 px-1 rounded">意思</code> / <code className="bg-white/70 px-1 rounded">词义</code></div>
              <div>可选：<code className="bg-white/70 px-1 rounded">拼音</code> · <code className="bg-white/70 px-1 rounded">词性</code> · <code className="bg-white/70 px-1 rounded">注释</code> · <code className="bg-white/70 px-1 rounded">例如</code> · <code className="bg-white/70 px-1 rounded">繁体</code> · <code className="bg-white/70 px-1 rounded">量词</code> · <code className="bg-white/70 px-1 rounded">HSK</code> · <code className="bg-white/70 px-1 rounded">pinyin 例句</code></div>
              <div>也支持越南语表头：<code className="bg-white/70 px-1 rounded">Chữ Hán</code> / <code className="bg-white/70 px-1 rounded">Nghĩa</code> / <code className="bg-white/70 px-1 rounded">Pinyin</code> / <code className="bg-white/70 px-1 rounded">Loại từ</code></div>
              <div>第一行必须为表头；<code className="bg-white/70 px-1 rounded">序号</code> / <code className="bg-white/70 px-1 rounded">STT</code> 仅用于预览，不会作为词汇导入。</div>
            </div>
            <div className="mt-2 rounded-lg bg-white/70 px-2.5 py-2 font-mono text-[0.7rem] leading-5">
              序号 | 生词 | 拼音 | 词性 | 意思 | 注释 | 例如<br />
              1 | 你好 | nǐ hǎo | 问候语 | xin chào | 常用 | 你好，很高兴认识你<br />
              2 | 学习 | xuéxí | 动词 | học tập | | 我每天学习中文
            </div>
            <div className="mt-1.5 text-[0.7rem]">提示：拼音会自动标准化；若缺少声调会在导入后提醒（如 ni hao → 请补 nǐ hǎo）。</div>
          </>
        ) : target === "__new_verb" ? (
          <>
            <b>Định dạng cột — Động từ bất quy tắc:</b>
            <div className="mt-1.5 grid gap-1.5">
              <div>Bắt buộc: <code className="bg-white/70 px-1 rounded">Nghĩa</code> + <code className="bg-white/70 px-1 rounded">V1</code> + <code className="bg-white/70 px-1 rounded">V2</code> + <code className="bg-white/70 px-1 rounded">V3</code></div>
              <div>Tùy chọn: <code className="bg-white/70 px-1 rounded">IPA V1</code> · <code className="bg-white/70 px-1 rounded">IPA V2</code> · <code className="bg-white/70 px-1 rounded">IPA V3</code> (hoặc <code className="bg-white/70 px-1 rounded">ipa_v1</code>, <code className="bg-white/70 px-1 rounded">ipav1</code>…)</div>
              <div>Nhận cả header tiếng Việt lẫn tiếng Anh: <code className="bg-white/70 px-1 rounded">Nghĩa</code>/<code className="bg-white/70 px-1 rounded">meaning</code> · <code className="bg-white/70 px-1 rounded">V1</code>/<code className="bg-white/70 px-1 rounded">v1</code> …</div>
            </div>
            <div className="mt-2 rounded-lg bg-white/70 px-2.5 py-2 font-mono text-[0.7rem] leading-5">
              Nghĩa | V1 | IPA V1 | V2 | IPA V2 | V3 | IPA V3<br />
              đi | go | /ɡəʊ/ | went | /went/ | gone | /ɡɒn/<br />
              bắt đầu | begin | /bɪˈɡɪn/ | began | /bɪˈɡæn/ | begun | /bɪˈɡʌn/
            </div>
            <div className="mt-1.5 text-[0.7rem]">Thiếu Nghĩa hoặc một trong V1/V2/V3 thì dòng đó bị bỏ qua (tính vào "thiếu dữ liệu").</div>
          </>
        ) : (
          <>
            <b>Định dạng cột — Từ vựng IELTS:</b>
            <div className="mt-1.5 grid gap-1.5">
              <div>Bắt buộc: <code className="bg-white/70 px-1 rounded">Từ</code> + <code className="bg-white/70 px-1 rounded">Nghĩa</code></div>
              <div>Tùy chọn: <code className="bg-white/70 px-1 rounded">IPA</code> · <code className="bg-white/70 px-1 rounded">Loại từ</code> · <code className="bg-white/70 px-1 rounded">Ví dụ</code> · <code className="bg-white/70 px-1 rounded">Ghi chú</code> · <code className="bg-white/70 px-1 rounded">Lượng từ</code> · <code className="bg-white/70 px-1 rounded">Cấp độ</code></div>
              <div>Header nhận cả tiếng Anh lẫn tiếng Việt (không phân biệt hoa thường): <code className="bg-white/70 px-1 rounded">term</code>/<code className="bg-white/70 px-1 rounded">Từ</code> · <code className="bg-white/70 px-1 rounded">meaning</code>/<code className="bg-white/70 px-1 rounded">Nghĩa</code> · <code className="bg-white/70 px-1 rounded">example</code>/<code className="bg-white/70 px-1 rounded">Ví dụ</code> · <code className="bg-white/70 px-1 rounded">wtype</code>/<code className="bg-white/70 px-1 rounded">Loại từ</code> · <code className="bg-white/70 px-1 rounded">ipa</code>/<code className="bg-white/70 px-1 rounded">phiên âm</code></div>
            </div>
            <div className="mt-2 rounded-lg bg-white/70 px-2.5 py-2 font-mono text-[0.7rem] leading-5">
              Từ | Nghĩa | IPA | Loại từ | Ví dụ<br />
              accomplish | hoàn thành | /əˈkʌm.plɪʃ/ | verb | accomplish a goal<br />
              benevolent | nhân hậu | /bəˈnev.əl.ənt/ | adj | a benevolent leader
            </div>
            <div className="mt-1.5 text-[0.7rem]">STT trong file xuất chỉ để xem. File XLSX tải từ "↓ XLSX" kéo vào đây là nhập lại được ngay (từ trùng sẽ bỏ qua).</div>
          </>
        )}
      </div>

      {previewRows && previewRows.length > 0 && (
        <>
          <div className={cx.desc}>
            {target === "__new_language" ? `数据预览 ${Math.min(previewLimit, previewRows.length)}/${previewRows.length} 行` : `Xem trước ${Math.min(previewLimit, previewRows.length)}/${previewRows.length} dòng dữ liệu:`}
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
                {previewRows.slice(0, previewLimit).map((r, i) => (
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
                    {previewRows.length > previewLimit && (
            <button type="button" className={`${cx.btn} ${cx.btnGhost} mb-2`} onClick={() => setPreviewLimit(previewRows.length)}>{target === "__new_language" ? `查看更多 ${previewRows.length - previewLimit} 行` : `Xem thêm ${previewRows.length - previewLimit} dòng`}</button>
          )}
<button className={`${cx.btn} ${cx.btnGold}`} disabled={submitting} onClick={confirmImport}>
            {submitting ? (target === "__new_language" ? "正在导入..." : "Đang nhập...") : target === "__new_language" ? `开始导入 ${previewRows.length} 条` : `Xác nhận nhập ${previewRows.length} mục`}
          </button>
        </>
      )}
    </div>
  );
}
