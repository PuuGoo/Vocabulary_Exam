const DOCUMENT_PREFIX = /^\s*\d+\s*[._-]?\s*/;

export function removeDocumentDisplayPrefix(value: string) {
  return value.replace(DOCUMENT_PREFIX, "").trim();
}

export function formatAggregatedDocumentName(order: number, value: string) {
  const extensionMatch = value.match(/\.(pdf|docx|doc)$/i);
  const extension = extensionMatch?.[0] || "";
  const stem = extension ? value.slice(0, -extension.length) : value;
  const label = removeDocumentDisplayPrefix(stem) || "Tài liệu";
  return `${String(order).padStart(2, "0")}_${label}${extension}`;
}

type DocumentLocation = { id: number; category: string; title: string };

export function compareDocumentsByFolderThenName(left: DocumentLocation, right: DocumentLocation) {
  const categoryOrder = left.category.localeCompare(right.category, "vi", { numeric: true, sensitivity: "base" });
  if (categoryOrder !== 0) return categoryOrder;
  const titleOrder = left.title.localeCompare(right.title, "vi", { numeric: true, sensitivity: "base" });
  return titleOrder !== 0 ? titleOrder : left.id - right.id;
}
