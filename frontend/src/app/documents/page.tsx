"use client";

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
import { formatHumanReadableLabel } from "@/lib/workflow-ux-helpers";
import { DocumentCategory, DocumentItem, DocumentStatus } from "@/types/document";

const rolePageCopy: Record<string, { eyebrow: string; title: string; description: string }> = {
  SALES: {
    eyebrow: "Project records",
    title: "Project documents",
    description: "Find approved project files and customer delivery records.",
  },
  HEAD_SA: {
    eyebrow: "Delivery records",
    title: "Review documents",
    description: "Browse official deliverables, versions, and project discussions.",
  },
  SA: {
    eyebrow: "Delivery workspace",
    title: "Delivery documents",
    description: "Access the official files available across your assigned work.",
  },
  SUPER_ADMIN: {
    eyebrow: "Repository oversight",
    title: "Document repository",
    description: "Inspect official project documents and their complete version history.",
  },
};

function getStatusBadge(status: DocumentStatus) {
  switch (status) {
    case "APPROVED":
      return <Badge variant="success">Approved</Badge>;
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return <Badge variant="warning">Submitted</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">Rejected</Badge>;
    case "SUPERSEDED":
      return <Badge variant="outline">Superseded</Badge>;
    default:
      return <Badge variant="outline">Draft</Badge>;
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
  const [activeTab, setActiveTab] = useState<"OFFICIAL" | "OUTPUT">("OFFICIAL");
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "ALL">("ALL");
  const [selectedDocForVersion, setSelectedDocForVersion] = useState<DocumentItem | null>(null);
  const [isUploadVersionOpen, setIsUploadVersionOpen] = useState(false);
  const [selectedDocForDetail, setSelectedDocForDetail] = useState<DocumentItem | null>(null);
  const [downloadError, setDownloadError] = useState("");

  const { data: documents = [], isLoading, isError } = useDocuments({
    search,
    category: categoryFilter,
    status: statusFilter,
  });
  const documentDownload = useDocumentDownloadUrl();
  const snapshot = useMemo(
    () => [
      { label: "Visible documents", value: documents.length },
      { label: "Approved", value: documents.filter((item) => item.status === "APPROVED").length },
      { label: "Milestone linked", value: documents.filter((item) => Boolean(item.milestoneId)).length },
      {
        label: "Document versions",
        value: documents.reduce(
          (total, item) => total + (item._count?.versions ?? item.versions?.length ?? 0),
          0
        ),
      },
    ],
    [documents]
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
        error instanceof Error ? error.message : "Failed to download document."
      );
    }
  };

  const resetFilters = () => {
    setSearch("");
    setCategoryFilter("ALL");
    setStatusFilter("ALL");
  };

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="border-b border-border/60 pb-5">
        <p className="text-xs font-semibold uppercase text-primary">{pageCopy.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">{pageCopy.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{pageCopy.description}</p>
      </header>

      <div role="tablist" aria-label="Document collections" className="flex gap-2 border-b border-border/60 pb-2">
        <Button role="tab" aria-selected={activeTab === "OFFICIAL"} variant={activeTab === "OFFICIAL" ? "secondary" : "ghost"} onClick={() => setActiveTab("OFFICIAL")}>Official documents</Button>
        <Button role="tab" aria-selected={activeTab === "OUTPUT"} variant={activeTab === "OUTPUT" ? "secondary" : "ghost"} onClick={() => setActiveTab("OUTPUT")}>Output dokumen</Button>
      </div>

      {activeTab === "OFFICIAL" ? (
      <>

      <section
        aria-label="Document snapshot"
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
            <h2 className="text-base font-semibold text-foreground">Official documents</h2>
            <p className="text-xs text-muted-foreground">
              Repository files remain separate from Project Intake and pending submissions.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search document title"
                aria-label="Search documents"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
            <select
              aria-label="Filter documents by category"
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.target.value as DocumentCategory | "ALL")
              }
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">All categories</option>
              <option value="PROPOSAL">Proposal</option>
              <option value="ARCHITECTURE_DESIGN">Architecture Design</option>
              <option value="SIZING_SHEET">Sizing Sheet</option>
              <option value="MOM">Minutes of Meeting</option>
              <option value="ASSESSMENT_REPORT">Assessment Report</option>
              <option value="BOQ">Bill of Quantity</option>
              <option value="DELIVERABLE">Deliverables</option>
              <option value="OTHER">Other</option>
            </select>
            <select
              aria-label="Filter documents by status"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as DocumentStatus | "ALL")
              }
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">All statuses</option>
              <option value="APPROVED">Approved</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="REJECTED">Rejected</option>
              <option value="DRAFT">Draft</option>
            </select>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 gap-1.5"
              disabled={!hasFilters}
              onClick={resetFilters}
            >
              <X className="h-3.5 w-3.5" />
              Reset
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
                Dismiss
              </Button>
            </div>
          )}
        </div>

        {!isLoading && !isError && documents.length > 0 && (
          <div className="hidden grid-cols-[minmax(240px,1.7fr)_minmax(180px,1fr)_minmax(230px,1.3fr)_auto] gap-4 border-b border-border/60 px-5 py-2.5 text-[11px] font-semibold uppercase text-muted-foreground lg:grid">
            <span>Document</span>
            <span>Project</span>
            <span>Latest version</span>
            <span className="text-right">Actions</span>
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
            <p className="font-medium text-destructive">Unable to load documents.</p>
            <p className="mt-1 text-xs text-muted-foreground">Refresh the page and try again.</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <FolderArchive className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium text-foreground">No documents found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasFilters
                ? "Adjust the current filters to broaden the results."
                : "Official documents will appear after a governed workflow publishes them."}
            </p>
          </div>
        ) : (
          <div>
            {documents.map((document) => (
              <DocumentRow
                key={document.id}
                document={document}
                downloadPending={documentDownload.isPending}
                onDownload={handleDownload}
                onOpenDetails={() => setSelectedDocForDetail(document)}
                onUploadVersion={() => {
                  setSelectedDocForVersion(document);
                  setIsUploadVersionOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </section>

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
        canUploadVersion
        onUploadVersion={(document) => {
          setSelectedDocForVersion(document);
          setSelectedDocForDetail(null);
          setIsUploadVersionOpen(true);
        }}
      />
      </>
      ) : <OutputDocumentsTab />}
    </div>
  );
}

function OutputDocumentsTab() {
  const { data: outputs = [], isLoading, isError } = useOutputRepository();
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
      setDownloadError(error instanceof Error ? error.message : "Failed to download output document.");
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border/60 bg-card">
      <div className="space-y-4 border-b border-border/60 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Output dokumen</h2>
          <p className="text-xs text-muted-foreground">Project outputs remain separate from official repository documents.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search output or project" placeholder="Search output or project" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
          </div>
          <select aria-label="Filter output group" value={group} onChange={(event) => setGroup(event.target.value as typeof group)} className="h-10 min-w-0 rounded-md border border-border bg-background px-3 text-sm text-foreground">
            <option value="ALL">All groups</option>
            <option value="PRA_TENDER">Pra-Tender</option>
            <option value="ON_SUBMISSION_TENDER">On Submission Tender</option>
          </select>
          <select aria-label="Filter output status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-10 min-w-0 rounded-md border border-border bg-background px-3 text-sm text-foreground">
            <option value="ALL">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="IN_REVIEW">In review</option>
            <option value="REVISION_REQUIRED">Revision required</option>
            <option value="APPROVED">Approved</option>
          </select>
        </div>
        {!isLoading && !isError && <p className="text-xs text-muted-foreground">{visible.length} shown of {outputs.length} accessible output files</p>}
        {downloadError && <p role="alert" className="text-xs text-destructive">{downloadError}</p>}
      </div>
      {isLoading ? (
        <div className="space-y-3 p-5" aria-label="Loading output documents"><div className="h-16 animate-pulse rounded bg-muted/30" /><div className="h-16 animate-pulse rounded bg-muted/30" /></div>
      ) : isError ? (
        <p className="p-8 text-center text-sm text-destructive">Unable to load output documents. Refresh and try again.</p>
      ) : visible.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">No output files match this view.</p>
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
                <Badge variant={item.status === "APPROVED" ? "success" : item.status === "REVISION_REQUIRED" ? "destructive" : "warning"}>{formatHumanReadableLabel(item.status)}</Badge>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Link href={`/projects/${item.projectId}#output-documents`}><Button size="sm" variant="outline" className="gap-1.5"><ArrowRight className="h-3.5 w-3.5" />Buka proyek</Button></Link>
                <Button size="sm" variant="ghost" className="gap-1.5" disabled={download.isPending && download.variables?.projectId === item.projectId && download.variables?.documentKey === item.documentKey} onClick={() => void handleDownload(item)}><Download className="h-3.5 w-3.5" />Download</Button>
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
          <Badge variant="outline">Official document</Badge>
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
            Stage {document.milestone.orderIndex}: {document.milestone.name}
          </p>
        )}
      </div>

      <div className="flex min-w-0 items-center justify-between gap-3 lg:block">
        <span className="text-[11px] font-medium text-muted-foreground lg:hidden">Project</span>
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
          <p className="text-sm text-muted-foreground">Project unavailable</p>
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
              {latestVersion.uploadedBy?.fullName || "Unknown uploader"} |{" "}
              {new Date(latestVersion.createdAt).toLocaleDateString("id-ID", {
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
          <p className="text-sm text-muted-foreground">No version available</p>
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
            Download
          </Button>
        )}
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={onOpenDetails}>
          <MessageSquare className="h-3.5 w-3.5" />
          {document._count?.comments || 0} comments
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onUploadVersion}>
          <FileUp className="h-3.5 w-3.5" />
          New version
        </Button>
        {document.project && (
          <Link href={`/projects/${document.project.id}`}>
            <Button size="icon" variant="ghost" title="Open project">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
