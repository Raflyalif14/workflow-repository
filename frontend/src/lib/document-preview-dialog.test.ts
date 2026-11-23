import assert from "node:assert/strict";
import { en } from "@/i18n/en";
import { id } from "@/i18n/id";
import { getFileCategory } from "@/components/documents/document-preview-dialog";

// 1. Test i18n parity for docPreview
const requiredKeys = [
  "preview",
  "previewFile",
  "title",
  "loading",
  "unsupportedOffice",
  "downloadFile",
  "approve",
  "requestRevision",
  "loadFailed",
  "fileInfo",
  "uploadedBy",
  "uploadedAt",
  "size",
  "version",
  "close",
  "zoomIn",
  "zoomOut",
  "resetZoom",
  "openNewTab",
] as const;

for (const key of requiredKeys) {
  assert.ok(
    Boolean(en.docPreview[key]),
    `en.docPreview.${key} must be defined and non-empty`
  );
  assert.ok(
    Boolean(id.docPreview[key]),
    `id.docPreview.${key} must be defined and non-empty`
  );
}

// 2. Test getFileCategory function
assert.equal(getFileCategory("proposal.pdf"), "pdf", "PDF file detection");
assert.equal(getFileCategory("document.PDF"), "pdf", "Uppercase PDF detection");
assert.equal(getFileCategory("custom-file", "application/pdf"), "pdf", "PDF MIME detection");

assert.equal(getFileCategory("topology.png"), "image", "PNG image detection");
assert.equal(getFileCategory("architecture.jpg"), "image", "JPG image detection");
assert.equal(getFileCategory("diagram.svg"), "image", "SVG image detection");
assert.equal(getFileCategory("diagram.webp"), "image", "WebP image detection");
assert.equal(getFileCategory("blob-file", "image/png"), "image", "Image MIME detection");

assert.equal(getFileCategory("timeline.docx"), "office", "DOCX office detection");
assert.equal(getFileCategory("budget.xlsx"), "office", "XLSX office detection");
assert.equal(getFileCategory("slides.pptx"), "office", "PPTX office detection");

assert.equal(getFileCategory("schema.json"), "code", "JSON code detection");
assert.equal(getFileCategory("notes.txt"), "code", "TXT code detection");
assert.equal(getFileCategory("readme.md"), "code", "Markdown code detection");

assert.equal(getFileCategory("bundle.zip"), "archive", "ZIP archive detection");
assert.equal(getFileCategory("package.tar.gz"), "archive", "Tar archive detection");

assert.equal(getFileCategory("firmware.bin"), "other", "Unknown extension goes to other");

console.log("Document preview dialog i18n parity and file categorization tests passed successfully.");
