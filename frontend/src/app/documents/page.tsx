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
  CheckCircle2,
  XCircle,
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
import { DocumentItem, DocumentCategory, DocumentStatus, DocumentVersion } from "@/types/document";
import { UploadDocumentDialog } from "@/components/documents/upload-document-dialog";
import { UploadVersionDialog } from "@/components/documents/upload-version-dialog";
import { DocumentReviewDialog } from "@/components/documents/document-review-dialog";
import { DocumentCommentsDrawer } from "@/components/documents/document-comments-drawer";

export default function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "ALL">("ALL");

  // Dialog States
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const [selectedDocForVersion, setSelectedDocForVersion] = useState<DocumentItem | null>(null);
  const [isUploadVersionOpen, setIsUploadVersionOpen] = useState(false);

  const [reviewState, setReviewState] = useState<{
    doc: DocumentItem | null;
    version: DocumentVersion | null;
    action: "APPROVE" | "REJECT" | null;
  }>({ doc: null, version: null, action: null });

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
        return <Badge variant="warning">Under Review</Badge>;
      case "REJECTED":
        return <Badge variant="destructive">Revision Required</Badge>;
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

  const handleOpenReview = (
    doc: DocumentItem,
    version: DocumentVersion,
    action: "APPROVE" | "REJECT"
  ) => {
    setReviewState({ doc, version, action });
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
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-1">
            <FolderArchive className="h-4 w-4" />
            <span>Document Repository & Supabase Storage</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Document Repository</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Centralized document storage, version history, presales deliverables, and Head SA approvals.
          </p>
        </div>

        <Button onClick={() => setIsUploadOpen(true)} className="gap-2 self-start sm:self-auto shadow-md">
          <UploadCloud className="h-4 w-4" />
          <span>Upload Document</span>
        </Button>
      </div>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-6 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search documents by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="sm:col-span-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as any)}
            className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
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
            className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">All Statuses</option>
            <option value="APPROVED">Approved</option>
            <option value="SUBMITTED">Under Review</option>
            <option value="REJECTED">Revision Required</option>
            <option value="DRAFT">Draft</option>
          </select>
        </div>
      </div>

      {downloadError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-center justify-between">
          <span>{downloadError}</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setDownloadError("")}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Documents Grid */}
      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Loading repository documents...</div>
      ) : isError ? (
        <div className="py-16 text-center text-destructive">Failed to load documents.</div>
      ) : documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          No documents found matching your filter criteria. Click &quot;Upload Document&quot; to add a new file.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {documents.map((doc) => {
            const latestVersion = doc.versions?.[0];

            return (
              <Card
                key={doc.id}
                className="flex flex-col justify-between hover:border-primary/50 transition duration-200"
              >
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {getCategoryBadge(doc.category)}
                        {getStatusBadge(doc.status)}
                      </div>
                      <h3 className="text-lg font-bold text-foreground">
                        {doc.title}
                      </h3>
                    </div>
                    {latestVersion && (
                      <Badge variant="outline" className="text-xs text-primary font-semibold">
                        Version {latestVersion.versionNumber}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                    <div className="rounded-lg bg-muted/30 border border-border/40 p-3 text-xs space-y-1.5">
                      <div className="flex items-center justify-between font-medium text-foreground">
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
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/30">
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
                  <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                    {/* Left: Comments & Download */}
                    <div className="flex items-center gap-2">
                      {latestVersion && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1.5"
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
                        className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                        onClick={() => handleOpenComments(doc)}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>{doc._count?.comments || 0} Comments</span>
                      </Button>
                    </div>

                    {/* Right: Versioning & Review Actions */}
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                        onClick={() => {
                          setSelectedDocForVersion(doc);
                          setIsUploadVersionOpen(true);
                        }}
                      >
                        <FileUp className="h-3.5 w-3.5" />
                        <span>New Version</span>
                      </Button>

                      {latestVersion && latestVersion.status === "SUBMITTED" && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                            title="Reject Version (Head SA)"
                            onClick={() => handleOpenReview(doc, latestVersion, "REJECT")}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-emerald-400 hover:bg-emerald-500/10"
                            title="Approve Version (Head SA)"
                            onClick={() => handleOpenReview(doc, latestVersion, "APPROVE")}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
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

      <DocumentReviewDialog
        open={!!reviewState.action}
        onOpenChange={(open) => {
          if (!open) setReviewState({ doc: null, version: null, action: null });
        }}
        documentId={reviewState.doc?.id || ""}
        documentTitle={reviewState.doc?.title || ""}
        version={reviewState.version}
        action={reviewState.action}
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
