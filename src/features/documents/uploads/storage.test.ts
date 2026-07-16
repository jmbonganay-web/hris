import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeDocumentFilename, verifyDocumentSignature, documentExtensionForMime } from "./storage.ts";

test("display filenames are sanitized without losing the extension", () => {
  assert.equal(sanitizeDocumentFilename("  My / ID .. copy.PDF  "), "my-id-copy.pdf");
  assert.equal(sanitizeDocumentFilename("résumé 2026.docx"), "resume-2026.docx");
});

test("stored extensions are derived from MIME instead of client names", () => {
  assert.equal(documentExtensionForMime("application/pdf"), "pdf");
  assert.equal(documentExtensionForMime("image/jpeg"), "jpg");
  assert.equal(documentExtensionForMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "docx");
});

test("file signatures must match the approved MIME", () => {
  assert.equal(verifyDocumentSignature(Buffer.from("%PDF-1.7"), "application/pdf"), true);
  assert.equal(verifyDocumentSignature(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"), true);
  assert.equal(verifyDocumentSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"), true);
  assert.equal(verifyDocumentSignature(Buffer.from([0x50, 0x4b, 0x03, 0x04]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), true);
  assert.equal(verifyDocumentSignature(Buffer.from("%PDF-1.7"), "image/png"), false);
});
