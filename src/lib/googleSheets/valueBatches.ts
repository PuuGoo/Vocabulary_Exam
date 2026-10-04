import type { SheetsValue } from "./api";

export function valueWriteChunks(rangeA1: string, values: SheetsValue, chunkSize = 2000, maxBytes = 1_500_000): Array<{ range: string; values: SheetsValue }> {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error("Invalid write chunk size");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 128) throw new Error("Invalid write byte limit");
  if (!values.length) return [];
  const separator = rangeA1.lastIndexOf("!");
  const prefix = separator >= 0 ? rangeA1.slice(0, separator + 1) : "";
  const cells = rangeA1.slice(separator + 1);
  const match = cells.match(/^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)(?:\$?\d+)?)?$/i);
  if (!match && values.length > chunkSize) throw new Error("Chunked writes require an explicit A1 starting cell");
  if (!match) return [{ range: rangeA1, values }];
  const firstRow = Number(match[2]);
  const chunks: Array<{ range: string; values: SheetsValue }> = [];
  let offset = 0;
  while (offset < values.length) {
    const start = offset;
    let bytes = 64;
    while (offset < values.length && offset - start < chunkSize) {
      const rowBytes = Buffer.byteLength(JSON.stringify(values[offset]), "utf8") + 1;
      if (rowBytes + 64 > maxBytes) throw new Error("A single row exceeds the Google Sheets write byte budget");
      if (bytes + rowBytes > maxBytes) break;
      bytes += rowBytes;
      offset += 1;
    }
    chunks.push({ range: `${prefix}${match[1]}${firstRow + start}`, values: values.slice(start, offset) });
  }
  return chunks;
}

export function valueRequestBatches<T extends { range: string; values: SheetsValue }>(ranges: readonly T[], maxBytes = 1_800_000, maxRanges = 100): T[][] {
  const batches: T[][] = [];
  let batch: T[] = [];
  let bytes = 128;
  for (const range of ranges) {
    const rangeBytes = Buffer.byteLength(JSON.stringify(range), "utf8") + 1;
    if (rangeBytes + 128 > maxBytes) throw new Error("Value range exceeds request byte budget");
    if (batch.length && (batch.length >= maxRanges || bytes + rangeBytes > maxBytes)) {
      batches.push(batch);
      batch = [];
      bytes = 128;
    }
    batch.push(range);
    bytes += rangeBytes;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
