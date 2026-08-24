import assert from "node:assert/strict";
import test from "node:test";
import { documentContentLooksValid, documentExtension, documentKind, documentMimeType, isSupportedDocument } from "./categoryDocumentFile";

test("document helpers recognize PDF and Word files", () => {
  assert.equal(documentExtension("Bài học.DOCX"), ".docx");
  assert.equal(documentKind("lesson.doc"), "DOC");
  assert.equal(documentMimeType("lesson.docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(isSupportedDocument("lesson.txt"), false);
});

test("document signatures reject renamed foreign files", () => {
  assert.equal(documentContentLooksValid("a.pdf", Buffer.from("%PDF-1.7")), true);
  assert.equal(documentContentLooksValid("a.docx", Uint8Array.from([0x50, 0x4b, 0x03, 0x04])), true);
  assert.equal(documentContentLooksValid("a.doc", Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), true);
  assert.equal(documentContentLooksValid("fake.pdf", Buffer.from("hello")), false);
});
