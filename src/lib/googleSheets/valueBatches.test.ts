import assert from "node:assert/strict";
import test from "node:test";
import { valueRequestBatches, valueWriteChunks } from "./valueBatches";

test("large writes advance the A1 start instead of overwriting the first chunk", () => {
  const values = Array.from({ length: 10001 }, (_, index) => [String(index)]);
  const chunks = valueWriteChunks("'Vocabulary!Tab'!C7:Q10007", values);
  assert.deepEqual(chunks.map(chunk => chunk.range), ["'Vocabulary!Tab'!C7", "'Vocabulary!Tab'!C2007", "'Vocabulary!Tab'!C4007", "'Vocabulary!Tab'!C6007", "'Vocabulary!Tab'!C8007", "'Vocabulary!Tab'!C10007"]);
  assert.deepEqual(chunks.flatMap(chunk => chunk.values), values);
});

test("small writes, absolute coordinates and empty writes are safe", () => {
  assert.deepEqual(valueWriteChunks("Sheet1!$B$2:$D$3", [["text"], ["=literal"]], 1).map(chunk => chunk.range), ["Sheet1!B2", "Sheet1!B3"]);
  assert.deepEqual(valueWriteChunks("A1", []), []);
  assert.throws(() => valueWriteChunks("named_range", [["a"], ["b"]], 1));
  assert.throws(() => valueWriteChunks("A1", [["a"]], 0));
});

test("UTF-8 byte limits split long vocabulary rows without loss or overlap", () => {
  const values = Array.from({ length: 30 }, () => ["nghĩa tiếng Việt ".repeat(20)]);
  const chunks = valueWriteChunks("'Words'!B2", values, 2000, 1400);
  assert.ok(chunks.length > 1);
  assert.deepEqual(chunks.flatMap(chunk => chunk.values), values);
  let row = 2;
  for (const chunk of chunks) {
    assert.equal(chunk.range, `'Words'!B${row}`);
    assert.ok(Buffer.byteLength(JSON.stringify(chunk.values)) < 1400);
    row += chunk.values.length;
  }
  assert.throws(() => valueWriteChunks("A1", [["x".repeat(2000)]], 2000, 1400));
});

test("batch requests obey both byte and range limits", () => {
  const ranges = Array.from({ length: 250 }, (_, index) => ({ range: `A${index + 1}`, values: [["x".repeat(100)]] }));
  const batches = valueRequestBatches(ranges, 1000, 100);
  assert.deepEqual(batches.flat(), ranges);
  assert.ok(batches.every(batch => Buffer.byteLength(JSON.stringify(batch)) < 1000));
  assert.deepEqual(valueRequestBatches(ranges, 1000000, 100).map(batch => batch.length), [100, 100, 50]);
});
