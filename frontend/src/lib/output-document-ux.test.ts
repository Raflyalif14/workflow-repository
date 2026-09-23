import { getActiveOutputDocuments } from "./output-document-ux";

type TestOutputDocument = {
  key: string;
  isRequired: boolean;
  isSelected: boolean;
  status: "NOT_REQUIRED" | "TO_DO" | "APPROVED";
};

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const documents: TestOutputDocument[] = [
  { key: "required", isRequired: true, isSelected: false, status: "TO_DO" },
  { key: "selected-optional", isRequired: false, isSelected: true, status: "APPROVED" },
  { key: "unselected-optional", isRequired: false, isSelected: false, status: "NOT_REQUIRED" },
];
const originalDocuments = [...documents];

const activeDocuments = getActiveOutputDocuments(documents);

assert(activeDocuments.some((document) => document.key === "required"), "Required outputs must remain active.");
assert(activeDocuments.some((document) => document.key === "selected-optional"), "Selected optional outputs must be active.");
assert(!activeDocuments.some((document) => document.key === "unselected-optional"), "Unselected optional outputs must not be active.");
assert(documents.length === originalDocuments.length && documents.every((document, index) => document === originalDocuments[index]), "Filtering must not mutate the input array.");
assert(
  activeDocuments.filter((document) => document.status === "APPROVED").length === 1 && activeDocuments.length === 2,
  "Status counters must use active outputs only."
);

console.log("Output document active visibility: passed");
