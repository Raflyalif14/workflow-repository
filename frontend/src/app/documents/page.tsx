"use client";

import { translate as translateI18n, getIntlLocale, translateOutputStatus, type TranslationKey } from "@/i18n";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Download,
  FileText,
  FileUp,
  FolderArchive,
  MessageSquare,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { DocumentCommentsDrawer } from "@/components/documents/document-comments-drawer";
import { UploadVersionDialog } from "@/components/documents/upload-version-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDocumentDownloadUrl, useDocuments } from "@/hooks/use-documents";
import { OutputRepositoryItem, useOutputRepository, useOutputRepositoryDownload } from "@/hooks/use-output-documents";
import { buildRepositoryItems, filterRepositoryItems, paginateRepositoryItems } from "@/lib/document-repository";
import { formatHumanReadableLabel } from "@/lib/workflow-ux-helpers";
import { DocumentCategory, DocumentItem, DocumentStatus } from "@/types/document";

const rolePageCopy: Record<string, { eyebrow: TranslationKey; title: TranslationKey; description: TranslationKey }> = {
  SALES: {
    eyebrow: "documentPage.projectArchive",
    title: "documentPage.projectDocuments",
    description: "documentPage.salesDescription",
  },
  HEAD_SA: {
    eyebrow: "documentPage.workArchive",
    title: "documentPage.projectDocuments",
    description: "documentPage.headDescription",
  },
  SA: {
    eyebrow: "documentPage.saWorkspace",
    title: "documentPage.projectDocuments",
    description: "documentPage.saDescription",
  },
  SUPER_ADMIN: {
    eyebrow: "documentPage.documentArchive",
    title: "documentPage.repository",
    description: "documentPage.adminDescription",
  },
};

function getStatusBadge(status: DocumentStatus) {
  switch (status) {
    case "APPROVED":
      return <Badge variant="success">{translateI18n("approvalStatus.APPROVED")}</Badge>;
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return <Badge variant="warning">{translateI18n("documentStatus.SUBMITTED")}</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">{translateI18n("approvalStatus.REJECTED")}</Badge>;
    case "SUPERSEDED":
      return <Badge variant="outline">{translateI18n("documentStatus.SUPERSEDED")}</Badge>;
    default:
      return <Badge variant="outline">{translateI18n("documentStatus.DRAFT")}</Badge>;
  }
}

function getCategoryLabel(category: DocumentCategory) {
  switch (category) {
    case "MOM":
      return "MoM";
    case "BOQ":
      return "Bill of Quantity";
    default:
      return formatHumanReadableLabel(category);
  }
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const pageCopy = rolePageCopy[user?.role || ""] || rolePageCopy.SUPER_ADMIN;
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"REPOSITORY" | "WORKING">("REPOSITORY");
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | "OUTPUT" | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [selectedDocForVersion, setSelectedDocForVersion] = useState<DocumentItem | null>(null);
  const [isUploadVersionOpen, setIsUploadVersionOpen] = useState(false);
  const [selectedDocForDetail, setSelectedDocForDetail] = useState<DocumentItem | null>(null);
  const [downloadError, setDownloadError] = useState("");

  const { data: documents = [], isLoading: documentsLoading, isError: documentsError } = useDocuments();
  const { data: outputs = [], isLoading: outputsLoading, isError: outputsError } = useOutputRepository();
  const outputDownload = useOutputRepositoryDownload();
  const allItems = useMemo(() => buildRepositoryItems(documents, outputs), [documents, outputs]);
  const visibleItems = useMemo(() => filterRepositoryItems(allItems, {
    search, category: categoryFilter, status: statusFilter,
  }), [allItems, search, categoryFilter, statusFilter]);
  const paged = useMemo(() => paginateRepositoryItems(visibleItems, page), [visibleItems, page]);
  const isLoading = documentsLoading || outputsLoading;
  const isError = documentsError || outputsError;
  const documentDownload = useDocumentDownloadUrl();
  const snapshot = useMemo(
    () => [
      { label: translateI18n("documentPage.available"), value: visibleItems.length },
      { label: translateI18n("documentStatus.APPROVED"), value: visibleItems.filter((item) => item.sourceType === "OUTPUT" || item.document.status === "APPROVED").length },
      { label: translateI18n("documentPage.relatedMilestone"), value: visibleItems.filter((item) => item.sourceType === "OUTPUT" || Boolean(item.document.milestoneId)).length },
      { label: translateI18n("documentPage.projectOutputs"), value: visibleItems.filter((item) => item.sourceType === "OUTPUT").length },
    ],
    [visibleItems]
  );
  const hasFilters = Boolean(search || categoryFilter !== "ALL" || statusFilter !== "ALL");

  const handleDownload = async (versionId: string) => {
    setDownloadError("");
    try {
      const { url } = await documentDownload.mutateAsync(versionId);
      const link = window.document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : translateI18n("documentPage.downloadFailed")
      );
    }
  };

  const handleOutputDownload = async (item: OutputRepositoryItem) => {
    setDownloadError("");
    try {
      const { url } = await outputDownload.mutateAsync({ projectId: item.projectId, documentKey: item.documentKey });
      const link = window.document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : translateI18n("documentPage.outputDownloadFailed"));
    }
  };

  const resetFilters = () => {
    setSearch("");
    setCategoryFilter("ALL");
    setStatusFilter("ALL");
    setPage(1);
  };

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="border-b border-border/60 pb-5">
        <p className="text-xs font-semibold uppercase text-primary">{translateI18n(pageCopy.eyebrow)}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">{translateI18n(pageCopy.title)}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{translateI18n(pageCopy.description)}</p>
      </header>

      {(user?.role === "HEAD_SA" || user?.role === "SA") && <div role="tablist" aria-label={translateI18n("documentPage.collection")} className="flex gap-2 border-b border-border/60 pb-2">
        <Button role="tab" aria-selected={activeTab === "REPOSITORY"} variant={activeTab === "REPOSITORY" ? "secondary" : "ghost"} onClick={() => setActiveTab("REPOSITORY")}>{translateI18n("documentPage.allResults")}</Button>
        <Button role="tab" aria-selected={activeTab === "WORKING"} variant={activeTab === "WORKING" ? "secondary" : "ghost"} onClick={() => setActiveTab("WORKING")}>{translateI18n("documentPage.workingOutputs")}</Button>
      </div>}

      {activeTab === "REPOSITORY" ? (
      <>

      <section
        aria-label={translateI18n("documentPage.summary")}
        className="grid grid-cols-2 overflow-hidden rounded-lg border border-border/60 bg-card lg:grid-cols-4"
      >
        {snapshot.map((item, index) => (
          <div
            key={item.label}
            className={`border-border/60 px-4 py-3.5 sm:px-5 ${
              index % 2 === 1 ? "border-l" : ""
            } ${index >= 2 ? "border-t" : ""} ${
              index > 0 ? "lg:border-l" : ""
            } lg:border-t-0`}
          >
            <p className="text-2xl font-semibold text-foreground">{item.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-lg border border-border/60 bg-card">
        <div className="space-y-4 border-b border-border/60 p-4 sm:p-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">{translateI18n("documentPage.allResults")}</h2>
            <p className="text-xs text-muted-foreground">
              {translateI18n("documentPage.resultsDescription")}
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder={translateI18n("documentPage.searchTitle")}
                aria-label={translateI18n("documentPage.searchDocuments")}
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <select
              aria-label={translateI18n("documentPage.filterCategory")}
              value={categoryFilter}
              onChange={(event) =>
                { setCategoryFilter(event.target.value as DocumentCategory | "OUTPUT" | "ALL"); setPage(1); }
              }
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">{translateI18n("copy.allCategories")}</option>
              <option value="OUTPUT">{translateI18n("documents.output")}</option>
              <option value="PROPOSAL">Proposal</option>
              <option value="ARCHITECTURE_DESIGN">Architecture Design</option>
              <option value="SIZING_SHEET">Sizing Sheet</option>
              <option value="MOM">Minutes of Meeting</option>
              <option value="ASSESSMENT_REPORT">Assessment Report</option>
              <option value="BOQ">Bill of Quantity</option>
              <option value="DELIVERABLE">{translateI18n("copy.deliverables")}</option>
              <option value="OTHER">{translateI18n("copy.other")}</option>
            </select>
            <select
              aria-label={translateI18n("documentPage.filterStatus")}
              value={statusFilter}
              onChange={(event) =>
                { setStatusFilter(event.target.value as DocumentStatus | "ALL"); setPage(1); }
              }
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">{translateI18n("copy.allStatuses")}</option>
              <option value="APPROVED">{translateI18n("approvalStatus.APPROVED")}</option>
              <option value="SUBMITTED">{translateI18n("documentStatus.SUBMITTED")}</option>
              <option value="REJECTED">{translateI18n("approvalStatus.REJECTED")}</option>
              <option value="DRAFT">{translateI18n("documentStatus.DRAFT")}</option>
            </select>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 gap-1.5"
              disabled={!hasFilters}
              onClick={resetFilters}
            >
              <X className="h-3.5 w-3.5" />
              {translateI18n("documentPage.resetFilters")}
            </Button>
          </div>
          {downloadError && (
            <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive sm:flex-row sm:items-center sm:justify-between">
              <span>{downloadError}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 self-start px-2 sm:self-auto"
                onClick={() => setDownloadError("")}
              >
                {translateI18n("common.close")}
              </Button>
            </div>
          )}
        </div>

        {!isLoading && !isError && visibleItems.length > 0 && (
          <div className="hidden grid-cols-[minmax(240px,1.7fr)_minmax(180px,1fr)_minmax(230px,1.3fr)_auto] gap-4 border-b border-border/60 px-5 py-2.5 text-[11px] font-semibold uppercase text-muted-foreground lg:grid">
            <span>{translateI18n("nav.documents")}</span>
            <span>{translateI18n("nav.projects")}</span>
            <span>{translateI18n("ui.latestVersion")}</span>
            <span className="text-right">{translateI18n("common.actions")}</span>
          </div>
        )}

        {isLoading ? (
          <div>
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-28 animate-pulse border-t border-border/60 bg-muted/20 first:border-t-0" />
            ))}
          </div>
        ) : isError ? (
          <div className="px-5 py-14 text-center">
            <p className="font-medium text-destructive">{translateI18n("ui.documentLoadFailed")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{translateI18n("copy.refreshTryAgain")}</p>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <FolderArchive className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium text-foreground">{translateI18n("ui.documentNotFound")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasFilters
                ? translateI18n("documentPage.expandFilters")
                 : translateI18n("documentPage.resultsAfterApproval")}
            </p>
          </div>
        ) : (
          <div>
            {paged.items.map((item) => item.sourceType === "OFFICIAL" ? (
              <DocumentRow key={`official:${item.sourceId}`} document={item.document}
                downloadPending={documentDownload.isPending} onDownload={handleDownload}
                onOpenDetails={() => setSelectedDocForDetail(item.document)}
                onUploadVersion={() => { setSelectedDocForVersion(item.document); setIsUploadVersionOpen(true); }} />
            ) : (
              <OutputRepositoryRow key={`output:${item.sourceId}`} item={item.output}
                downloadPending={outputDownload.isPending && outputDownload.variables?.projectId === item.output.projectId && outputDownload.variables?.documentKey === item.output.documentKey}
                onDownload={() => void handleOutputDownload(item.output)} />
            ))}
          </div>
        )}
      </section>

      {!isLoading && !isError && visibleItems.length > 0 && <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label={translateI18n("documentPage.pagination")}>
        <span className="text-muted-foreground">{translateI18n("documentPage.pageOf", { page: paged.page, total: paged.totalPages })} · {translateI18n("documentPage.resultsCount", { count: visibleItems.length })}</span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)}>{translateI18n("documentPage.previous")}</Button>
          <Button type="button" size="sm" variant="outline" disabled={paged.page >= paged.totalPages} onClick={() => setPage(paged.page + 1)}>{translateI18n("documentPage.next")}</Button>
        </div>
      </nav>}

      <UploadVersionDialog
        open={isUploadVersionOpen}
        onOpenChange={setIsUploadVersionOpen}
        document={selectedDocForVersion}
      />
      <DocumentCommentsDrawer
        open={Boolean(selectedDocForDetail)}
        onOpenChange={(open) => {
          if (!open) setSelectedDocForDetail(null);
        }}
        document={selectedDocForDetail}
        canUploadVersion={Boolean(selectedDocForDetail?.canUploadVersion)}
        onUploadVersion={(document) => {
          setSelectedDocForVersion(document);
          setSelectedDocForDetail(null);
          setIsUploadVersionOpen(true);
        }}
      />
      </>
      ) : <OutputDocumentsTab outputs={outputs.filter((item) => item.status !== "APPROVED")} isLoading={outputsLoading} isError={outputsError} />}
    </div>
  );
}

function OutputRepositoryRow({ item, downloadPending, onDownload }: {
  item: OutputRepositoryItem;
  downloadPending: boolean;
  onDownload: () => void;
}) {
  return <div className="grid gap-4 border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5 lg:grid-cols-[minmax(240px,1.7fr)_minmax(180px,1fr)_minmax(230px,1.3fr)_auto] lg:items-center">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{translateI18n("documents.output")}</Badge><Badge variant="success">{translateOutputStatus(item.status)}</Badge></div>
      <h3 className="mt-2 break-words font-semibold text-foreground">{item.name}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{item.group === "PRA_TENDER" ? "Pra-Tender" : "On Submission Tender"}</p>
    </div>
    <Link href={`/projects/${item.projectId}`} className="min-w-0 text-sm font-medium text-foreground hover:text-primary">
      <span className="break-words">{item.projectName}</span>
      <span className="block break-words text-xs font-normal text-muted-foreground">{item.customer}</span>
    </Link>
    <div className="min-w-0"><p className="truncate text-sm font-medium text-foreground" title={item.fileName}><FileText className="mr-1 inline h-4 w-4 text-primary" />{item.fileName}</p><p className="mt-1 text-xs text-muted-foreground">v{item.versionNumber}</p></div>
    <div className="flex flex-wrap gap-1 lg:justify-end">
      <Button type="button" size="sm" variant="ghost" disabled={downloadPending} onClick={onDownload}><Download className="mr-1 h-3.5 w-3.5" />{translateI18n("common.download")}</Button>
      <Link href={`/projects/${item.projectId}#milestone-outputs-${item.milestoneId}`}><Button type="button" size="sm" variant="outline"><ArrowRight className="mr-1 h-3.5 w-3.5" />{translateI18n("project.open")}</Button></Link>
    </div>
  </div>;
}

function OutputDocumentsTab({ outputs, isLoading, isError }: { outputs: OutputRepositoryItem[]; isLoading: boolean; isError: boolean }) {
  const download = useOutputRepositoryDownload();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<"ALL" | OutputRepositoryItem["group"]>("ALL");
  const [status, setStatus] = useState<"ALL" | OutputRepositoryItem["status"]>("ALL");
  const [downloadError, setDownloadError] = useState("");
  const visible = useMemo(() => outputs.filter((item) => {
    const query = search.trim().toLocaleLowerCase();
    return (group === "ALL" || item.group === group)
      && (status === "ALL" || item.status === status)
      && (!query || `${item.name} ${item.projectName}`.toLocaleLowerCase().includes(query));
  }), [outputs, search, group, status]);

  const handleDownload = async (item: OutputRepositoryItem) => {
    setDownloadError("");
    try {
      const { url } = await download.mutateAsync({ projectId: item.projectId, documentKey: item.documentKey });
      const link = window.document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : translateI18n("documentPage.outputDownloadFailed"));
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border/60 bg-card">
      <div className="space-y-4 border-b border-border/60 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">{translateI18n("documents.output")}</h2>
          <p className="text-xs text-muted-foreground">{translateI18n("documentPage.workingDescription")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label={translateI18n("documentPage.searchOutputs")} placeholder={translateI18n("documentPage.searchOutputs")} value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
          </div>
          <select aria-label={translateI18n("documentPage.filterOutputGroup")} value={group} onChange={(event) => setGroup(event.target.value as typeof group)} className="h-10 min-w-0 rounded-md border border-border bg-background px-3 text-sm text-foreground">
            <option value="ALL">{translateI18n("copy.allGroups")}</option>
            <option value="PRA_TENDER">Pra-Tender</option>
            <option value="ON_SUBMISSION_TENDER">On Submission Tender</option>
          </select>
          <select aria-label={translateI18n("documentPage.filterOutputStatus")} value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-10 min-w-0 rounded-md border border-border bg-background px-3 text-sm text-foreground">
            <option value="ALL">{translateI18n("copy.allStatuses")}</option>
            <option value="DRAFT">{translateI18n("documentStatus.DRAFT")}</option>
            <option value="IN_REVIEW">{translateI18n("milestoneStatus.SUBMITTED")}</option>
            <option value="REVISION_REQUIRED">{translateI18n("milestoneStatus.REVISION_REQUIRED")}</option>
          </select>
        </div>
        {!isLoading && !isError && <p className="text-xs text-muted-foreground">{translateI18n("documentPage.outputAvailable", { visible: visible.length, total: outputs.length })}</p>}
        {downloadError && <p role="alert" className="text-xs text-destructive">{downloadError}</p>}
      </div>
      {isLoading ? (
        <div className="space-y-3 p-5" aria-label={translateI18n("ui.loadingOutputsAria")}><div className="h-16 animate-pulse rounded bg-muted/30" /><div className="h-16 animate-pulse rounded bg-muted/30" /></div>
      ) : isError ? (
        <p className="p-8 text-center text-sm text-destructive">{translateI18n("ui.outputLoadRetry")}</p>
      ) : visible.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">{translateI18n("copy.noMatchingOutputs")}</p>
      ) : (
        <div>
          {visible.map((item) => (
            <div key={`${item.projectId}-${item.documentKey}`} className="grid gap-3 border-t border-border/60 p-4 first:border-t-0 sm:p-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-foreground">{item.name}</p>
                <p className="mt-1 break-all text-xs text-muted-foreground">{item.fileName} | v{item.versionNumber}</p>
              </div>
              <p className="min-w-0 break-words text-xs text-muted-foreground">{item.group === "PRA_TENDER" ? "Pra-Tender" : "On Submission Tender"}</p>
              <div className="min-w-0">
                <p className="break-words text-sm text-foreground">{item.projectName}</p>
                <Badge variant={item.status === "APPROVED" ? "success" : item.status === "REVISION_REQUIRED" ? "destructive" : "warning"}>{translateOutputStatus(item.status)}</Badge>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Link href={`/projects/${item.projectId}#milestone-outputs-${item.milestoneId}`}><Button size="sm" variant="outline" className="gap-1.5"><ArrowRight className="h-3.5 w-3.5" />{translateI18n("project.open")}</Button></Link>
                <Button size="sm" variant="ghost" className="gap-1.5" disabled={download.isPending && download.variables?.projectId === item.projectId && download.variables?.documentKey === item.documentKey} onClick={() => void handleDownload(item)}><Download className="h-3.5 w-3.5" />{translateI18n("common.download")}</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DocumentRow({
  document,
  downloadPending,
  onDownload,
  onOpenDetails,
  onUploadVersion,
}: {
  document: DocumentItem;
  downloadPending: boolean;
  onDownload: (versionId: string) => Promise<void>;
  onOpenDetails: () => void;
  onUploadVersion: () => void;
}) {
  const latestVersion = document.versions?.[0];

  return (
    <div className="grid gap-4 border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5 lg:grid-cols-[minmax(240px,1.7fr)_minmax(180px,1fr)_minmax(230px,1.3fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{translateI18n("ui.officialDocument")}</Badge>
          <Badge variant="secondary">{getCategoryLabel(document.category)}</Badge>
          {getStatusBadge(document.status)}
        </div>
        <h3 className="mt-2 truncate font-semibold text-foreground" title={document.title}>
          <button
            type="button"
            className="max-w-full truncate text-left outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={onOpenDetails}
          >
            {document.title}
          </button>
        </h3>
        {document.milestone && (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {translateI18n("documentPage.stage", { number: document.milestone.orderIndex })} {document.milestone.name}
          </p>
        )}
      </div>

      <div className="flex min-w-0 items-center justify-between gap-3 lg:block">
        <span className="text-[11px] font-medium text-muted-foreground lg:hidden">{translateI18n("nav.projects")}</span>
        {document.project ? (
          <Link
            href={`/projects/${document.project.id}`}
            className="min-w-0 text-right lg:text-left"
          >
            <p className="truncate text-sm font-medium text-foreground hover:text-primary">
              {document.project.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {document.project.clientName}
            </p>
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">{translateI18n("ui.projectUnavailable")}</p>
        )}
      </div>

      <div className="min-w-0">
        {latestVersion ? (
          <>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <p className="truncate text-sm font-medium text-foreground" title={latestVersion.fileName}>
                {latestVersion.fileName}
              </p>
              <Badge variant="outline">v{latestVersion.versionNumber}</Badge>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {(latestVersion.fileSize / 1024 / 1024).toFixed(2)} MB |{" "}
              {latestVersion.uploadedBy?.fullName || translateI18n("documentPage.unknownUploader")} |{" "}
              {new Date(latestVersion.createdAt).toLocaleDateString(getIntlLocale(), {
                dateStyle: "medium",
              })}
            </p>
            {latestVersion.changelog && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {latestVersion.changelog}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{translateI18n("ui.noVersions")}</p>
        )}
      </div>

      <div className="flex flex-wrap justify-start gap-1 lg:justify-end">
        {latestVersion && (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5"
            onClick={() => void onDownload(latestVersion.id)}
            disabled={downloadPending}
          >
            <Download className="h-3.5 w-3.5" />
            {translateI18n("common.download")}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={onOpenDetails}>
          <MessageSquare className="h-3.5 w-3.5" />
          {document._count?.comments || 0} komentar
        </Button>
        {document.canUploadVersion && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onUploadVersion}>
            <FileUp className="h-3.5 w-3.5" />
            Versi baru
          </Button>
        )}
        {document.project && (
          <Link href={`/projects/${document.project.id}`}>
            <Button size="icon" variant="ghost" title={translateI18n("project.open")}>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
