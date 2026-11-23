"use client";
import { ListPagination } from "@/components/list-pagination";
import { useRepositorySession } from '@/hooks/use-repository-session';
import { isCurrentSession } from "@/lib/auth";
import { authorizedFetch } from "@/lib/api-client";
import { useLanguage } from "@/components/i18n/language-provider";

import { translate as translateI18n, translateStoredError, type TranslationKey } from "@/i18n";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, Files, FolderArchive, Link2, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ListSummary } from '@/components/list-summary';
import { DocumentRow, OutputRepositoryRow } from "@/components/documents/document-repository-rows";
import { DocumentPreviewDialog } from "@/components/documents/document-preview-dialog";
import { downloadFileFromUrl } from "@/lib/file-download";
import { formatDocumentCategory } from "@/lib/document-surface-ux";
import { useAuth } from "@/components/auth/auth-provider";
import { DocumentCommentsDrawer } from "@/components/documents/document-comments-drawer";
import { UploadVersionDialog } from "@/components/documents/upload-version-dialog";
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

const OUTPUT_DOCUMENT_OPTIONS = [
  { value: "ALL", labelKey: "documentPage.allOutputDocuments" },
  { value: "proposal_teknis", labelKey: "scenarioDocs.proposalTeknis" },
  { value: "proposal_deck_solusi", labelKey: "scenarioDocs.proposalDeckSolusi" },
  { value: "identitas_barang_produk", labelKey: "scenarioDocs.identitasBarang" },
  { value: "timeline_proyek", labelKey: "scenarioDocs.timelineProyek" },
  { value: "spesifikasi_teknis", labelKey: "scenarioDocs.spesifikasiTeknis" },
  { value: "rab", labelKey: "scenarioDocs.rab" },
  { value: "metodologi_implementasi", labelKey: "scenarioDocs.metodologiImplementasi" },
  { value: "arsitektur_sistem", labelKey: "scenarioDocs.arsitekturSistem" },
  { value: "assessment", labelKey: "scenarioDocs.assessment" },
  { value: "kak_rfp", labelKey: "scenarioDocs.kakRfp" },
  { value: "poc_demo", labelKey: "scenarioDocs.pocDemo" },
  { value: "rencana_distribusi", labelKey: "scenarioDocs.rencanaDistribusi" },
  { value: "kajian_kebutuhan", labelKey: "scenarioDocs.kajianKebutuhan" },
  { value: "OFFICIAL_EVIDENCE", labelKey: "documentPage.tenderEvidence" },
  { value: "OFFICIAL_MILESTONE", labelKey: "documentPage.milestoneDoc" },
  { value: "OTHER", labelKey: "copy.other" },
] as const;

export default function DocumentsPage() {
  const scope = useRepositorySession();
  // Reset private selections when the verified account/session changes, never on locale changes.
  return <DocumentsContent key={scope.key.join(":")} />;
}

function DocumentsContent() {
  useLanguage();
  const { user } = useAuth();
  const repositorySession = useRepositorySession();
  const pageCopy = rolePageCopy[user?.role || ""] || rolePageCopy.SUPER_ADMIN;
  const [archivePending, setArchivePending] = useState<string | null>(null);
  const deepLinkOpened = useRef(false);
  const [search, setSearch] = useState("");
  const [accessGroup, setAccessGroup] = useState<RepositoryAccessGroup>("ALL");
  const [stageFilter, setStageFilter] = useState<"ALL" | "PRA_TENDER" | "ON_SUBMISSION_TENDER">("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [selectedDocForVersion, setSelectedDocForVersion] = useState<DocumentItem | null>(null);
  const [isUploadVersionOpen, setIsUploadVersionOpen] = useState(false);
  const [selectedDocForDetail, setSelectedDocForDetail] = useState<DocumentItem | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const [pendingOutputFiles, setPendingOutputFiles] = useState<Set<string>>(new Set());
  const [previewDoc, setPreviewDoc] = useState<{
    open: boolean;
    fileName: string;
    fileSize?: number | null;
    fileUrl?: string | null;
    mimeType?: string | null;
    isLoading?: boolean;
    versionNumber?: number | null;
    uploadedByName?: string | null;
    uploadedAt?: string | null;
    status?: string | null;
  }>({ open: false, fileName: "" });

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
  const availableOutputOptions = useMemo(() => {
    const predefinedKeys = new Set(OUTPUT_DOCUMENT_OPTIONS.map((opt) => opt.value as string));
    const extra: Array<{ value: string; label: string }> = [];

    for (const item of allItems) {
      if (item.sourceType === "OUTPUT" && item.output.documentKey) {
        if (!predefinedKeys.has(item.output.documentKey)) {
          predefinedKeys.add(item.output.documentKey);
          extra.push({
            value: item.output.documentKey,
            label: item.output.name || item.output.documentKey,
          });
        }
      }
    }
    return extra;
  }, [allItems]);
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
    search, category: categoryFilter, status: statusFilter, accessGroup: activeGroup, stageGroup: stageFilter,
  }), [allItems, search, categoryFilter, statusFilter, activeGroup, stageFilter]);
  const paged = useMemo(() => paginateRepositoryItems(visibleItems, page), [visibleItems, page]);
  const documentDownload = useDocumentDownloadUrl();
  const snapshot = [
    { label: translateI18n("listSummary.documentTotal"), value: visibleItems.length, scope: translateI18n('listSummary.scopeAllDocs'), icon: FolderArchive, primary: true },
    { label: translateI18n("listSummary.documentApproved"), value: visibleItems.filter((item) => item.sourceType === "OUTPUT" || item.document.status === "APPROVED").length, scope: translateI18n('listSummary.scopeApproved'), icon: CheckCircle2 },
    { label: translateI18n("listSummary.documentLinked"), value: visibleItems.filter((item) => item.sourceType === "OUTPUT" || Boolean(item.document.milestoneId)).length, scope: translateI18n('listSummary.scopeLinked'), icon: Link2 },
    { label: translateI18n("listSummary.documentOutputs"), value: visibleItems.filter((item) => item.sourceType === "OUTPUT").length, scope: translateI18n('listSummary.scopeDocOutputs'), icon: Files },
  ];
  const hasFilters = Boolean(search || stageFilter !== "ALL" || categoryFilter !== "ALL" || statusFilter !== "ALL" || activeGroup !== "ALL");

  const projectGroups = useMemo(() => {
    const groups: Array<{
      projectId: string;
      projectName: string;
      customer: string;
      canReadProject: boolean;
      items: typeof paged.items;
    }> = [];
    const map = new Map<string, (typeof groups)[number]>();

    for (const item of paged.items) {
      const isOfficial = item.sourceType === "OFFICIAL";
      const projectId = isOfficial
        ? (item.document.project?.id || item.document.projectId || "standalone")
        : (item.output.projectId || "standalone");
      const projectName = isOfficial
        ? (item.document.project?.name || translateI18n("documentPage.standaloneProject"))
        : (item.output.projectName || translateI18n("documentPage.standaloneProject"));
      const customer = isOfficial
        ? (item.document.project?.clientName || "")
        : (item.output.customer || "");
      const canReadProject = isOfficial
        ? item.document.canReadProject !== false
        : item.output.canReadProject !== false;

      let group = map.get(projectId);
      if (!group) {
        group = { projectId, projectName, customer, canReadProject, items: [] };
        map.set(projectId, group);
        groups.push(group);
      }
      group.items.push(item);
    }
    return groups;
  }, [paged]);

  const handleDownload = async (versionId: string, fileName?: string) => {
    setDownloadError("");
    try {
      const { url } = await documentDownload.mutateAsync(versionId);
      await downloadFileFromUrl(url, fileName);
    } catch (error) {
      setDownloadError("documentPage.downloadFailed");
    }
  };

  const handleOutputDownload = async (item: OutputRepositoryItem, fileId: string, fileName?: string) => {
    const pendingKey = `${item.projectId}:${item.documentKey}:${fileId}`;
    if (pendingOutputFiles.has(pendingKey)) return;
    setDownloadError("");
    setPendingOutputFiles((current) => new Set(current).add(pendingKey));
    try {
      const { url } = await outputDownload.mutateAsync({
        projectId: item.projectId, documentKey: item.documentKey,
        fileId, versionId: item.approvedVersionId
      });
      await downloadFileFromUrl(url, fileName);
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

  const handlePreviewOfficial = async (doc: DocumentItem) => {
    const latestVersion = doc.versions?.[0];
    if (!latestVersion) return;
    setPreviewDoc({
      open: true,
      fileName: latestVersion.fileName || doc.title,
      fileSize: latestVersion.fileSize,
      mimeType: latestVersion.mimeType,
      versionNumber: latestVersion.versionNumber,
      uploadedByName: latestVersion.uploadedBy?.fullName,
      uploadedAt: latestVersion.createdAt,
      status: doc.status,
      isLoading: true,
    });
    try {
      const { url } = await documentDownload.mutateAsync(latestVersion.id);
      setPreviewDoc((prev) => ({ ...prev, fileUrl: url, isLoading: false }));
    } catch {
      setPreviewDoc((prev) => ({ ...prev, isLoading: false, open: false }));
      setDownloadError("documentPage.downloadFailed");
    }
  };

  const handlePreviewOutput = async (
    item: OutputRepositoryItem,
    file: { id: string; fileName: string; fileSize?: number | null; mimeType?: string | null; uploadedAt?: string | null }
  ) => {
    setPreviewDoc({
      open: true,
      fileName: file.fileName,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
      versionNumber: item.versionNumber,
      uploadedByName: null,
      uploadedAt: file.uploadedAt || null,
      status: item.status,
      isLoading: true,
    });
    try {
      const { url } = await outputDownload.mutateAsync({
        projectId: item.projectId,
        documentKey: item.documentKey,
        fileId: file.id,
        versionId: item.approvedVersionId,
      });
      setPreviewDoc((prev) => ({ ...prev, fileUrl: url, isLoading: false }));
    } catch {
      setPreviewDoc((prev) => ({ ...prev, isLoading: false, open: false }));
      setDownloadError("documentPage.outputDownloadFailed");
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
    setStageFilter("ALL");
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

      <ListSummary aria-label={translateI18n('documentPage.summary')} description={translateI18n('listSummary.documentHelp')}
        items={snapshot} loading={loadState !== 'ready' && !isError} hasError={isError}
        refreshing={documentsQuery.isFetching || outputsQuery.isFetching} />

      <section className="overflow-hidden page-surface">
        <div className="space-y-4 border-b border-border/60 p-4 sm:p-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">{translateI18n("documentPage.allResults")}</h2>
            <p className="text-xs text-muted-foreground">
              {translateI18n("documentPage.resultsDescription")}
            </p>
          </div>
          <div role="tablist" aria-label={translateI18n("documentPage.accessCategory")} aria-orientation="horizontal"
            className={`flex min-w-0 gap-1 rounded-md bg-muted/30 p-1 ${accessGroups.length === 2 ? "w-full grid grid-cols-2 sm:w-auto sm:inline-flex" : "w-fit"}`}>
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_200px_220px_auto]">
            <div className="relative sm:col-span-2 lg:col-span-1">
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
              aria-label={translateI18n("documentPage.filterStage")}
              value={stageFilter}
              onChange={(event) => {
                setStageFilter(event.target.value as "ALL" | "PRA_TENDER" | "ON_SUBMISSION_TENDER");
                setPage(1);
              }}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">{translateI18n("documentPage.allStages")}</option>
              <option value="PRA_TENDER">{translateI18n("documentPage.praTenderStage")}</option>
              <option value="ON_SUBMISSION_TENDER">{translateI18n("documentPage.submissionStage")}</option>
            </select>
            <select
              aria-label={translateI18n("documentPage.filterCategory")}
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {OUTPUT_DOCUMENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {translateI18n(opt.labelKey as any)}
                </option>
              ))}
              {availableOutputOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-10 gap-1.5 self-center"
                onClick={resetFilters}
              >
                <X className="h-3.5 w-3.5" />
                {translateI18n("documentPage.resetFilters")}
              </Button>
            )}
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
                {search || stageFilter !== "ALL" || categoryFilter !== "ALL" || statusFilter !== "ALL"
                  ? translateI18n("documentPage.expandFilters")
                  : activeGroup === "NATIVE" ? translateI18n(user?.role === "SALES" ? "documentPage.noOwnedProjectResults" : "documentPage.noAssignedProjectResults")
                    : translateI18n(user?.role === "SA" ? "documentPage.noAssignedResults" : user?.role === "SALES" ? "documentPage.noOwnedResults" : "documentPage.resultsAfterApproval")}
              </p>
            </div>
          ) : (
            <div className="space-y-4 p-4 sm:p-5">
              {projectGroups.map((group) => (
                <div
                  key={group.projectId}
                  className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                >
                  {(() => {
                    const praCount = group.items.filter((item) =>
                      item.sourceType === "OUTPUT"
                        ? item.output.group === "PRA_TENDER"
                        : Boolean(item.document.milestoneId)
                    ).length;
                    const subCount = group.items.filter((item) =>
                      item.sourceType === "OUTPUT"
                        ? item.output.group === "ON_SUBMISSION_TENDER"
                        : false
                    ).length;
                    const outcomeCount = group.items.filter((item) =>
                      item.sourceType === "OFFICIAL"
                        ? item.document.title.toLowerCase().startsWith("result evidence") || !item.document.milestoneId
                        : false
                    ).length;

                    return (
                      <div className="flex flex-col gap-2.5 border-b border-border/60 bg-muted/30 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Building2 className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                                {translateI18n("copy.projectLabel")}
                              </span>
                              <h3 className="break-words font-semibold text-foreground text-sm sm:text-base">
                                {group.projectName}
                              </h3>
                              <Badge variant="secondary" className="text-[11px] font-medium">
                                {translateI18n("documentPage.documentCount", { count: group.items.length })}
                              </Badge>
                              {praCount > 0 && (
                                <Badge variant="outline" className="hidden sm:inline-flex text-[10px] text-muted-foreground bg-background/60">
                                  {praCount} {translateI18n("projectCreate.praTender")}
                                </Badge>
                              )}
                              {subCount > 0 && (
                                <Badge variant="outline" className="hidden sm:inline-flex text-[10px] text-muted-foreground bg-background/60">
                                  {subCount} {translateI18n("projectCreate.onSubmissionTender")}
                                </Badge>
                              )}
                              {outcomeCount > 0 && (
                                <Badge variant="outline" className="hidden sm:inline-flex text-[10px] text-purple-700 dark:text-purple-300 border-purple-500/20 bg-purple-500/10">
                                  {outcomeCount} {translateI18n("documentPage.outcomeStage")}
                                </Badge>
                              )}
                            </div>
                            {group.customer && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                <span className="font-medium text-foreground/80">{translateI18n("project.customer")}:</span> {group.customer}
                              </p>
                            )}
                          </div>
                        </div>

                        {group.projectId !== "standalone" && group.canReadProject && (
                          <Link
                            href={`/projects/${group.projectId}`}
                            className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary-soft hover:text-primary transition-colors shrink-0 shadow-2xs"
                          >
                            <span>{translateI18n("project.open")}</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </div>
                    );
                  })()}

                  <div className="divide-y divide-border/60">
                    {group.items.map((item) => item.sourceType === "OFFICIAL" ? (
                      <DocumentRow
                        key={`official:${item.sourceId}`}
                        document={item.document}
                        downloadPending={documentDownload.isPending}
                        onDownload={(vId, fileName) => handleDownload(vId, fileName)}
                        onPreview={() => void handlePreviewOfficial(item.document)}
                        onOpenDetails={() => setSelectedDocForDetail(item.document)}
                        onUploadVersion={() => { setSelectedDocForVersion(item.document); setIsUploadVersionOpen(true); }}
                      />
                    ) : (
                      <OutputRepositoryRow
                        key={`output:${item.sourceId}`}
                        item={item.output}
                        pendingFiles={pendingOutputFiles}
                        onArchive={() => void downloadArchive(item.output)}
                        archivePending={archivePending === item.output.outputId}
                        onPreview={(file) => void handlePreviewOutput(item.output, file)}
                        onDownload={(fileId, fileName) => void handleOutputDownload(item.output, fileId, fileName)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {!isLoading && !isError && <ListPagination page={paged.page} pages={paged.totalPages} total={visibleItems.length} pageSize={REPOSITORY_PAGE_SIZE} onPageChange={setPage} />}


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
      <DocumentPreviewDialog
        open={previewDoc.open}
        onOpenChange={(open) => setPreviewDoc((prev) => ({ ...prev, open }))}
        fileName={previewDoc.fileName}
        fileSize={previewDoc.fileSize}
        fileUrl={previewDoc.fileUrl}
        mimeType={previewDoc.mimeType}
        isLoading={previewDoc.isLoading}
        versionNumber={previewDoc.versionNumber}
        uploadedByName={previewDoc.uploadedByName}
        uploadedAt={previewDoc.uploadedAt}
        status={previewDoc.status}
        onDownload={previewDoc.fileUrl ? () => void downloadFileFromUrl(previewDoc.fileUrl!, previewDoc.fileName) : undefined}
      />
    </div>
  );
}
