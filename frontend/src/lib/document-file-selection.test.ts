import {
  appendDocumentFiles,
  canSubmitDocumentFiles,
  getDocumentFileValidationError,
  removeDocumentFile,
  selectSingleDocumentFile,
} from "./document-file-selection";

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const file = (name: string, size = 1024, lastModified = 1): File =>
  ({ name, size, lastModified } as File);

const firstBatch = [file("one.pdf", 100, 1), file("two.docx", 200, 2), file("three.xlsx", 300, 3)];
const selectedThree = appendDocumentFiles([], firstBatch);
assert(selectedThree.error === null && selectedThree.files.length === 3, "Selecting three files at once must retain all three files");

const momSelection = selectSingleDocumentFile(firstBatch);
assert(momSelection.error === null && momSelection.file === firstBatch[0], "MoM selection must retain exactly one file");

const secondBatch = [file("four.png", 400, 4), file("five.zip", 500, 5)];
const appended = appendDocumentFiles(selectedThree.files, secondBatch);
assert(appended.error === null && appended.files.length === 5, "Reopening the picker must append new files");

const duplicate = appendDocumentFiles(appended.files, [firstBatch[0]]);
assert(duplicate.error === null && duplicate.files.length === 5, "A duplicate file fingerprint must not be added twice");

const removed = removeDocumentFile(appended.files, 1);
assert(removed.length === 4 && removed[0].name === "one.pdf" && removed[1].name === "three.xlsx", "Removing one file must preserve the remaining files");

const tenFiles = Array.from({ length: 10 }, (_, index) => file(`file-${index}.pdf`, 100, index));
const maxed = appendDocumentFiles([], tenFiles);
const overLimit = appendDocumentFiles(maxed.files, [file("eleven.pdf", 100, 11)]);
assert(overLimit.files.length === 10 && Boolean(overLimit.error), "Selecting more than ten files must preserve the valid existing selection and report an error");

assert(getDocumentFileValidationError(file("unsupported.exe")) !== null, "Unsupported extensions must be rejected");
assert(getDocumentFileValidationError(file("large.pdf", 50 * 1024 * 1024 + 1)) !== null, "Files over 50 MB must be rejected");
assert(!canSubmitDocumentFiles([], null), "Submit Work must require at least one file");
assert(canSubmitDocumentFiles([file("submission.pdf")], null), "A valid non-empty submission can be sent");
assert(!canSubmitDocumentFiles([file("submission.pdf")], "Too many files"), "Selection errors must block submission");

console.log("Document file selection tests passed.");
