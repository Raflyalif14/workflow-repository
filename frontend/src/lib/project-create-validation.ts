import type { TranslationKey } from "@/i18n";
import type { Scenario } from "@/types/scenario";
import { getDocumentFileValidationError, getProjectMomFileValidationError, getProjectPhotoFileValidationError } from "@/lib/document-file-selection";

export function parseRupiahInput(value: string): string {
  if (!value) return "";
  const cleanDigits = value.replace(/\D/g, "");
  return cleanDigits.replace(/^0+(?=\d)/, "");
}

export function formatRupiahInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const cleanDigits = String(value).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!cleanDigits) return "";
  return new Intl.NumberFormat("id-ID").format(BigInt(cleanDigits));
}

export function getProjectRevenueError(value: string): TranslationKey | null {
  if (!value.trim()) return "projectCreate.revenueRequired";
  if (!/^(\s*Rp\s*)?[\d\s.,]+$/i.test(value.trim())) return "copy.revenueValidation";
  const direct = Number(value.trim());
  if (Number.isFinite(direct)) {
    return direct < 0 ? "copy.revenueValidation" : null;
  }
  const clean = value.replace(/\D/g, "");
  if (!clean) return "copy.revenueValidation";
  return null;
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
