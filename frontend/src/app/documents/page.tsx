"use client";
import { useRepositorySession } from '@/hooks/use-repository-session';
import { isCurrentSession } from "@/lib/auth";
import { authorizedFetch } from "@/lib/api-client";
import { useLanguage } from "@/components/i18n/language-provider";

import { translate as translateI18n, getIntlLocale, translateOutputStatus, translateOutputName, translateStoredError, type TranslationKey } from "@/i18n";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Download,
  FileText,
  FileUp,
  FolderArchive,
  Loader2,
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
import { REPOSITORY_PAGE_SIZE, buildRepositoryItems, filterRepositoryItems, paginateRepositoryItems, repositoryAccessGroups, repositoryLoadState, type RepositoryAccessGroup } from "@/lib/document-repository";
import { DocumentCategory, DocumentItem, DocumentStatus } from "@/types/document";

const rolePageCopy: Record<string, { eyebrow: TranslationKey; title: TranslationKey; description: TranslationKey }> = {
  SALES: {
    eyebrow: "documentPage.projectArchive",
    title: "documentPage.projectDocuments",
    description: "documentPage.salesDescription",
  },
  HEAD_SA: {
    eyebrow: "documentPage.projectArchive",
    title: "documentPage.projectDocuments",
    description: "documentPage.headDescription",
  },
  SA: {
    eyebrow: "documentPage.projectArchive",
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
  const keys: Record<DocumentCategory, TranslationKey> = {
    PROPOSAL: "documentCategory.proposal", ARCHITECTURE_DESIGN: "documentCategory.architecture",
    SIZING_SHEET: "documentCategory.sizing", MOM: "documentCategory.mom",
    ASSESSMENT_REPORT: "documentCategory.assessment", BOQ: "documentCategory.boq",
    DELIVERABLE: "documentCategory.deliverable", OTHER: "documentCategory.other",
  };
  return translateI18n(keys[category]);
}

export default function DocumentsPage() {
  const scope = useRepositorySession();
  // Reset private selections when the verified account/session changes, never on locale changes.
  return <DocumentsContent key={scope.key.join(":")} />;
}

function DocumentsContent() {
  const { locale } = useLanguage();
  const { user } = useAuth();
  const repositorySession = useRepositorySession();
  const pageCopy = rolePageCopy[user?.role || ""] || rolePageCopy.SUPER_ADMIN;
  const [archivePending, setArchivePending] = useState<string | null>(null);
  const deepLinkOpened = useRef(false);
  const [search, setSearch] = useState("");
  const [accessGroup, setAccessGroup] = useState<RepositoryAccessGroup>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | "OUTPUT" | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [selectedDocForVersion, setSelectedDocForVersion] = useState<DocumentItem | null>(null);
  const [isUploadVersionOpen, setIsUploadVersionOpen] = useState(false);
  const [selectedDocForDetail, setSelectedDocForDetail] = useState<DocumentItem | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const [pendingOutputFiles, setPendingOutputFiles] = useState<Set<string>>(new Set());

  const documentsQuery = useDocuments();
  const outputsQuery = useOutputRepository();
  const { data: documents = [], isError: documentsError } = documentsQuery;
  const { data: outputs = [] } = outputsQuery;
  const loadState = repositoryLoadState(repositorySession.enabled, documentsQuery, outputsQuery);
  const isLoading = loadState === "loading";
  const isError = loadState === "error";
  const accessGroups = repositoryAccessGroups(user?.role);
  const activeGroup = accessGroups.includes(accessGroup) ? accessGroup : "ALL";
  const accessLabel = (group: RepositoryAccessGroup): TranslationKey => group === "ALL" ? "documentPage.allAccessible"
    : user?.role === "SALES" ? "documentPage.myProjects" : "documentPage.assignedProjects";
  const outputDownload = useOutputRepositoryDownload();
  const allItems = useMemo(() => buildRepositoryItems(documents, outputs), [documents, outputs]);
  const selectedReadableDocument = !documentsError ? documents.find(document => document.id === selectedDocForDetail?.id) ?? null : null;
  useEffect(() => {
    if (deepLinkOpened.current) return;
    const params = new URLSearchParams(window.location.search);
    const source = params.get('source'); const id = params.get('id');
    const target = allItems.find(item => item.sourceType === source && (item.sourceType === 'OFFICIAL' ? item.document.id : item.output.outputId) === id);
    if (!target) return;
    deepLinkOpened.current = true;
    if (target.sourceType === 'OFFICIAL') setSelectedDocForDetail(target.document);
    else {
      setPage(Math.floor(allItems.indexOf(target) / REPOSITORY_PAGE_SIZE) + 1);
      window.requestAnimationFrame(() => window.document.getElementById(`repository-output-${id}`)?.scrollIntoView({ block: 'center' }));
    }
  }, [allItems]);
  const visibleItems = useMemo(() => filterRepositoryItems(allItems, {
    search, category: categoryFilter, status: statusFilter, accessGroup: activeGroup,
  }), [allItems, search, categoryFilter, statusFilter, activeGroup]);
  const paged = useMemo(() => paginateRepositoryItems(visibleItems, page), [visibleItems, page]);
  const documentDownload = useDocumentDownloadUrl();
  const snapshot = useMemo(
    () => [
      { label: translateI18n("documentPage.available"), value: visibleItems.length },
      { label: translateI18n("documentStatus.APPROVED"), value: visibleItems.filter((item) => item.sourceType === "OUTPUT" || item.document.status === "APPROVED").length },
      { label: translateI18n("documentPage.relatedMilestone"), value: visibleItems.filter((item) => item.sourceType === "OUTPUT" || Boolean(item.document.milestoneId)).length },
      { label: translateI18n("documentPage.projectOutputs"), value: visibleItems.filter((item) => item.sourceType === "OUTPUT").length },
    ],
    [visibleItems, locale]
  );
  const hasFilters = Boolean(search || categoryFilter !== "ALL" || statusFilter !== "ALL" || activeGroup !== "ALL");

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
      setDownloadError("documentPage.downloadFailed");
    }
  };

  const handleOutputDownload = async (item: OutputRepositoryItem, fileId: string) => {
    const pendingKey = `${item.projectId}:${item.documentKey}:${fileId}`;
    if (pendingOutputFiles.has(pendingKey)) return;
    setDownloadError("");
    setPendingOutputFiles((current) => new Set(current).add(pendingKey));
    try {
      const { url } = await outputDownload.mutateAsync({ projectId: item.projectId, documentKey: item.documentKey,
        fileId, versionId: item.approvedVersionId });
      const link = window.document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    } catch (error) {
      setDownloadError("documentPage.outputDownloadFailed");
    } finally {
      setPendingOutputFiles((current) => {
        const next = new Set(current);
        next.delete(pendingKey);
        return next;
      });
    }
  };

  const downloadArchive = async (item: OutputRepositoryItem) => {
    if (!item.outputId || archivePending) return;
    setArchivePending(item.outputId); setDownloadError('');
    try {
      const response = await authorizedFetch(`/documents/access/OUTPUT/${item.outputId}/archive`);
      if (!response.ok) throw new Error('Archive unavailable');
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement('a'); link.href = url; link.download = 'approved-output-files.zip'; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setDownloadError('documentPage.outputDownloadFailed'); }
    finally { setArchivePending(null); }
  };

  const resetFilters = () => {
    setSearch("");
    setAccessGroup("ALL");
    setCategoryFilter("ALL");
    setStatusFilter("ALL");
    setPage(1);
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6 sm:px-6 xl:px-8">
      <header className="border-b border-border/60 pb-5">
        <p className="text-xs font-semibold uppercase text-primary">{translateI18n(pageCopy.eyebrow)}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">{translateI18n(pageCopy.title)}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{translateI18n(pageCopy.description)}</p>
      </header>

      <section
        aria-label={translateI18n("documentPage.summary")}
        className="grid grid-cols-2 overflow-hidden page-surface xl:grid-cols-4"
      >
        {snapshot.map((item, index) => (
          <div
            key={item.label}
            className={`border-border/60 px-4 py-3.5 sm:px-5 ${
              index % 2 === 1 ? "border-l" : ""
            } ${index >= 2 ? "border-t" : ""} ${
              index > 0 ? "xl:border-l" : ""
            } xl:border-t-0`}
          >
            <p className="text-2xl font-semibold text-foreground">{loadState === "ready" ? item.value : "—"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden page-surface">
        <div className="space-y-4 border-b border-border/60 p-4 sm:p-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">{translateI18n("documentPage.allResults")}</h2>
            <p className="text-xs text-muted-foreground">
              {translateI18n("documentPage.resultsDescription")}
            </p>
          </div>
          <div role="tablist" aria-label={translateI18n("documentPage.accessCategory")} aria-orientation="horizontal"
            className={`grid min-w-0 gap-1 rounded-md bg-muted/30 p-1 ${accessGroups.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            {accessGroups.map((group, index) => <Button key={group} id={`repository-tab-${group}`} type="button" role="tab"
              aria-selected={activeGroup === group} aria-controls="repository-results" tabIndex={activeGroup === group ? 0 : -1}
              variant="ghost" className={`h-auto min-h-10 min-w-0 whitespace-normal break-words px-3 py-2 text-sm ${activeGroup === group ? "bg-primary-soft text-primary shadow-sm" : "text-muted-foreground"}`}
              onClick={() => { setAccessGroup(group); setPage(1); }}
              onKeyDown={event => {
                const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? accessGroups.length - 1
                  : event.key === "ArrowRight" ? (index + 1) % accessGroups.length
                  : event.key === "ArrowLeft" ? (index - 1 + accessGroups.length) % accessGroups.length : null;
                if (nextIndex === null) return;
                event.preventDefault();
                const next = accessGroups[nextIndex]; setAccessGroup(next); setPage(1);
                event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#repository-tab-${next}`)?.focus();
              }}>{translateI18n(accessLabel(group))}</Button>)}
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_180px_auto]">
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
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">{translateI18n("copy.allCategories")}</option>
              <option value="OUTPUT">{translateI18n("documents.output")}</option>
              <option value="PROPOSAL">{getCategoryLabel("PROPOSAL")}</option>
              <option value="ARCHITECTURE_DESIGN">{getCategoryLabel("ARCHITECTURE_DESIGN")}</option>
              <option value="SIZING_SHEET">{getCategoryLabel("SIZING_SHEET")}</option>
              <option value="MOM">{getCategoryLabel("MOM")}</option>
              <option value="ASSESSMENT_REPORT">{getCategoryLabel("ASSESSMENT_REPORT")}</option>
              <option value="BOQ">{getCategoryLabel("BOQ")}</option>
              <option value="DELIVERABLE">{translateI18n("copy.deliverables")}</option>
              <option value="OTHER">{translateI18n("copy.other")}</option>
            </select>
            <select
              aria-label={translateI18n("documentPage.filterStatus")}
              value={statusFilter}
              onChange={(event) =>
                { setStatusFilter(event.target.value as DocumentStatus | "ALL"); setPage(1); }
              }
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
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
              <span>{translateStoredError(downloadError)}</span>
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

        <div id="repository-results" role="tabpanel" aria-labelledby={`repository-tab-${activeGroup}`} tabIndex={0}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {!isLoading && !isError && visibleItems.length > 0 && (
          <div className="hidden grid-cols-[minmax(240px,1.7fr)_minmax(180px,1fr)_minmax(230px,1.3fr)_auto] gap-4 border-b border-border/60 px-5 py-2.5 text-[11px] font-semibold uppercase text-muted-foreground xl:grid">
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
            <Button className="mt-3" size="sm" variant="outline"
              disabled={!repositorySession.enabled || documentsQuery.isFetching || outputsQuery.isFetching}
              onClick={() => { if (repositorySession.enabled && repositorySession.session && isCurrentSession(repositorySession.session)) { void documentsQuery.refetch(); void outputsQuery.refetch(); } }}>
              {translateI18n("common.retry")}
            </Button>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <FolderArchive className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium text-foreground">{translateI18n("ui.documentNotFound")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {search || categoryFilter !== "ALL" || statusFilter !== "ALL"
                ? translateI18n("documentPage.expandFilters")
                : activeGroup === "NATIVE" ? translateI18n(user?.role === "SALES" ? "documentPage.noOwnedProjectResults" : "documentPage.noAssignedProjectResults")
                : translateI18n(user?.role === "SA" ? "documentPage.noAssignedResults" : user?.role === "SALES" ? "documentPage.noOwnedResults" : "documentPage.resultsAfterApproval")}
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
                pendingFiles={pendingOutputFiles}
                onArchive={() => void downloadArchive(item.output)} archivePending={archivePending === item.output.outputId}
                onDownload={(fileId) => void handleOutputDownload(item.output, fileId)} />
            ))}
          </div>
        )}
        </div>
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
      <DocumentCommentsDrawer key={repositorySession.key.join(":")}
        open={Boolean(selectedDocForDetail)}
        onOpenChange={(open) => {
          if (!open) setSelectedDocForDetail(null);
        }}
        document={selectedReadableDocument}
        canUploadVersion={Boolean(selectedReadableDocument?.canUploadVersion)}
        onUploadVersion={(document) => {
          setSelectedDocForVersion(document);
          setSelectedDocForDetail(null);
          setIsUploadVersionOpen(true);
        }}
      />
    </div>
  );
}

function OutputRepositoryRow({ item, pendingFiles, onDownload, onArchive, archivePending }: {
  item: OutputRepositoryItem;
  pendingFiles: ReadonlySet<string>;
  onDownload: (fileId: string) => void;
  onArchive: () => void; archivePending: boolean;
}) {
  return <div id={`repository-output-${item.outputId}`} className="grid gap-4 border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5 xl:grid-cols-[minmax(240px,1.7fr)_minmax(180px,1fr)_minmax(230px,1.3fr)_auto] xl:items-center">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{translateI18n("documents.output")}</Badge><Badge variant="success">{translateOutputStatus(item.status)}</Badge>{item.accessMode && <Badge variant="outline">{translateI18n(item.accessMode === "SHARED_INTERNAL" ? "documentAccess.shared" : "documentAccess.restricted")}</Badge>}</div>
      <h3 className="mt-2 break-words font-semibold text-foreground">{translateOutputName(item.documentKey, item.name)}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{translateI18n(item.group === "PRA_TENDER" ? "projectCreate.praTender" : "projectCreate.onSubmissionTender")}</p>
    </div>
    {item.canReadProject !== false ? <Link href={`/projects/${item.projectId}`} className="min-w-0 text-sm font-medium text-foreground hover:text-primary">
      <span className="break-words">{item.projectName}</span>
      <span className="block break-words text-xs font-normal text-muted-foreground">{item.customer}</span>
    </Link> : <p className="text-xs text-muted-foreground">{translateI18n("documentAccess.projectPrivate")}</p>}
    <div className="min-w-0">
      <p className="mb-1 text-xs text-muted-foreground">v{item.versionNumber}</p>
      <ul className="divide-y divide-border/40">
        {item.files.map((file) => {
          const pending = pendingFiles.has(`${item.projectId}:${item.documentKey}:${file.id}`);
          return <li key={file.id} className="flex min-w-0 items-center gap-2 py-1.5">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm text-foreground" title={file.fileName}>{file.fileName}</p>
              {typeof file.fileSize === "number" && <p className="text-xs text-muted-foreground">{(file.fileSize / 1024 / 1024).toLocaleString(getIntlLocale(), { maximumFractionDigits: 2 })} MB</p>}
            </div>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => onDownload(file.id)}
              aria-label={`${translateI18n("common.download")}: ${file.fileName}`}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              <span className="sr-only">{translateI18n("common.download")}</span>
            </Button>
          </li>;
        })}
      </ul>
    </div>
    <div className="flex flex-wrap gap-1 xl:justify-end">
      {item.canReadProject !== false && <Link href={`/projects/${item.projectId}#milestone-outputs-${item.milestoneId}`}><Button type="button" size="sm" variant="outline"><ArrowRight className="mr-1 h-3.5 w-3.5" />{translateI18n("project.open")}</Button></Link>}
      {item.outputId && <Button size="sm" variant="outline" disabled={archivePending} onClick={onArchive}>{translateI18n("documentAccess.downloadAll")}</Button>}
    </div>
  </div>;
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
    <div className="grid gap-4 border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5 xl:grid-cols-[minmax(240px,1.7fr)_minmax(180px,1fr)_minmax(230px,1.3fr)_auto] xl:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{translateI18n("ui.officialDocument")}</Badge>
          {document.accessMode && <Badge variant="outline">{translateI18n(document.accessMode === "SHARED_INTERNAL" ? "documentAccess.shared" : "documentAccess.restricted")}</Badge>}
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

      <div className="flex min-w-0 items-center justify-between gap-3 xl:block">
        <span className="text-[11px] font-medium text-muted-foreground xl:hidden">{translateI18n("nav.projects")}</span>
        {document.project ? (
          <Link
            href={`/projects/${document.project.id}`}
            className="min-w-0 text-right xl:text-left"
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

      <div className="flex flex-wrap justify-start gap-1 xl:justify-end">
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
          {document.canReadProject === false ? translateI18n("documentAccess.details") : translateI18n("documentPage.commentsCount", { count: document._count?.comments || 0 })}
        </Button>
        {document.canUploadVersion && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onUploadVersion}>
            <FileUp className="h-3.5 w-3.5" />
            {translateI18n("documentPage.newVersion")}
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
