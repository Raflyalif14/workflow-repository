"use client";

import React, { useState } from "react";
import {
  FolderArchive,
  UploadCloud,
  Search,
  Filter,
  Download,
  FileText,
  MessageSquare,
  History,
  FileUp,
  Clock,
  Layers,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useDocumentDownloadUrl, useDocuments } from "@/hooks/use-documents";
import { DocumentItem, DocumentCategory, DocumentStatus } from "@/types/document";
import { UploadDocumentDialog } from "@/components/documents/upload-document-dialog";
import { UploadVersionDialog } from "@/components/documents/upload-version-dialog";
import { DocumentCommentsDrawer } from "@/components/documents/document-comments-drawer";

export default function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "ALL">("ALL");

  // Dialog States
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const [selectedDocForVersion, setSelectedDocForVersion] = useState<DocumentItem | null>(null);
  const [isUploadVersionOpen, setIsUploadVersionOpen] = useState(false);

  const [commentsState, setCommentsState] = useState<{
    docId: string | null;
    docTitle: string;
  }>({ docId: null, docTitle: "" });

  const { data: documents = [], isLoading, isError } = useDocuments({
    search,
    category: categoryFilter,
    status: statusFilter,
  });
  const documentDownload = useDocumentDownloadUrl();

  const getStatusBadge = (status: DocumentStatus) => {
    switch (status) {
      case "APPROVED":
        return <Badge variant="success">Approved</Badge>;
      case "SUBMITTED":
      case "UNDER_REVIEW":
        return <Badge variant="warning">Submitted</Badge>;
      case "REJECTED":
        return <Badge variant="destructive">Rejected</Badge>;
      case "SUPERSEDED":
        return <Badge variant="outline" className="opacity-60">Superseded</Badge>;
      default:
        return <Badge variant="outline">Draft</Badge>;
    }
  };

  const getCategoryBadge = (category: DocumentCategory) => {
    return (
      <Badge variant="secondary" className="text-[10px] uppercase font-mono">
        {category.replace("_", " ")}
      </Badge>
    );
  };

  const handleOpenComments = (doc: DocumentItem) => {
    setCommentsState({ docId: doc.id, docTitle: doc.title });
  };

  const [downloadError, setDownloadError] = useState("");

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
      setDownloadError(error instanceof Error ? error.message : "Failed to download document.");
    }
  };

  return (
    <div className="container space-y-6 py-8">
      {/* Header */}
      <div className="flex flex-col gap-5 border-b border-border/60 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
              <FolderArchive className="h-4 w-4" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Document Repository & Supabase Storage</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Document Repository</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Centralized document storage, version history, and project deliverables.
          </p>
        </div>

        <Button onClick={() => setIsUploadOpen(true)} className="h-9 self-start gap-2 rounded-lg shadow-md sm:self-auto">
          <UploadCloud className="h-4 w-4" />
          <span>Upload Document</span>
        </Button>
      </div>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border/60 bg-card/70 p-3 shadow-sm sm:grid-cols-12 sm:p-4">
        <div className="relative sm:col-span-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search documents by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 border-border/60 bg-background/50 pl-9"
          />
        </div>

        <div className="sm:col-span-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as any)}
            className="flex h-10 w-full rounded-lg border border-border/60 bg-background/50 px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">All Categories</option>
            <option value="PROPOSAL">Proposal</option>
            <option value="ARCHITECTURE_DESIGN">Architecture Design</option>
            <option value="SIZING_SHEET">Sizing Sheet</option>
            <option value="MOM">Minutes of Meeting (MoM)</option>
            <option value="ASSESSMENT_REPORT">Assessment Report</option>
            <option value="BOQ">Bill of Quantity (BOQ)</option>
            <option value="DELIVERABLE">Deliverables</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        <div className="sm:col-span-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="flex h-10 w-full rounded-lg border border-border/60 bg-background/50 px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">All Statuses</option>
            <option value="APPROVED">Approved</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="REJECTED">Rejected</option>
            <option value="DRAFT">Draft</option>
          </select>
        </div>
      </div>

      {downloadError && (
        <div className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <span>{downloadError}</span>
          <Button variant="ghost" size="sm" className="h-7 self-start rounded-md px-2 text-xs sm:self-auto" onClick={() => setDownloadError("")}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Documents Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-56 animate-pulse rounded-xl border border-border/60 bg-card/70 shadow-sm" />
          ))}
        </div>
      ) : isError ? (
        <Card className="border-border/60 bg-card/70 shadow-sm">
          <CardContent className="py-16 text-center text-destructive">
            <p className="mx-auto max-w-sm font-semibold">Failed to load documents.</p>
          </CardContent>
        </Card>
      ) : documents.length === 0 ? (
        <Card className="border-dashed border-border/60 bg-card/70 shadow-sm">
          <CardContent className="py-16 text-center text-muted-foreground">
            <p className="mx-auto max-w-sm text-sm">No documents found matching your filter criteria. Click &quot;Upload Document&quot; to add a new file.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {documents.map((doc) => {
            const latestVersion = doc.versions?.[0];

            return (
              <Card
                key={doc.id}
                className="flex flex-col justify-between border-border/60 bg-card/70 shadow-sm transition-colors duration-200 hover:border-primary/25 hover:bg-muted/10"
              >
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {getCategoryBadge(doc.category)}
                        {getStatusBadge(doc.status)}
                      </div>
                      <h3 className="text-lg font-semibold tracking-tight text-foreground">
                        {doc.title}
                      </h3>
                    </div>
                    {latestVersion && (
                      <Badge variant="outline" className="border-primary/20 bg-primary/5 text-xs font-semibold text-primary">
                        Version {latestVersion.versionNumber}
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/40 pt-2 text-xs text-muted-foreground">
                    <span>
                      Project: <strong className="text-foreground">{doc.project?.projectCode}</strong> (
                      {doc.project?.clientName})
                    </span>
                    {doc.milestone && (
                      <>
                        <span>•</span>
                        <span>Stage: <strong className="text-foreground">{doc.milestone.name}</strong></span>
                      </>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-0">
                  {/* Latest Version Info */}
                  {latestVersion && (
                    <div className="space-y-1.5 rounded-xl border border-border/40 bg-muted/15 p-3 text-xs">
                      <div className="flex items-center justify-between gap-3 font-medium text-foreground">
                        <span className="flex items-center gap-1.5 truncate max-w-[260px]" title={latestVersion.fileName}>
                          <FileText className="h-4 w-4 text-primary shrink-0" />
                          <span className="truncate">{latestVersion.fileName}</span>
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {(latestVersion.fileSize / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                      {latestVersion.changelog && (
                        <p className="text-muted-foreground italic text-[11px]">
                          &quot;{latestVersion.changelog}&quot;
                        </p>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/30 pt-2 text-[11px] text-muted-foreground">
                        <span>Uploaded by: <strong className="text-foreground">{latestVersion.uploadedBy?.fullName}</strong></span>
                        <span>
                          {new Date(latestVersion.createdAt).toLocaleDateString("id-ID", {
                            dateStyle: "medium",
                          })}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Actions Footer */}
                  <div className="flex flex-col gap-3 border-t border-border/40 pt-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                    {/* Left: Comments & Download */}
                    <div className="flex flex-wrap items-center gap-2">
                      {latestVersion && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 rounded-lg text-xs"
                          onClick={() => handleDownload(latestVersion.id)}
                          disabled={documentDownload.isPending}
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Download</span>
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        onClick={() => handleOpenComments(doc)}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>{doc._count?.comments || 0} Comments</span>
                      </Button>
                    </div>

                    {/* Right: Versioning */}
                    <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 rounded-lg border-primary/30 text-xs text-primary hover:bg-primary/10"
                        onClick={() => {
                          setSelectedDocForVersion(doc);
                          setIsUploadVersionOpen(true);
                        }}
                      >
                        <FileUp className="h-3.5 w-3.5" />
                        <span>New Version</span>
                      </Button>

                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <UploadDocumentDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
      />

      <UploadVersionDialog
        open={isUploadVersionOpen}
        onOpenChange={setIsUploadVersionOpen}
        document={selectedDocForVersion}
      />

      <DocumentCommentsDrawer
        open={!!commentsState.docId}
        onOpenChange={(open) => {
          if (!open) setCommentsState({ docId: null, docTitle: "" });
        }}
        documentId={commentsState.docId || ""}
        documentTitle={commentsState.docTitle}
      />
    </div>
  );
}
