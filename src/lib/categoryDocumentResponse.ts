export type CategoryDocumentBinary = {
  fileName: string;
  fileType: string | null;
  fileData: Buffer | Uint8Array;
};

export function buildCategoryDocumentResponse(document: CategoryDocumentBinary, cacheControl = "private, max-age=3600") {
  const bytes = new Uint8Array(document.fileData);
  const encodedName = encodeURIComponent(document.fileName).replace(/['()]/g, escape);
  const lowerName = document.fileName.toLocaleLowerCase();
  const fallbackName = `document${lowerName.endsWith(".docx") ? ".docx" : lowerName.endsWith(".doc") ? ".doc" : ".pdf"}`;
  return new Response(bytes, {
    headers: {
      "Content-Type": document.fileType || "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
