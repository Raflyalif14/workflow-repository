import type { TranslationKey } from "@/i18n";
import type { Scenario } from "@/types/scenario";
import { getDocumentFileValidationError, getProjectMomFileValidationError, getProjectPhotoFileValidationError } from "@/lib/document-file-selection";

export function getProjectRevenueError(value: string): TranslationKey | null {
  if (!value.trim()) return "projectCreate.revenueRequired";
  const amount = Number(value);
  return !Number.isFinite(amount) || amount < 0 ? "copy.revenueValidation" : null;
}

export function getProjectValidationError({
  name,
  customer,
  scenarioId,
  scenarios,
  estimatedRevenue,
  mom,
  photos,
  documents,
}: {
  name: string;
  customer: string;
  scenarioId: string;
  scenarios: readonly Scenario[];
  estimatedRevenue: string;
  mom: File | null;
  photos: File[];
  documents: File[];
}): string | null {
  if (!name.trim()) return "copy.projectNameRequired";
  if (!customer.trim()) return "copy.customerRequired";
  if (!scenarios.some(scenario => scenario.id === scenarioId && scenario.is_active)) return "copy.selectActiveScenario";
  const revenueError = getProjectRevenueError(estimatedRevenue);
  if (revenueError) return revenueError;
  if (!mom) return "copy.momRequired";
  if (!photos.length) return "copy.photoRequired";
  return [
    getProjectMomFileValidationError(mom),
    ...photos.map(getProjectPhotoFileValidationError),
    ...documents.map(getDocumentFileValidationError),
  ].find(Boolean) || null;
}
