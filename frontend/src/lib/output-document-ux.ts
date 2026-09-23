type OutputDocumentSelection = {
  isRequired: boolean;
  isSelected: boolean;
};

export function getActiveOutputDocuments<T extends OutputDocumentSelection>(documents: readonly T[]): T[] {
  return documents.filter((document) => document.isRequired || document.isSelected);
}
