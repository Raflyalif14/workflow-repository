"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Briefcase, FileText, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useCreateProject } from "@/hooks/use-projects";
import { useScenarios } from "@/hooks/use-scenarios";
import {
  appendDocumentFiles,
  DOCUMENT_ACCEPT,
  getDocumentFileKey,
  getDocumentFileValidationError,
  MAX_DOCUMENT_FILES,
  removeDocumentFile,
  selectSingleDocumentFile,
} from "@/lib/document-file-selection";

function formatFileSize(size: number): string {
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function getProjectValidationError({
  name,
  customer,
  scenarioId,
  mom,
  documents,
}: {
  name: string;
  customer: string;
  scenarioId: string;
  mom: File | null;
  documents: File[];
}): string | null {
  if (!name.trim()) return "Project name is required.";
  if (!customer.trim()) return "Customer is required.";
  if (!scenarioId) return "Please select an active scenario.";
  if (!mom) return "A MoM file is required to create a project.";
  return [mom, ...documents].map(getDocumentFileValidationError).find(Boolean) || null;
}

export default function NewProjectPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: scenarios = [], isLoading } = useScenarios({ isActive: true });
  const create = useCreateProject();
  const momInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [customer, setCustomer] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const [mom, setMom] = useState<File | null>(null);
  const [documents, setDocuments] = useState<File[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fileSelectionError, setFileSelectionError] = useState<string | null>(null);

  if (!user || user.role !== "SALES") {
    return <div className="container py-12 text-center text-destructive">You do not have permission to create projects.</div>;
  }

  const clearError = () => setSubmitError(null);
  const removeMom = () => {
    setMom(null);
    setFileSelectionError(null);
    if (momInputRef.current) momInputRef.current.value = "";
    clearError();
  };
  const removeDocument = (index: number) => {
    setDocuments((current) => removeDocumentFile(current, index));
    setFileSelectionError(null);
    clearError();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (create.isPending) return;
    if (fileSelectionError) {
      setSubmitError(fileSelectionError);
      return;
    }

    const validationError = getProjectValidationError({ name, customer, scenarioId, mom, documents });
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    try {
      const project = await create.mutateAsync({
        name: name.trim(),
        customer: customer.trim(),
        scenario_id: scenarioId,
        mom: mom!,
        documents,
      });
      setMom(null);
      setDocuments([]);
      setFileSelectionError(null);
      router.push(`/projects/${project.id}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to create project.");
    }
  };

  return (
    <div className="container max-w-2xl space-y-6 py-8">
      <Button variant="ghost" className="gap-2" onClick={() => router.back()} disabled={create.isPending}>
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>

      <Card>
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <Briefcase className="h-4 w-4" />
            New Project
          </div>
          <CardTitle>Create Project</CardTitle>
        </CardHeader>

        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="project-name">Project Name</label>
              <Input
                id="project-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  clearError();
                }}
                placeholder="Sistem Tiket"
                disabled={create.isPending}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="project-customer">Customer</label>
              <Input
                id="project-customer"
                value={customer}
                onChange={(event) => {
                  setCustomer(event.target.value);
                  clearError();
                }}
                placeholder="PT ABC"
                disabled={create.isPending}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="project-scenario">Scenario</label>
              <select
                id="project-scenario"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={scenarioId}
                onChange={(event) => {
                  setScenarioId(event.target.value);
                  clearError();
                }}
                disabled={isLoading || create.isPending}
              >
                <option value="">Select scenario</option>
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name === "Assessment Operational V2"
                      ? "Assessment"
                      : scenario.name === "Existing TOR Operational V2"
                        ? "Existing TOR"
                        : scenario.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="project-mom">MoM (Required)</label>
                <p className="text-xs text-muted-foreground">One file, up to 50 MB.</p>
              </div>
              <Input
                ref={momInputRef}
                id="project-mom"
                name="mom"
                type="file"
                accept={DOCUMENT_ACCEPT}
                disabled={create.isPending}
                onChange={(event) => {
                  const selection = selectSingleDocumentFile(event.target.files);
                  event.target.value = "";
                  if (selection.error) {
                    setFileSelectionError(selection.error);
                    setSubmitError(selection.error);
                    return;
                  }
                  if (!selection.file) return;

                  setMom(selection.file);
                  setFileSelectionError(null);
                  clearError();
                }}
              />
              {mom && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate">{mom.name} <span className="text-xs text-muted-foreground">({formatFileSize(mom.size)})</span></span>
                  </span>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={removeMom} disabled={create.isPending} aria-label="Remove selected MoM" title="Remove selected MoM">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="project-documents">Additional Documents</label>
                <p className="text-xs text-muted-foreground">Optional. Up to {MAX_DOCUMENT_FILES} files, 50 MB each.</p>
              </div>
              <Input
                id="project-documents"
                name="documents"
                type="file"
                multiple
                accept={DOCUMENT_ACCEPT}
                disabled={create.isPending}
                onChange={(event) => {
                  const selection = appendDocumentFiles(documents, event.target.files);
                  setDocuments(selection.files);
                  event.target.value = "";
                  setFileSelectionError(selection.error);
                  setSubmitError(selection.error);
                }}
              />
              {documents.length > 0 && (
                <div className="space-y-2">
                  {documents.map((file, index) => (
                    <div key={getDocumentFileKey(file)} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{file.name} <span className="text-xs text-muted-foreground">({formatFileSize(file.size)})</span></span>
                      </span>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeDocument(index)} disabled={create.isPending} aria-label={`Remove ${file.name}`} title={`Remove ${file.name}`}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {submitError && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <Button type="submit" disabled={create.isPending || Boolean(fileSelectionError)}>
              {create.isPending ? "Creating..." : "Create Project"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
