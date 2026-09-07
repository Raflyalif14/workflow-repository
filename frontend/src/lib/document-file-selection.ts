export const MAX_DOCUMENT_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_DOCUMENT_FILES = 10;
export const DOCUMENT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.svg,.zip,.txt,.json";

const allowedExtensions = new Set(DOCUMENT_ACCEPT.split(","));

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

export function selectSingleDocumentFile(
  selectedFiles: Iterable<File> | ArrayLike<File> | null | undefined
): { file: File | null; error: string | null } {
  const selectedFile = Array.from(selectedFiles || [])[0] || null;
  if (!selectedFile) return { file: null, error: null };

  const error = getDocumentFileValidationError(selectedFile);
  return error ? { file: null, error } : { file: selectedFile, error: null };
}

export function appendDocumentFiles(
  currentFiles: File[],
  selectedFiles: Iterable<File> | ArrayLike<File> | null | undefined,
  maxFiles = MAX_DOCUMENT_FILES
): { files: File[]; error: string | null } {
  const incomingFiles = Array.from(selectedFiles || []);
  const invalidFile = incomingFiles.find((file) => getDocumentFileValidationError(file));
  if (invalidFile) {
    return { files: currentFiles, error: getDocumentFileValidationError(invalidFile) };
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

export function removeDocumentFile(files: File[], index: number): File[] {
  return files.filter((_, fileIndex) => fileIndex !== index);
}

export function canSubmitDocumentFiles(files: File[], selectionError: string | null): boolean {
  return files.length > 0 && !selectionError;
}
