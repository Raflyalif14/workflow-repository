import { getIntlLocale, translate, translateOutputName } from "@/i18n";
import { formatDocumentCategory } from "./document-surface-ux";
import {LIST_PAGE_SIZE} from './list-pagination';
import type { OutputRepositoryItem } from "@/hooks/use-output-documents";
import type { DocumentCategory, DocumentItem, DocumentStatus } from "@/types/document";

export type RepositoryItem =
  | { sourceType: "OFFICIAL"; sourceId: string; document: DocumentItem }
  | { sourceType: "OUTPUT"; sourceId: string; output: OutputRepositoryItem };

export type RepositoryAccessGroup = "ALL" | "NATIVE";

export function repositoryAccessGroups(role?: string): RepositoryAccessGroup[] {
  return role === "SALES" || role === "SA" ? ["ALL", "NATIVE"] : ["ALL"];
}

// Undefined data, disabled queries and failures are not successful empty results.
export function repositoryLoadState(enabled: boolean, documents: { data?: unknown; isError: boolean },
  outputs: { data?: unknown; isError: boolean }): "loading" | "error" | "ready" {
  if (!enabled) return "loading";
  if (documents.isError || outputs.isError) return "error";
  return Array.isArray(documents.data) && Array.isArray(outputs.data) ? "ready" : "loading";
}

export function requireRepositoryArray<T>(data: T[]): T[] {
  if (!Array.isArray(data)) throw new Error("Document repository response is unavailable.");
  return data;
}

export type RepositoryFilters = {
  accessGroup?: RepositoryAccessGroup;
  search: string;
  category: string;
  status: DocumentStatus | "ALL";
  stageGroup?: "ALL" | "PRA_TENDER" | "ON_SUBMISSION_TENDER";
};

export const REPOSITORY_PAGE_SIZE = LIST_PAGE_SIZE;

export function outputMatchesCategory(output: OutputRepositoryItem, category: string): boolean {
  if (!category || category === "ALL" || category === "OUTPUT") return true;
  const cat = category.toLowerCase();
  const key = (output.documentKey || "").toLowerCase();
  const name = (output.name || "").toLowerCase();

  if (key === cat || key.replace(/_/g, "-") === cat.replace(/_/g, "-")) return true;

  if (cat === "proposal_teknis") {
    return key === "proposal_teknis" || (name.includes("proposal") && name.includes("teknis"));
  }
  if (cat === "proposal_deck_solusi") {
    return key === "proposal_deck_solusi" || (name.includes("proposal") && (name.includes("deck") || name.includes("solusi")));
  }
  if (cat === "spesifikasi_teknis") {
    return key.includes("spesifikasi") || name.includes("spesifikasi");
  }
  if (cat === "identitas_barang_produk") {
    return key.includes("identitas_barang") || name.includes("identitas barang");
  }
  if (cat === "timeline_proyek") {
    return key.includes("timeline") || name.includes("timeline");
  }
  if (cat === "rab") {
    return key === "rab" || key === "boq" || name.includes("rab") || name.includes("boq");
  }
  if (cat === "metodologi_implementasi") {
    return key.includes("metodologi") || name.includes("metodologi");
  }
  if (cat === "arsitektur_sistem") {
    return key.includes("arsitektur") || key.includes("architecture") || name.includes("arsitektur");
  }
  if (cat === "assessment") {
    return key.includes("assessment") || name.includes("assessment");
  }
  if (cat === "kak_rfp") {
    return key.includes("kak") || key.includes("rfp") || name.includes("kak") || name.includes("rfp");
  }
  if (cat === "poc_demo") {
    return key.includes("poc") || key.includes("demo") || name.includes("poc") || name.includes("demo");
  }
  if (cat === "rencana_distribusi") {
    return key.includes("distribusi") || name.includes("distribusi");
  }
  if (cat === "kajian_kebutuhan") {
    return key.includes("kajian") || key.includes("kebutuhan") || key.includes("requirement") || name.includes("kajian") || name.includes("kebutuhan");
  }
  if (cat === "other") {
    return true;
  }

  // Legacy uppercase categories (for existing tests like document-repository.test.ts)
  if (category === "PROPOSAL") {
    return key.includes("proposal") || name.includes("proposal");
  }
  if (category === "ARCHITECTURE_DESIGN") {
    return key.includes("spesifikasi") || key.includes("arsitektur") || key.includes("architecture") || name.includes("spesifikasi");
  }
  if (category === "BOQ") {
    return key.includes("rab") || key.includes("boq") || name.includes("rab") || name.includes("boq");
  }
  if (category === "ASSESSMENT_REPORT") {
    return key.includes("assessment") || name.includes("assessment");
  }
  if (category === "SIZING_SHEET") {
    return key.includes("sizing") || name.includes("sizing");
  }
  if (category === "MOM") {
    return key.includes("mom") || key.includes("notulen") || name.includes("mom") || name.includes("notulen");
  }
  if (category === "DELIVERABLE") {
    return true;
  }

  return key.includes(cat) || name.includes(cat);
}

export function buildRepositoryItems(documents: readonly DocumentItem[], outputs: readonly OutputRepositoryItem[]): RepositoryItem[] {
  const items: RepositoryItem[] = [...new Map(documents.map(document => [document.id, document])).values()].map((document) => ({
    sourceType: "OFFICIAL", sourceId: document.id, document,
  }));
  const outputIds = new Set<string>();
  for (const output of outputs) {
    if (output.status !== "APPROVED" || !output.projectId || !output.documentKey
      || !output.approvedVersionId || !output.files?.length) continue;
    const sourceId = `${output.projectId}:${output.documentKey}`;
    if (outputIds.has(sourceId)) continue;
    outputIds.add(sourceId);
    items.push({ sourceType: "OUTPUT", sourceId, output });
  }
  return items.sort((left, right) => {
    const leftUpdated = left.sourceType === "OFFICIAL" ? left.document.updatedAt : left.output.updatedAt || "";
    const rightUpdated = right.sourceType === "OFFICIAL" ? right.document.updatedAt : right.output.updatedAt || "";
    return rightUpdated.localeCompare(leftUpdated) || `${left.sourceType}:${left.sourceId}`.localeCompare(`${right.sourceType}:${right.sourceId}`);
  });
}

export function isOutcomeEvidenceDocument(document: Pick<DocumentItem, "title" | "milestoneId">): boolean {
  return document.title.toLowerCase().startsWith("result evidence") || !document.milestoneId;
}

export function getProjectGroupStageCounts(items: readonly RepositoryItem[]): {
  praCount: number;
  subCount: number;
  outcomeCount: number;
} {
  let praCount = 0;
  let subCount = 0;
  let outcomeCount = 0;

  for (const item of items) {
    if (item.sourceType === "OUTPUT") {
      if (item.output.group === "PRA_TENDER") praCount += 1;
      else if (item.output.group === "ON_SUBMISSION_TENDER") subCount += 1;
      continue;
    }

    if (isOutcomeEvidenceDocument(item.document)) {
      outcomeCount += 1;
    } else if (item.document.milestoneId) {
      praCount += 1;
    }
  }

  return { praCount, subCount, outcomeCount };
}

export type RepositorySummaryCounts = {
  total: number;
  outputDocuments: number;
  finalProjectResults: number;
  sharedInternal: number;
};

/** Summarize repository items into business-facing categories where deliverables + outcomes = total. */
export function getRepositorySummaryCounts(items: readonly RepositoryItem[]): RepositorySummaryCounts {
  let outputDocuments = 0;
  let finalProjectResults = 0;
  let sharedInternal = 0;

  for (const item of items) {
    const access = item.sourceType === "OFFICIAL" ? item.document : item.output;
    if (access.accessMode === "SHARED_INTERNAL" || access.canReadProject === false) {
      sharedInternal += 1;
    }
    if (item.sourceType === "OFFICIAL" && isOutcomeEvidenceDocument(item.document)) {
      finalProjectResults += 1;
    } else {
      outputDocuments += 1;
    }
  }

  return {
    total: items.length,
    outputDocuments,
    finalProjectResults,
    sharedInternal,
  };
}

export type RepositoryCategoryOption = {
  value: string;
  label: string;
};

function isOtherCategoryOption(value: string, label: string): boolean {
  const normalizedValue = value.trim().toUpperCase();
  const normalizedLabel = label.trim().toLocaleLowerCase();
  return normalizedValue === "OTHER"
    || normalizedLabel === translate("copy.other").trim().toLocaleLowerCase();
}

/** Build deduplicated category filter options from currently accessible items, keeping "Other" last. */
export function buildRepositoryCategoryOptions(items: readonly RepositoryItem[]): RepositoryCategoryOption[] {
  const seenValues = new Set<string>(["ALL"]);
  const seenLabels = new Set<string>();
  const regularOptions: RepositoryCategoryOption[] = [];
  let otherOption: RepositoryCategoryOption | null = null;

  for (const item of items) {
    let value = "";
    let label = "";

    if (item.sourceType === "OUTPUT") {
      value = item.output.documentKey?.trim() || "";
      if (!value) continue;
      label = translateOutputName(value, item.output.name || value).trim();
    } else if (isOutcomeEvidenceDocument(item.document)) {
      value = "OFFICIAL_EVIDENCE";
      label = translate("documentPage.tenderEvidence");
    } else if (item.document.milestoneId) {
      value = "OFFICIAL_MILESTONE";
      label = translate("documentPage.milestoneDoc");
    } else {
      value = item.document.category;
      label = formatDocumentCategory(item.document.category);
    }

    const normalizedLabel = label.trim().toLocaleLowerCase();
    if (!value || !normalizedLabel || seenValues.has(value) || seenLabels.has(normalizedLabel)) {
      continue;
    }

    seenValues.add(value);
    seenLabels.add(normalizedLabel);

    if (isOtherCategoryOption(value, label)) {
      otherOption = { value, label };
    } else {
      regularOptions.push({ value, label });
    }
  }

  const locale = getIntlLocale();
  regularOptions.sort((left, right) => left.label.localeCompare(right.label, locale));

  return [
    { value: "ALL", label: translate("documentPage.allOutputDocuments") },
    ...regularOptions,
    ...(otherOption ? [otherOption] : []),
  ];
}

export function filterRepositoryItems(items: readonly RepositoryItem[], filters: RepositoryFilters): RepositoryItem[] {
  const query = filters.search.trim().toLocaleLowerCase();
  return items.filter((item) => {
    const access = item.sourceType === "OFFICIAL" ? item.document : item.output;
    if (filters.accessGroup === "NATIVE" && access.canReadProject !== true) return false;
    if (filters.stageGroup && filters.stageGroup !== "ALL") {
      if (item.sourceType === "OUTPUT" && item.output.group !== filters.stageGroup) {
        return false;
      }
      if (item.sourceType === "OFFICIAL") {
        const isOutcomeEvidence = isOutcomeEvidenceDocument(item.document);
        if (filters.stageGroup === "PRA_TENDER" && isOutcomeEvidence) return false;
        if (filters.stageGroup === "ON_SUBMISSION_TENDER" && !isOutcomeEvidence) return false;
      }
    }
    if (item.sourceType === "OFFICIAL") {
      const document = item.document;
      const cat = filters.category;
      const isOutcome = isOutcomeEvidenceDocument(document);
      const isMilestone = !isOutcome && Boolean(document.milestoneId);
      const matchesCategory =
        cat === "ALL" ||
        (cat === "OFFICIAL_EVIDENCE" && isOutcome) ||
        (cat === "OFFICIAL_MILESTONE" && isMilestone) ||
        document.category === cat ||
        (cat === "OTHER" && document.category === "OTHER") ||
        (cat === "other" && document.category === "OTHER") ||
        (cat.startsWith("proposal") && document.category === "PROPOSAL") ||
        (cat.includes("spesifikasi") && document.category === "ARCHITECTURE_DESIGN") ||
        (cat === "rab" && document.category === "BOQ") ||
        (cat === "assessment" && document.category === "ASSESSMENT_REPORT");
      return (
        matchesCategory &&
        (filters.status === "ALL" || document.status === filters.status) &&
        (!query || `${document.title} ${document.project?.name || ""} ${document.versions?.[0]?.fileName || ""}`.toLocaleLowerCase().includes(query))
      );
    }
    const output = item.output;
    return outputMatchesCategory(output, filters.category)
      && (filters.status === "ALL" || filters.status === "APPROVED")
      && (!query || `${output.name} ${output.projectName} ${output.files.map((file) => file.fileName).join(" ")}`.toLocaleLowerCase().includes(query));
  });
}

export function paginateRepositoryItems(items: readonly RepositoryItem[], page: number, pageSize = REPOSITORY_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return { page: safePage, totalPages, items: items.slice((safePage - 1) * pageSize, safePage * pageSize) };
}
