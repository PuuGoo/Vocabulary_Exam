"use client";

import { useEffect, useState } from "react";
import { documentExtension } from "@/lib/categoryDocumentFile";

type PreviewDocument = { id: number; title: string; fileName: string; fileType: string };

export default function DocumentPreview({ document, version = 0 }: { document: PreviewDocument; version?: number }) {
  const extension = documentExtension(document.fileName);
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(extension === ".docx");
  const [error, setError] = useState("");
  const source = `/api/admin/category-documents/${document.id}/file?v=${version}`;

  useEffect(() => {
    if (extension !== ".docx") return;
    const controller = new AbortController();
    setLoading(true); setError(""); setHtml("");
    void (async () => {
      try {
        const response = await fetch(source, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Không thể tải tài liệu Word.");
        const [mammoth, { default: DOMPurify }] = await Promise.all([import("mammoth/mammoth.browser"), import("dompurify")]);
        const result = await mammoth.convertToHtml({ arrayBuffer: await response.arrayBuffer() });
        if (!controller.signal.aborted) setHtml(DOMPurify.sanitize(result.value, { USE_PROFILES: { html: true } }));
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Không thể mở tài liệu Word.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [extension, source]);

  if (extension === ".pdf") return <iframe title={`Tài liệu ${document.title}`} src={source} className="h-[70vh] min-h-[480px] w-full rounded-xl border border-line bg-[#F8F8FC]" />;
  if (extension === ".doc") return <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-[#FAF9FD] p-6 text-center"><b>Định dạng Word `.doc` cũ chưa thể xem trực tiếp</b><p className="mt-2 max-w-lg text-sm leading-6 text-muted">Bạn vẫn có thể tải file xuống và mở bằng Microsoft Word. Để xem ngay trên website, hãy lưu lại file dưới dạng `.docx` rồi thay file.</p><a className="mt-4 rounded-xl bg-[#7865EE] px-4 py-3 text-sm font-bold text-white" href={source} download={document.fileName}>Tải file Word xuống</a></div>;
  if (loading) return <div className="flex min-h-64 items-center justify-center rounded-xl border border-line bg-[#FAF9FD] text-sm text-muted" role="status">Đang chuyển tài liệu Word thành bản xem trước…</div>;
  if (error) return <div className="rounded-xl border border-[#F0B7B7] bg-[#FFF4F5] p-5 text-sm text-[#8D3D49]">{error}</div>;
  return <article className="docx-preview max-h-[70vh] min-h-[480px] overflow-auto rounded-xl border border-line bg-white p-5 sm:p-8" dangerouslySetInnerHTML={{ __html: html }} />;
}
