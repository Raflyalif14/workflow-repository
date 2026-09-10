export const MAX_DOCUMENT_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_DOCUMENT_FILES = 10;
export const DOCUMENT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.svg,.zip,.txt,.json";
export const PROJECT_MOM_ACCEPT = "application/pdf,.pdf";
export const PROJECT_PHOTO_ACCEPT = "image/jpeg,image/png,.jpg,.jpeg,.png";
export const MAX_PROJECT_PHOTOS = 10;

const allowedExtensions = new Set(DOCUMENT_ACCEPT.split(","));
const projectPhotoExtensions = new Set([".jpg", ".jpeg", ".png"]);
const projectPhotoMimeTypes = new Set(["image/jpeg", "image/png"]);

export function getDocumentFileKey(file: Pick<File, "name" | "size" | "lastModified">): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

export function getDocumentFileValidationError(file: Pick<File, "name" | "size">): string | null {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!file.name.trim() || !allowedExtensions.has(extension)) {
    return "File format not supported. Choose a supported document type.";
  }
  if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    return `${file.name} exceeds the 50 MB file limit.`;
  }
  return null;
}

export function getProjectMomFileValidationError(file: Pick<File, "name" | "size" | "type">): string | null {
  if (file.name.slice(file.name.lastIndexOf(".")).toLowerCase() !== ".pdf" || file.type.toLowerCase() !== "application/pdf") {
    return "The MoM file must be a PDF.";
  }
  if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    return `${file.name} exceeds the 50 MB file limit.`;
  }
  return null;
}

export function getProjectPhotoFileValidationError(file: Pick<File, "name" | "size" | "type">): string | null {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!file.name.trim() || !projectPhotoExtensions.has(extension) || !projectPhotoMimeTypes.has(file.type.toLowerCase())) {
    return "Project photos must be JPG, JPEG, or PNG images.";
  }
  if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    return `${file.name} exceeds the 50 MB file limit.`;
  }
  return null;
}

export function selectSingleDocumentFile(
  selectedFiles: Iterable<File> | ArrayLike<File> | null | undefined
): { file: File | null; error: string | null } {
  const selectedFile = Array.from(selectedFiles || [])[0] || null;
  if (!selectedFile) return { file: null, error: null };

  const error = getDocumentFileValidationError(selectedFile);
  return error ? { file: null, error } : { file: selectedFile, error: null };
}

export function selectSingleProjectMomFile(
  selectedFiles: Iterable<File> | ArrayLike<File> | null | undefined
): { file: File | null; error: string | null } {
  const files = Array.from(selectedFiles || []);
  if (!files.length) return { file: null, error: null };
  if (files.length !== 1) return { file: null, error: "Exactly one MoM file is required." };

  const error = getProjectMomFileValidationError(files[0]);
  return error ? { file: null, error } : { file: files[0], error: null };
}

function appendValidatedFiles(
  currentFiles: File[],
  selectedFiles: Iterable<File> | ArrayLike<File> | null | undefined,
  validateFile: (file: File) => string | null,
  maxFiles: number
): { files: File[]; error: string | null } {
  const incomingFiles = Array.from(selectedFiles || []);
  const invalidFile = incomingFiles.find((file) => validateFile(file));
  if (invalidFile) {
    return { files: currentFiles, error: validateFile(invalidFile) };
  }

  const existingKeys = new Set(currentFiles.map(getDocumentFileKey));
  const additions = incomingFiles.filter((file) => {
    const key = getDocumentFileKey(file);
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });

  if (currentFiles.length + additions.length > maxFiles) {
    return {
      files: currentFiles,
      error: `A maximum of ${maxFiles} files may be selected. Remove a file before adding another.`,
    };
  }

  return { files: [...currentFiles, ...additions], error: null };
}

export function appendDocumentFiles(
  currentFiles: File[],
  selectedFiles: Iterable<File> | ArrayLike<File> | null | undefined,
  maxFiles = MAX_DOCUMENT_FILES
): { files: File[]; error: string | null } {
  return appendValidatedFiles(currentFiles, selectedFiles, getDocumentFileValidationError, maxFiles);
}

export function appendProjectPhotoFiles(
  currentFiles: File[],
  selectedFiles: Iterable<File> | ArrayLike<File> | null | undefined,
  maxFiles = MAX_PROJECT_PHOTOS
): { files: File[]; error: string | null } {
  return appendValidatedFiles(currentFiles, selectedFiles, getProjectPhotoFileValidationError, maxFiles);
}

export function removeDocumentFile(files: File[], index: number): File[] {
  return files.filter((_, fileIndex) => fileIndex !== index);
}

export function canSubmitDocumentFiles(files: File[], selectionError: string | null): boolean {
  return files.length > 0 && !selectionError;
}
