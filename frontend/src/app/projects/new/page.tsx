"use client";

import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  FileCheck,
  FileText,
  ImageIcon,
  Lock,
  Paperclip,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateProject } from "@/hooks/use-projects";
import { useScenarios } from "@/hooks/use-scenarios";
import {
  getMandatoryDocumentKeys,
  getScenarioDocuments,
  resolveScenarioKey,
  SCENARIO_DEFINITIONS,
} from "@/constants/scenarios";
import {
  appendDocumentFiles,
  appendProjectPhotoFiles,
  DOCUMENT_ACCEPT,
  getDocumentFileKey,
  getDocumentFileValidationError,
  getProjectMomFileValidationError,
  getProjectPhotoFileValidationError,
  MAX_DOCUMENT_FILES,
  MAX_PROJECT_PHOTOS,
  PROJECT_MOM_ACCEPT,
  PROJECT_PHOTO_ACCEPT,
  removeDocumentFile,
  selectSingleProjectMomFile,
} from "@/lib/document-file-selection";

function formatFileSize(size: number): string {
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function getProjectValidationError({
  name,
  customer,
  scenarioId,
  estimatedRevenue,
  mom,
  photos,
  documents,
}: {
  name: string;
  customer: string;
  scenarioId: string;
  estimatedRevenue: string;
  mom: File | null;
  photos: File[];
  documents: File[];
}): string | null {
  if (!name.trim()) return "Project name is required.";
  if (!customer.trim()) return "Customer is required.";
  if (!scenarioId) return "Please select an active scenario.";
  if (!estimatedRevenue.trim()) return "Estimated revenue is required.";
  const revenueValue = Number(estimatedRevenue);
  if (!Number.isFinite(revenueValue) || revenueValue < 0) return "Estimated revenue must be a valid non-negative amount.";
  if (!mom) return "A MoM file is required to create a project.";
  if (!photos.length) return "At least one project photo is required to create a project.";
  return [
    getProjectMomFileValidationError(mom),
    ...photos.map(getProjectPhotoFileValidationError),
    ...documents.map(getDocumentFileValidationError),
  ].find(Boolean) || null;
}

function getScenarioDisplayName(scenarioName: string): string {
  const key = resolveScenarioKey(scenarioName);
  return SCENARIO_DEFINITIONS[key].label;
}

function getScenarioContext(name?: string, description?: string | null): string {
  if (description?.trim()) return description;
  const key = resolveScenarioKey(name);
  return SCENARIO_DEFINITIONS[key].description;
}

function SelectedFileRow({
  file,
  icon,
  onRemove,
  disabled,
}: {
  file: File;
  icon: ReactNode;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-border/50 py-2.5 last:border-b-0">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground" title={file.name}>
          {file.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {file.type || "File"} · {formatFileSize(file.size)}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${file.name}`}
        title={`Remove ${file.name}`}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ChecklistItem({
  label,
  detail,
  complete,
  optional = false,
}: {
  label: string;
  detail: string;
  complete: boolean;
  optional?: boolean;
}) {
  const Icon = optional ? Paperclip : complete ? CheckCircle2 : Circle;

  return (
    <div className="flex items-start gap-3">
      <Icon
        className={
          complete && !optional
            ? "mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
            : "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60"
        }
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {label}
          {optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
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
  const [estimatedRevenue, setEstimatedRevenue] = useState("");
  const [selectedOptionalKeys, setSelectedOptionalKeys] = useState<string[]>([]);
  const [mom, setMom] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [documents, setDocuments] = useState<File[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fileSelectionError, setFileSelectionError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  if (!user || user.role !== "SALES") {
    return <div className="container py-12 text-center text-destructive">You do not have permission to create projects.</div>;
  }

  const selectedScenario = scenarios.find((scenario) => scenario.id === scenarioId);
  const scenarioKey = resolveScenarioKey(selectedScenario?.name);
  const scenarioDocuments = scenarioId ? getScenarioDocuments(scenarioKey) : [];
  const mandatoryKeys = useMemo(
    () => (scenarioId ? getMandatoryDocumentKeys(scenarioKey) : []),
    [scenarioId, scenarioKey]
  );
  const allSelectedDocumentKeys = useMemo(() => {
    if (!scenarioId) return [];
    return Array.from(new Set([...mandatoryKeys, ...selectedOptionalKeys]));
  }, [scenarioId, mandatoryKeys, selectedOptionalKeys]);

  const toggleOptionalKey = (key: string) => {
    setSelectedOptionalKeys((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    );
  };

  const projectDetailsComplete = Boolean(
    name.trim() && customer.trim() && scenarioId && estimatedRevenue.trim() && Number(estimatedRevenue) >= 0
  );
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

  const removePhoto = (index: number) => {
    setPhotos((current) => removeDocumentFile(current, index));
    setFileSelectionError(null);
    clearError();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (create.isPending) return;
    setSubmitAttempted(true);

    if (fileSelectionError) {
      setSubmitError(fileSelectionError);
      return;
    }

    const validationError = getProjectValidationError({ name, customer, scenarioId, estimatedRevenue, mom, photos, documents });
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    try {
      const project = await create.mutateAsync({
        name: name.trim(),
        customer: customer.trim(),
        scenario_id: scenarioId,
        estimated_revenue: Number(estimatedRevenue),
        mom: mom!,
        photos,
        documents,
        selectedDocumentKeys: allSelectedDocumentKeys,
      });
      setMom(null);
      setPhotos([]);
      setDocuments([]);
      setFileSelectionError(null);
      router.push(`/projects/${project.id}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to create project.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
      <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-primary">Sales workspace</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">Create project</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Add the customer details and Project Intake evidence needed to begin planning.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2 sm:w-auto"
          onClick={() => router.push("/projects")}
          disabled={create.isPending}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to projects
        </Button>
      </header>

      <form onSubmit={submit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <section className="border-b border-border px-5 py-6 sm:px-7">
            <SectionHeading number="01" title="Project information">
              Identify the engagement and customer.
            </SectionHeading>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium" htmlFor="project-name">
                  Project name <span className="text-destructive" aria-hidden="true">*</span>
                </label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    clearError();
                  }}
                  placeholder="e.g. Customer service modernization"
                  disabled={create.isPending}
                  aria-invalid={submitAttempted && !name.trim()}
                  aria-describedby={submitAttempted && !name.trim() ? "project-name-error" : undefined}
                />
                {submitAttempted && !name.trim() && (
                  <p id="project-name-error" className="mt-1.5 text-xs text-destructive">Project name is required.</p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium" htmlFor="project-customer">
                  Customer <span className="text-destructive" aria-hidden="true">*</span>
                </label>
                <Input
                  id="project-customer"
                  value={customer}
                  onChange={(event) => {
                    setCustomer(event.target.value);
                    clearError();
                  }}
                  placeholder="e.g. PT Nusantara"
                  disabled={create.isPending}
                  aria-invalid={submitAttempted && !customer.trim()}
                  aria-describedby={submitAttempted && !customer.trim() ? "project-customer-error" : undefined}
                />
                {submitAttempted && !customer.trim() && (
                  <p id="project-customer-error" className="mt-1.5 text-xs text-destructive">Customer is required.</p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium" htmlFor="project-estimated-revenue">
                  Estimated Revenue <span className="text-destructive" aria-hidden="true">*</span>
                </label>
                <Input
                  id="project-estimated-revenue"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={estimatedRevenue}
                  onChange={(event) => {
                    setEstimatedRevenue(event.target.value);
                    clearError();
                  }}
                  placeholder="e.g. 1500000000"
                  disabled={create.isPending}
                  aria-invalid={submitAttempted && (!estimatedRevenue.trim() || !Number.isFinite(Number(estimatedRevenue)) || Number(estimatedRevenue) < 0)}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">Enter the estimated project revenue in IDR.</p>
                {submitAttempted && (!estimatedRevenue.trim() || !Number.isFinite(Number(estimatedRevenue)) || Number(estimatedRevenue) < 0) && (
                  <p className="mt-1.5 text-xs text-destructive">Estimated revenue is required and must be a valid non-negative amount.</p>
                )}
              </div>
            </div>
          </section>

          <section className="border-b border-border px-5 py-6 sm:px-7">
            <SectionHeading number="02" title="Workflow scenario">
              Choose the workflow that matches the customer context.
            </SectionHeading>

            <label className="mb-2 block text-sm font-medium" htmlFor="project-scenario">
              Scenario <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <select
              id="project-scenario"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={scenarioId}
              onChange={(event) => {
                setScenarioId(event.target.value);
                setSelectedOptionalKeys([]);
                clearError();
              }}
              disabled={isLoading || create.isPending}
              aria-invalid={submitAttempted && !scenarioId}
              aria-describedby="project-scenario-context"
            >
              <option value="">{isLoading ? "Loading scenarios..." : "Select scenario"}</option>
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {getScenarioDisplayName(scenario.name)}
                </option>
              ))}
            </select>
            <p id="project-scenario-context" className="mt-2 text-xs leading-5 text-muted-foreground">
              {selectedScenario
                ? getScenarioContext(selectedScenario.name, selectedScenario.description)
                : "Pilih Pra-Tender atau On Submission Tender sesuai konteks penugasan."}
            </p>
            {submitAttempted && !scenarioId && (
              <p className="mt-1.5 text-xs text-destructive">Please select an active scenario.</p>
            )}

            {/* Output Document Checklist Panel */}
            {scenarioDocuments.length > 0 && (
              <div className="mt-5 rounded-lg border border-border/80 bg-muted/20 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <FileCheck className="h-4 w-4 text-primary" />
                      Output Document Checklist
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Dokumen Wajib otomatis terpilih. Centang dokumen Opsional yang dibutuhkan untuk proyek ini.
                    </p>
                  </div>
                  <Badge variant="outline" className="self-start sm:self-auto text-xs font-mono">
                    {allSelectedDocumentKeys.length} / {scenarioDocuments.length} Dokumen Terpilih
                  </Badge>
                </div>

                <div className="mt-3 divide-y divide-border/40">
                  {scenarioDocuments.map((doc) => {
                    const isChecked = doc.isRequired || selectedOptionalKeys.includes(doc.key);
                    return (
                      <div
                        key={doc.key}
                        className={`flex items-start justify-between gap-3 py-2.5 px-2 rounded transition-colors ${
                          doc.isRequired ? "bg-muted/10" : "hover:bg-muted/30"
                        }`}
                      >
                        <label
                          htmlFor={`doc-${doc.key}`}
                          className={`flex items-start gap-3 select-none flex-1 min-w-0 ${
                            doc.isRequired ? "cursor-not-allowed" : "cursor-pointer"
                          }`}
                        >
                          <input
                            id={`doc-${doc.key}`}
                            type="checkbox"
                            checked={isChecked}
                            disabled={doc.isRequired || create.isPending}
                            onChange={() => !doc.isRequired && toggleOptionalKey(doc.key)}
                            className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary disabled:opacity-75"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground flex items-center gap-2 flex-wrap">
                              <span>{doc.name}</span>
                              {doc.isRequired && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <Lock className="h-3 w-3" /> (Wajib)
                                </span>
                              )}
                            </p>
                          </div>
                        </label>
                        <Badge
                          variant={doc.isRequired ? "default" : "secondary"}
                          className={`shrink-0 text-[10px] uppercase font-semibold ${
                            doc.isRequired
                              ? "bg-primary/20 text-primary border-primary/30"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {doc.isRequired ? "Wajib" : "Opsional"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="border-b border-border px-5 py-6 sm:px-7">
            <SectionHeading number="03" title="Project Intake">
              Provide the meeting record and visual evidence needed for planning and review.
            </SectionHeading>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="min-w-0">
                <div className="mb-3">
                  <label className="text-sm font-medium" htmlFor="project-mom">
                    Meeting record / MoM PDF <span className="text-destructive" aria-hidden="true">*</span>
                  </label>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Exactly one PDF file, up to 50 MB.</p>
                </div>
                <Input
                  ref={momInputRef}
                  id="project-mom"
                  name="mom"
                  type="file"
                  accept={PROJECT_MOM_ACCEPT}
                  disabled={create.isPending}
                  aria-invalid={submitAttempted && !mom}
                  onChange={(event) => {
                    const selection = selectSingleProjectMomFile(event.target.files);
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
                {mom ? (
                  <div className="mt-2 border-y border-border/50">
                    <SelectedFileRow
                      file={mom}
                      icon={<FileText className="h-4 w-4" />}
                      onRemove={removeMom}
                      disabled={create.isPending}
                    />
                  </div>
                ) : submitAttempted ? (
                  <p className="mt-1.5 text-xs text-destructive">A MoM PDF is required.</p>
                ) : null}
              </div>

              <div className="min-w-0">
                <div className="mb-3">
                  <label className="text-sm font-medium" htmlFor="project-photos">
                    Image evidence <span className="text-destructive" aria-hidden="true">*</span>
                  </label>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    JPG, JPEG, or PNG. Add 1-{MAX_PROJECT_PHOTOS} images, up to 50 MB each.
                  </p>
                </div>
                <Input
                  id="project-photos"
                  name="photos"
                  type="file"
                  multiple
                  accept={PROJECT_PHOTO_ACCEPT}
                  disabled={create.isPending}
                  aria-invalid={submitAttempted && photos.length === 0}
                  onChange={(event) => {
                    const selection = appendProjectPhotoFiles(photos, event.target.files);
                    setPhotos(selection.files);
                    event.target.value = "";
                    setFileSelectionError(selection.error);
                    setSubmitError(selection.error);
                  }}
                />
                {photos.length > 0 ? (
                  <div className="mt-2 border-y border-border/50">
                    {photos.map((file, index) => (
                      <SelectedFileRow
                        key={getDocumentFileKey(file)}
                        file={file}
                        icon={<ImageIcon className="h-4 w-4" />}
                        onRemove={() => removePhoto(index)}
                        disabled={create.isPending}
                      />
                    ))}
                  </div>
                ) : submitAttempted ? (
                  <p className="mt-1.5 text-xs text-destructive">At least one image is required.</p>
                ) : null}
              </div>
            </div>

            {fileSelectionError && (
              <div role="alert" className="mt-5 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{fileSelectionError}</span>
              </div>
            )}
          </section>

          <section className="px-5 py-6 sm:px-7">
            <SectionHeading number="04" title="Supporting documents" muted>
              Optional files that provide additional context for Project Intake.
            </SectionHeading>

            <label className="mb-2 block text-sm font-medium" htmlFor="project-documents">Additional files</label>
            <p className="mb-3 text-xs leading-5 text-muted-foreground">
              Add up to {MAX_DOCUMENT_FILES} supported files, up to 50 MB each. These remain part of Project Intake.
            </p>
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
              <div className="mt-2 border-y border-border/50">
                {documents.map((file, index) => (
                  <SelectedFileRow
                    key={getDocumentFileKey(file)}
                    file={file}
                    icon={<Paperclip className="h-4 w-4" />}
                    onRemove={() => removeDocument(index)}
                    disabled={create.isPending}
                  />
                ))}
              </div>
            )}
          </section>

          <div className="border-t border-border bg-muted/15 px-5 py-5 sm:px-7">
            {submitError && (
              <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                className="w-full sm:w-auto"
                onClick={() => router.push("/projects")}
                disabled={create.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" className="w-full sm:w-auto" disabled={create.isPending || Boolean(fileSelectionError)}>
                {create.isPending ? "Creating..." : "Create project"}
              </Button>
            </div>
          </div>
        </div>

        <aside className="rounded-lg border border-border bg-card px-5 py-5 lg:sticky lg:top-24">
          <h2 className="text-base font-semibold text-foreground">Before you create</h2>
          <div className="mt-5 space-y-5">
            <ChecklistItem
              label="Project details"
              detail={projectDetailsComplete ? "Name, customer, and scenario are ready." : "Add a name, customer, and scenario."}
              complete={projectDetailsComplete}
            />
            <ChecklistItem
              label="MoM PDF"
              detail={mom ? mom.name : "Attach the required meeting record."}
              complete={Boolean(mom)}
            />
            <ChecklistItem
              label="Output Documents Checklist"
              detail={
                scenarioId
                  ? `${allSelectedDocumentKeys.length} dokumen dipilih (${mandatoryKeys.length} wajib, ${selectedOptionalKeys.length} opsional)`
                  : "Pilih skenario terlebih dahulu."
              }
              complete={Boolean(scenarioId && allSelectedDocumentKeys.length > 0)}
            />
            <ChecklistItem
              label="Image evidence"
              detail={photos.length ? `${photos.length} image${photos.length === 1 ? "" : "s"} attached.` : "Attach at least one JPG or PNG image."}
              complete={photos.length > 0}
            />
            <ChecklistItem
              label="Supporting files"
              detail={documents.length ? `${documents.length} optional file${documents.length === 1 ? "" : "s"} attached.` : "No supporting files added."}
              complete={documents.length > 0}
              optional
            />
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <h3 className="text-sm font-semibold text-foreground">What happens next</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The project will enter planning so you can configure its timeline before review.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}

function SectionHeading({
  number,
  title,
  children,
  muted = false,
}: {
  number: string;
  title: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span
        className={
          muted
            ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground"
            : "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary"
        }
      >
        {number}
      </span>
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
