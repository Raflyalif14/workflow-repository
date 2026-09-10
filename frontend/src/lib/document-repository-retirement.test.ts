import { existsSync, readFileSync } from "fs";
import { join } from "path";

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const sourceRoot = join(process.cwd(), "src");
const documentsPage = readFileSync(join(sourceRoot, "app", "documents", "page.tsx"), "utf8");
const documentHooks = readFileSync(join(sourceRoot, "hooks", "use-documents.ts"), "utf8");
const uploadDialogPath = join(sourceRoot, "components", "documents", "upload-document-dialog.tsx");

assert(!documentsPage.includes("UploadDocumentDialog"), "Documents page must not render the retired generic upload dialog");
assert(!documentsPage.includes("Upload Document"), "Documents page must not expose the retired generic upload action");
assert(!documentHooks.includes("useUploadDocument"), "Document hooks must not expose the retired generic upload mutation");
assert(!existsSync(uploadDialogPath), "The retired generic upload dialog must be removed");

console.log("Document repository retirement UI test passed.");
