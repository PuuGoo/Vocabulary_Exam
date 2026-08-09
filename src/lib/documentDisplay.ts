const DOCUMENT_PREFIX = /^\s*\d+\s*[._-]?\s*/;

export function removeDocumentDisplayPrefix(value: string) {
  return value.replace(DOCUMENT_PREFIX, "").trim();
}

export function formatAggregatedDocumentName(order: number, value: string) {
  const extensionMatch = value.match(/\.pdf$/i);
  const extension = extensionMatch?.[0] || "";
  const stem = extension ? value.slice(0, -extension.length) : value;
  const label = removeDocumentDisplayPrefix(stem) || "Tài liệu";
  return `${String(order).padStart(2, "0")}_${label}${extension}`;
}
