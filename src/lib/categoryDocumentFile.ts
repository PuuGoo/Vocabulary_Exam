export const DOCUMENT_CHUNK_BYTES = 3 * 1024 * 1024;
export const SUPPORTED_DOCUMENT_ACCEPT = ".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword";

const TYPE_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
};

export function documentExtension(fileName: string) {
  const match = fileName.trim().toLowerCase().match(/\.(pdf|docx|doc)$/);
  return match ? `.${match[1]}` : "";
}

export function documentMimeType(fileName: string, suppliedType = "") {
  const extension = documentExtension(fileName);
  return TYPE_BY_EXTENSION[extension] || suppliedType;
}

export function isSupportedDocument(fileName: string, suppliedType = "") {
  return Boolean(documentExtension(fileName) && documentMimeType(fileName, suppliedType));
}

export function documentKind(fileName: string) {
  const extension = documentExtension(fileName);
  return extension === ".pdf" ? "PDF" : extension === ".docx" ? "DOCX" : extension === ".doc" ? "DOC" : "FILE";
}

export function documentContentLooksValid(fileName: string, data: Uint8Array) {
  const extension = documentExtension(fileName);
  if (extension === ".pdf") return data.length >= 5 && [0x25, 0x50, 0x44, 0x46, 0x2d].every((byte, index) => data[index] === byte);
  if (extension === ".docx") return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
  if (extension === ".doc") return data.length >= 8 && [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((byte, index) => data[index] === byte);
  return false;
}

export function stripDocumentExtension(fileName: string) {
  return fileName.replace(/\.(pdf|docx|doc)$/i, "");
}
