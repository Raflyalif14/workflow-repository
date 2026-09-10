import {
  appendDocumentFiles,
  appendProjectPhotoFiles,
  canSubmitDocumentFiles,
  getDocumentFileValidationError,
  getProjectMomFileValidationError,
  getProjectPhotoFileValidationError,
  removeDocumentFile,
  selectSingleDocumentFile,
  selectSingleProjectMomFile,
} from "./document-file-selection";

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const file = (name: string, size = 1024, lastModified = 1, type = "application/pdf"): File =>
  ({ name, size, lastModified, type } as File);

const firstBatch = [file("one.pdf", 100, 1), file("two.docx", 200, 2), file("three.xlsx", 300, 3)];
const selectedThree = appendDocumentFiles([], firstBatch);
assert(selectedThree.error === null && selectedThree.files.length === 3, "Selecting three files at once must retain all three files");

const momSelection = selectSingleDocumentFile(firstBatch);
assert(momSelection.error === null && momSelection.file === firstBatch[0], "MoM selection must retain exactly one file");

const validMom = file("mom.pdf", 100, 10, "application/pdf");
const strictMom = selectSingleProjectMomFile([validMom]);
assert(strictMom.error === null && strictMom.file === validMom, "Project MoM selection must accept one PDF with the PDF MIME type");
assert(getProjectMomFileValidationError(file("renamed.pdf", 100, 11, "image/jpeg")) !== null, "A non-PDF MIME type must not pass as a MoM by filename");
assert(getProjectMomFileValidationError(file("wrong-extension.docx", 100, 12, "application/pdf")) !== null, "A PDF MIME type must not pass as a MoM with the wrong extension");
assert(selectSingleProjectMomFile([validMom, file("second.pdf", 100, 13, "application/pdf")]).error !== null, "Project MoM selection must reject more than one file");

const photos = [
  file("site.jpg", 100, 20, "image/jpeg"),
  file("site.jpeg", 100, 21, "image/jpeg"),
  file("site.png", 100, 22, "image/png"),
];
const selectedPhotos = appendProjectPhotoFiles([], photos);
assert(selectedPhotos.error === null && selectedPhotos.files.length === 3, "Project photo selection must retain JPG, JPEG, and PNG files");
const appendedPhotos = appendProjectPhotoFiles(selectedPhotos.files, [file("extra.jpg", 100, 23, "image/jpeg")]);
assert(appendedPhotos.error === null && appendedPhotos.files.length === 4, "Project photo selection must append a later picker selection");
assert(appendProjectPhotoFiles(appendedPhotos.files, [photos[0]]).files.length === 4, "Duplicate project photos must not be added twice");
assert(getProjectPhotoFileValidationError(file("not-a-photo.pdf", 100, 24, "application/pdf")) !== null, "Non-image project photos must be rejected");
assert(getProjectPhotoFileValidationError(file("renamed.jpg", 100, 25, "application/pdf")) !== null, "Project photo MIME validation must not rely on the extension alone");
const tenPhotos = Array.from({ length: 10 }, (_, index) => file(`photo-${index}.jpg`, 100, index + 30, "image/jpeg"));
const maxPhotos = appendProjectPhotoFiles([], tenPhotos);
assert(maxPhotos.files.length === 10 && appendProjectPhotoFiles(maxPhotos.files, [file("overflow.png", 100, 99, "image/png")]).error !== null, "Project photos must enforce the maximum selection count");

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
