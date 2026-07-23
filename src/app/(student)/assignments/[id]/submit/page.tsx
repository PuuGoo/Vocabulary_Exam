"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "@/components/Toast";
import { cx } from "@/components/ui";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";

type Data = {
  assignment: { id: number; title: string; instructions: string; className: string; setName: string; dueAt: string | null; archived: boolean };
  submission: { textContent: string | null; fileName: string | null; fileType: string | null; fileSize: number | null; submittedAt: string } | null;
};

function sizeLabel(size: number | null) { return size == null ? "" : size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`; }

export default function SubmitAssignmentPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Data | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const initialTextRef = useRef("");

  useUnsavedChangesWarning(text !== initialTextRef.current || file !== null || removeFile, "Bài nộp chưa được lưu. Bạn vẫn muốn rời trang?");

  async function load() {
    setError(false);
    try {
      const response = await fetch(`/api/assignments/${params.id}/submission`);
      if (!response.ok) throw new Error();
      const result = await response.json();
      const savedText = result.submission?.textContent || "";
      setData(result); setText(savedText); initialTextRef.current = savedText; setFile(null); setRemoveFile(false);
      if (fileRef.current) fileRef.current.value = "";
    } catch { setError(true); }
  }
  useEffect(() => { void load(); }, [params.id]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    const form = new FormData(); form.set("textContent", text); if (file) form.set("file", file); if (removeFile) form.set("removeFile", "1");
    try {
      const response = await fetch(`/api/assignments/${params.id}/submission`, { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không thể nộp bài.");
      toast("Đã nộp bài thành công."); await load();
    } catch (err) { toast(err instanceof Error ? err.message : "Không thể nộp bài."); }
    finally { setSaving(false); }
  }

  if (error) return <div className={cx.panel}><div className={cx.empty}>Không thể mở bài nộp.<div className="mt-3"><button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => void load()}>Thử lại</button></div></div></div>;
  if (!data) return <div className={cx.panel}><div className={cx.empty}>Đang tải...</div></div>;
  const existingFile = data.submission?.fileName && !removeFile;
  return <div className={cx.panel}>
    <div className="mb-5"><Link href="/assignments" className="text-[0.8rem] text-golddark hover:underline">← Bài tập của tôi</Link><h2 className={`${cx.h2} mt-2`}>Nộp bài · {data.assignment.title}</h2><p className={cx.desc + " !mb-0"}>{data.assignment.className} · {data.assignment.setName}</p></div>
    {data.assignment.instructions && <div className="mb-4 whitespace-pre-wrap rounded-lg bg-[#faf8f2] p-3 text-sm">{data.assignment.instructions}</div>}
    {data.submission && <div className="mb-4 rounded-lg border border-ok/30 bg-[#e5f4ea] p-3 text-sm text-ok">Đã nộp lúc {new Date(data.submission.submittedAt).toLocaleString("vi-VN")}. Bạn có thể chỉnh sửa và nộp lại.</div>}
    <form onSubmit={submit}>
      <label><span className={cx.label}>Nội dung văn bản</span><textarea className={cx.input} rows={9} maxLength={10000} value={text} onChange={(event) => setText(event.target.value)} placeholder="Nhập câu trả lời, bài viết hoặc ghi chú cho giáo viên..." /><div className="-mt-2 mb-3 text-right text-[0.7rem] text-muted">{text.length}/10.000 ký tự</div></label>
      <div className="mb-4 rounded-lg border border-dashed border-line p-4"><label htmlFor="submission-file" className="block cursor-pointer"><span className={cx.label}>Ảnh hoặc tệp đính kèm</span><span className="flex min-h-20 flex-col items-center justify-center rounded-[12px] border border-line bg-[#FBFAFE] px-4 py-3 text-center transition hover:border-gold hover:bg-goldpale/20"><span className="text-2xl" aria-hidden="true">↑</span><b className="mt-1 text-sm text-ink">Chạm để chọn ảnh hoặc tệp</b><span className="mt-1 text-xs text-muted">Ảnh, PDF, TXT hoặc Word · tối đa 5 MB</span></span><input id="submission-file" ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,.doc,.docx" onChange={(event) => { const selected = event.target.files?.[0] || null; if (selected && selected.size > 5 * 1024 * 1024) { toast("Tệp vượt quá giới hạn 5 MB."); event.target.value = ""; setFile(null); return; } setFile(selected); setRemoveFile(false); }} className="sr-only" /></label><p className="mt-2 text-[0.72rem] text-muted">Bạn có thể thay tệp hiện tại bằng một tệp mới.</p>
        {file && <div className="mt-3 rounded-md bg-goldpale/50 p-2 text-sm">Tệp mới: <b>{file.name}</b> · {sizeLabel(file.size)}</div>}
        {existingFile && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-[#faf8f2] p-2 text-sm"><span>Tệp hiện tại: <b>{data.submission?.fileName}</b> · {sizeLabel(data.submission?.fileSize || null)}</span><a className="ml-auto text-golddark hover:underline" href={`/api/assignments/${params.id}/submission/file`}>Tải xuống</a><button type="button" className="text-bad hover:underline" onClick={() => { setRemoveFile(true); setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>Gỡ tệp</button></div>}
      </div>
      <div className="flex flex-wrap justify-end gap-2"><Link href="/assignments" className={`${cx.btn} ${cx.btnGhost}`}>Hủy</Link><button className={`${cx.btn} ${cx.btnGold}`} disabled={saving || (!text.trim() && !file && !existingFile)}>{saving ? "Đang nộp..." : data.submission ? "Nộp lại" : "Nộp bài"}</button></div>
    </form>
  </div>;
}
