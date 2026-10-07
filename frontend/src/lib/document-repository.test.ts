import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OutputRepositoryItem } from "@/hooks/use-output-documents";
import type { DocumentItem } from "@/types/document";
import { buildRepositoryItems, filterRepositoryItems, paginateRepositoryItems, repositoryAccessGroups, repositoryLoadState, requireRepositoryArray } from "./document-repository";

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
const last = paginateRepositoryItems(many, 3);
assert.equal(first.items.length, 20);
assert.equal(second.items.length, 20);
assert.equal(last.items.length, 4);
assert.equal(new Set([...first.items, ...second.items, ...last.items].map((item) => `${item.sourceType}:${item.sourceId}`)).size, many.length);
assert.equal(paginateRepositoryItems(many, 99).page, 3);
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
assert.equal(paginateRepositoryItems(sharedScope,1).items.length,20);
assert.equal(paginateRepositoryItems(sharedScope,2).items.length,3);
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
console.log("Combined repository: access categories, deduplication, whole-result counters, pagination and load/error state passed");
