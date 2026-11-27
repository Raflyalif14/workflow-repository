import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OutputRepositoryItem } from "@/hooks/use-output-documents";
import type { DocumentItem } from "@/types/document";
import { setActiveLanguage, translate } from "../i18n";
import { buildRepositoryCategoryOptions, buildRepositoryItems, filterRepositoryItems, getProjectGroupStageCounts, getRepositorySummaryCounts, paginateRepositoryItems, repositoryAccessGroups, repositoryLoadState, requireRepositoryArray } from "./document-repository";

const official: DocumentItem = {
  id: "same-id", projectId: "p1", milestoneId: "m1", title: "Official proposal",
  category: "PROPOSAL", status: "APPROVED", canUploadVersion: false,
  createdAt: "2026-01-01", updatedAt: "2026-01-01", versions: [],
  project: { id: "p1", name: "Tender A", projectCode: "A", clientName: "Customer" },
};
const output = (key: string, status: OutputRepositoryItem["status"]): OutputRepositoryItem => ({
  projectId: "p1", milestoneId: "m1", projectName: "Tender A", customer: "Customer",
  documentKey: key, name: key, group: "PRA_TENDER", status,
  fileName: `${key}.pdf`, versionNumber: 2, approvedVersionId: `version-${key}`,
  files: [
    { id: `file-${key}`, fileName: `${key}.pdf`, fileSize: 100, mimeType: "application/pdf", uploadedAt: "2026-01-01" },
    { id: `sheet-${key}`, fileName: `${key}-pricing.xlsx`, fileSize: 200, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", uploadedAt: "2026-01-01" },
  ],
});
const approved = output("same-id", "APPROVED");
const items = buildRepositoryItems([official], [approved, approved, output("draft", "DRAFT")]);
assert.equal(items.length, 2, "The approved output and official document should coexist without duplicate output rows");
assert.notEqual(`${items[0].sourceType}:${items[0].sourceId}`, `${items[1].sourceType}:${items[1].sourceId}`);
assert.deepEqual(filterRepositoryItems(items, { search: "same-id.pdf", category: "ALL", status: "ALL" }).map((item) => item.sourceType), ["OUTPUT"]);
assert.deepEqual(filterRepositoryItems(items, { search: "same-id-pricing.xlsx", category: "ALL", status: "ALL" }).map((item) => item.sourceType), ["OUTPUT"], "Search must include every approved snapshot file");
assert.equal(buildRepositoryItems([], [{ ...approved, files: [] }, { ...approved, approvedVersionId: "" }]).length, 0, "An output requires a valid approved snapshot with files");
assert.deepEqual(filterRepositoryItems(items, { search: "", category: "OUTPUT", status: "APPROVED" }).map((item) => item.sourceType), ["OUTPUT"]);
assert.deepEqual(filterRepositoryItems(items, { search: "", category: "PROPOSAL", status: "APPROVED" }).map((item) => item.sourceType), ["OFFICIAL"]);
assert.equal(filterRepositoryItems(items, { search: "", category: "ALL", status: "DRAFT" }).length, 0);

const many = buildRepositoryItems([official], Array.from({ length: 43 }, (_, index) => output(`result-${index}`, "APPROVED")));
const first = paginateRepositoryItems(many, 1);
const second = paginateRepositoryItems(many, 2);
const last = paginateRepositoryItems(many, 5);
assert.equal(first.items.length, 10);
assert.equal(second.items.length, 10);
assert.equal(last.items.length, 4);
assert.equal(new Set([...[1,2,3,4,5].flatMap(page=>paginateRepositoryItems(many,page).items)].map((item) => `${item.sourceType}:${item.sourceId}`)).size, many.length);
assert.equal(paginateRepositoryItems(many, 99).page, 5);
const outputHooks = readFileSync(join(__dirname, "../hooks/use-output-documents.ts"), "utf8");
const documentsPage = readFileSync(join(__dirname, "../app/documents/page.tsx"), "utf8");
assert(documentsPage.includes("buildRepositoryItems(documents, outputs)"),
  "Documents must render the combined repository directly");
assert(documentsPage.includes('role="tablist"') && !documentsPage.includes("OutputDocumentsTab")
  && !documentsPage.includes('item.status !== "APPROVED"'),
  "Documents must not expose a second non-final output panel");
const reviewMutation = outputHooks.split("export function useReviewOutputDocuments")[1]?.split("export function useUpdateOutputChecklist")[0] || "";
assert(reviewMutation.includes("queryClient.invalidateQueries({ queryKey: outputDocumentKeys.repository() })")
  || (reviewMutation.includes("invalidateOutputDocument(queryClient, projectId)")
    && outputHooks.includes("queryClient.invalidateQueries({ queryKey: outputDocumentKeys.repository() })")),
  "Successful review must invalidate the repository query used by /documents");
// Access membership is server metadata, never uploader or project-name inference.
const grouped = buildRepositoryItems([
  { ...official, id: "native", canReadProject: true, accessMode: "RESTRICTED", isSharedWithMe: false },
  { ...official, id: "both", canReadProject: true, accessMode: "RESTRICTED", isSharedWithMe: true },
  { ...official, id: "granted", canReadProject: false, accessMode: "RESTRICTED", isSharedWithMe: true },
], [{ ...approved, canReadProject: false, accessMode: "SHARED_INTERNAL", isSharedWithMe: true }]);
const filtered = (accessGroup: "ALL" | "NATIVE") => filterRepositoryItems(grouped, { accessGroup, search: "", category: "ALL", status: "ALL" });
assert.equal(filtered("ALL").length,4);
assert.equal(filtered("NATIVE").length,2);
assert(filtered("ALL").some(item => item.sourceId === "granted"), "Individual grants remain in All accessible");
assert(filtered("ALL").some(item => item.sourceType === "OUTPUT"), "Internal shared results remain in All accessible");
assert.equal(buildRepositoryItems([official,official],[approved,approved]).length,2);
const sharedMany = buildRepositoryItems([], Array.from({ length: 45 },(_, index) => ({ ...output(`shared-${index}`,"APPROVED"), canReadProject:index < 23, isSharedWithMe:index >= 23 })));
const sharedScope = filterRepositoryItems(sharedMany,{ accessGroup:"NATIVE",search:"",category:"ALL",status:"ALL" });
assert.equal(sharedScope.length,23,"Whole-result counter precedes pagination");
assert.equal(paginateRepositoryItems(sharedScope,1).items.length,10);
assert.equal(paginateRepositoryItems(sharedScope,3).items.length,3);
for(const role of ["SALES","SA"]) assert.deepEqual(repositoryAccessGroups(role),["ALL","NATIVE"]);
for(const role of ["HEAD_SA","SUPER_ADMIN",undefined]) assert.deepEqual(repositoryAccessGroups(role),["ALL"]);
const empty={ data:[],isError:false };
assert.equal(repositoryLoadState(true,empty,empty),"ready");
assert.equal(repositoryLoadState(false,empty,empty),"loading");
assert.equal(repositoryLoadState(true,{ isError:false },empty),"loading");
assert.equal(repositoryLoadState(true,{ ...empty,isError:true },empty),"error");
assert.equal(repositoryLoadState(true,empty,{ ...empty,isError:true }),"error");
assert.throws(() => requireRepositoryArray(null as any));
assert.throws(() => requireRepositoryArray({ items:[] } as any));
assert.deepEqual(requireRepositoryArray([]),[]);

// Regression: Result evidence with a milestoneId must count only as Final Project Result, never double-counted as Pre-Tender.
const resultEvidenceDoc: DocumentItem = {
  ...official,
  id: "evidence-1",
  milestoneId: "tender-process-m",
  title: "Result evidence - WON",
  category: "OTHER",
};
const mixedProjectItems = buildRepositoryItems(
  [resultEvidenceDoc],
  [
    { ...output("pra-1", "APPROVED"), group: "PRA_TENDER" },
    { ...output("pra-2", "APPROVED"), group: "PRA_TENDER" },
    { ...output("pra-3", "APPROVED"), group: "PRA_TENDER" },
    { ...output("sub-1", "APPROVED"), group: "ON_SUBMISSION_TENDER" },
    { ...output("sub-2", "APPROVED"), group: "ON_SUBMISSION_TENDER" },
    { ...output("sub-3", "APPROVED"), group: "ON_SUBMISSION_TENDER" },
  ]
);
assert.equal(mixedProjectItems.length, 7);
assert.deepEqual(
  getProjectGroupStageCounts(mixedProjectItems),
  { praCount: 3, subCount: 3, outcomeCount: 1 },
  "Stage badge counts must sum cleanly without double-counting Result evidence with milestoneId into Pre-Tender"
);
assert.equal(
  filterRepositoryItems(mixedProjectItems, { search: "", category: "OFFICIAL_MILESTONE", status: "ALL" }).length,
  0,
  "Result evidence with milestoneId must not match OFFICIAL_MILESTONE"
);
assert.equal(
  filterRepositoryItems(mixedProjectItems, { search: "", category: "OFFICIAL_EVIDENCE", status: "ALL" }).length,
  1,
  "Result evidence with milestoneId must match OFFICIAL_EVIDENCE"
);

const summarySample = buildRepositoryItems(
  [
    { ...resultEvidenceDoc, id: "ev-1", accessMode: "RESTRICTED", canReadProject: true },
    { ...resultEvidenceDoc, id: "ev-2", accessMode: "SHARED_INTERNAL", canReadProject: false },
  ],
  [
    { ...output("pra-1", "APPROVED"), projectId: "p1", group: "PRA_TENDER", accessMode: "RESTRICTED", canReadProject: true },
    { ...output("pra-2", "APPROVED"), projectId: "p1", group: "PRA_TENDER", accessMode: "SHARED_INTERNAL", canReadProject: true },
    { ...output("pra-3", "APPROVED"), projectId: "p2", group: "PRA_TENDER", accessMode: "RESTRICTED", canReadProject: false },
    { ...output("sub-1", "APPROVED"), projectId: "p1", group: "ON_SUBMISSION_TENDER", accessMode: "RESTRICTED", canReadProject: true },
    { ...output("poc_demo_report", "APPROVED"), projectId: "p1", name: "POC / Demo Report", group: "ON_SUBMISSION_TENDER" },
    { ...output("poc_demo_report", "APPROVED"), projectId: "p2", name: "POC / Demo Report", group: "ON_SUBMISSION_TENDER" },
    { ...output("spesifikasi_teknis_toc", "APPROVED"), projectId: "p1", name: "Spesifikasi Teknis / TOC", group: "ON_SUBMISSION_TENDER" },
  ]
);
const summary = getRepositorySummaryCounts(summarySample);
assert.deepEqual(summary, {
  total: 9,
  outputDocuments: 7,
  finalProjectResults: 2,
  sharedInternal: 3,
});
assert.equal(summary.outputDocuments + summary.finalProjectResults, summary.total);

const withOtherSample = buildRepositoryItems(
  [
    { ...official, id: "m-other", milestoneId: "m1", category: "OTHER", title: "Other milestone doc" },
    { ...resultEvidenceDoc, id: "ev-only" },
  ],
  [
    { ...output("poc_demo_report", "APPROVED"), projectId: "p1", name: "POC / Demo Report", group: "ON_SUBMISSION_TENDER" },
    { ...output("poc_demo_report", "APPROVED"), projectId: "p2", name: "POC / Demo Report", group: "ON_SUBMISSION_TENDER" },
    { ...output("spesifikasi_teknis_toc", "APPROVED"), projectId: "p1", name: "Spesifikasi Teknis / TOC", group: "ON_SUBMISSION_TENDER" },
    { ...output("other", "APPROVED"), projectId: "p1", name: "Other", group: "PRA_TENDER" },
  ]
);
setActiveLanguage("en");
const categoryOptionsEn = buildRepositoryCategoryOptions(withOtherSample);
assert.equal(categoryOptionsEn[0].value, "ALL");
assert.equal(categoryOptionsEn[0].label, translate("documentPage.allOutputDocuments"));
assert.equal(new Set(categoryOptionsEn.map((o) => o.label.toLowerCase())).size, categoryOptionsEn.length, "Category labels must be deduplicated");
assert.equal(categoryOptionsEn.filter((o) => o.value === "poc_demo_report").length, 1);
assert.equal(categoryOptionsEn.filter((o) => o.value === "spesifikasi_teknis_toc").length, 1);
assert(!categoryOptionsEn.some((o) => o.value === "assessment"), "Unused categories must not appear");
assert.equal(categoryOptionsEn.at(-1)?.value, "other", "Other option must be placed last");

setActiveLanguage("id");
const categoryOptionsId = buildRepositoryCategoryOptions([
  { sourceType: "OUTPUT", sourceId: "p1:poc_demo_report", output: { ...output("poc_demo_report", "APPROVED"), name: "POC / Demo Report" } },
  { sourceType: "OUTPUT", sourceId: "p1:other", output: { ...output("other", "APPROVED"), name: "Lainnya" } },
]);
assert.equal(categoryOptionsId[0].label, translate("documentPage.allOutputDocuments"));
assert.equal(categoryOptionsId.at(-1)?.value, "other");
setActiveLanguage("en");

console.log("Combined repository: access categories, deduplication, whole-result counters, pagination and load/error state passed");
