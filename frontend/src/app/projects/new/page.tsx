"use client";
import { formatEstimatedValue } from "@/lib/project-estimated-value";
import { projectCreateErrorKey } from "@/lib/project-create-request";
import { BusinessConfirmation } from "@/components/projects/business-confirmation";
import { useLanguage } from "@/components/i18n/language-provider";

import { translate as translateI18n, translateOutputName, translateStoredError } from "@/i18n";

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
  if (!name.trim()) return "copy.projectNameRequired";
  if (!customer.trim()) return "copy.customerRequired";
  if (!scenarioId) return "copy.selectActiveScenario";
  if (!estimatedRevenue.trim()) return "projectCreate.revenueRequired";
  const revenueValue = Number(estimatedRevenue);
  if (!Number.isFinite(revenueValue) || revenueValue < 0) return "copy.revenueValidation";
  if (!mom) return "copy.momRequired";
  if (!photos.length) return "copy.photoRequired";
  return [
    getProjectMomFileValidationError(mom),
    ...photos.map(getProjectPhotoFileValidationError),
    ...documents.map(getDocumentFileValidationError),
  ].find(Boolean) || null;
}

function getScenarioDisplayName(scenarioName: string): string {
  if (scenarioName === SCENARIO_DEFINITIONS.PRA_TENDER.name) return translateI18n("projectCreate.praTender");
  if (scenarioName === SCENARIO_DEFINITIONS.ON_SUBMISSION_TENDER.name) return translateI18n("projectCreate.onSubmissionTender");
  return scenarioName;
}

function getScenarioContext(name?: string): string {
  if (name !== SCENARIO_DEFINITIONS.PRA_TENDER.name && name !== SCENARIO_DEFINITIONS.ON_SUBMISSION_TENDER.name) return translateI18n("ui.scenarioContext");
  const key = resolveScenarioKey(name);
  return translateI18n(key === "PRA_TENDER" ? "projectCreate.praTenderDescription" : "projectCreate.onSubmissionDescription");
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
        aria-label={translateI18n("projectCreate.removeFile", { name: file.name })}
        title={translateI18n("projectCreate.removeFile", { name: file.name })}
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
          {optional && <span className="ml-1 font-normal text-muted-foreground">({translateI18n("common.optional")})</span>}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export default function NewProjectPage() {
  useLanguage();
  const router = useRouter();
  const { user } = useAuth();
  const { data: scenarios = [], isLoading } = useScenarios({ isActive: true });
  const create = useCreateProject();
  const [confirming, setConfirming] = useState(false);
  const [creationFrozen, setCreationFrozen] = useState(false);
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
    return <div className="container py-12 text-center text-destructive">{translateI18n("copy.createForbidden")}</div>;
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

    setConfirming(true);
  };

  const createConfirmed = async () => {
    setCreationFrozen(true);
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
      setSubmitError(projectCreateErrorKey(error)); throw error;
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
      <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-primary">{translateI18n("copy.salesWorkspace")}</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">{translateI18n("project.create")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {translateI18n("projectCreate.intro")}
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
          {translateI18n("copy.backToProject")}
        </Button>
      </header>

      <form onSubmit={submit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <fieldset disabled={creationFrozen} className="min-w-0">
          <section className="border-b border-border px-5 py-6 sm:px-7">
            <SectionHeading number="01" title={translateI18n("projectCreate.projectInfo")}>
              {translateI18n("projectCreate.projectInfoHelp")}
            </SectionHeading>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium" htmlFor="project-name">
                  {translateI18n("projectCreate.projectName")} <span className="text-destructive" aria-hidden="true">*</span>
                </label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    clearError();
                  }}
                  placeholder={translateI18n("projectCreate.projectNameExample")}
                  disabled={create.isPending}
                  aria-invalid={submitAttempted && !name.trim()}
                  aria-describedby={submitAttempted && !name.trim() ? "project-name-error" : undefined}
                />
                {submitAttempted && !name.trim() && (
                  <p id="project-name-error" className="mt-1.5 text-xs text-destructive">{translateI18n("copy.projectNameRequired")}</p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium" htmlFor="project-customer">
                  {translateI18n("project.customer")} <span className="text-destructive" aria-hidden="true">*</span>
                </label>
                <Input
                  id="project-customer"
                  value={customer}
                  onChange={(event) => {
                    setCustomer(event.target.value);
                    clearError();
                  }}
                  placeholder={translateI18n("projectCreate.customerExample")}
                  disabled={create.isPending}
                  aria-invalid={submitAttempted && !customer.trim()}
                  aria-describedby={submitAttempted && !customer.trim() ? "project-customer-error" : undefined}
                />
                {submitAttempted && !customer.trim() && (
                  <p id="project-customer-error" className="mt-1.5 text-xs text-destructive">{translateI18n("copy.customerRequired")}</p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium" htmlFor="project-estimated-revenue">
                  {translateI18n("copy.estimatedRevenue")} <span className="text-destructive" aria-hidden="true">*</span>
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
                <p className="mt-1.5 text-xs text-muted-foreground">{translateI18n("copy.revenueHelp")}</p>
                {submitAttempted && (!estimatedRevenue.trim() || !Number.isFinite(Number(estimatedRevenue)) || Number(estimatedRevenue) < 0) && (
                  <p className="mt-1.5 text-xs text-destructive">{translateI18n("copy.revenueValidation")}</p>
                )}
              </div>
            </div>
          </section>

          <section className="border-b border-border px-5 py-6 sm:px-7">
            <SectionHeading number="02" title={translateI18n("projectCreate.projectScenario")}>
              {translateI18n("ui.scenarioGuidance")}
            </SectionHeading>

            <label className="mb-2 block text-sm font-medium" htmlFor="project-scenario">
              {translateI18n("projectDetail.scenario")} <span className="text-destructive" aria-hidden="true">*</span>
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
              <option value="">{translateI18n(isLoading ? "ui.loadingScenarios" : "ui.chooseScenario")}</option>
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {getScenarioDisplayName(scenario.name)}
                </option>
              ))}
            </select>
            <p id="project-scenario-context" className="mt-2 text-xs leading-5 text-muted-foreground">
              {selectedScenario
                ? getScenarioContext(selectedScenario.name)
                : translateI18n("ui.scenarioContext")}
            </p>
            {submitAttempted && !scenarioId && (
              <p className="mt-1.5 text-xs text-destructive">{translateI18n("copy.selectActiveScenario")}</p>
            )}

            {/* Output Document Checklist Panel */}
            {scenarioDocuments.length > 0 && (
              <div className="mt-5 rounded-lg border border-border/80 bg-muted/20 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <FileCheck className="h-4 w-4 text-primary" />
                      {translateI18n("ui.outputDocumentList")}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {translateI18n("ui.outputSelectionHelp")}
                    </p>
                  </div>
                  <Badge variant="outline" className="self-start sm:self-auto text-xs font-mono">
                    {translateI18n("ui.documentsSelected", { selected: allSelectedDocumentKeys.length, total: scenarioDocuments.length })}
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
                              <span>{translateOutputName(doc.key, doc.name)}</span>
                              {doc.isRequired && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <Lock className="h-3 w-3" /> ({translateI18n("ui.required")})
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
                          {translateI18n(doc.isRequired ? "ui.required" : "ui.optional")}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="border-b border-border px-5 py-6 sm:px-7">
            <SectionHeading number="03" title={translateI18n("projectCreate.intakeEvidence")}>
              {translateI18n("projectCreate.intakeEvidenceHelp")}
            </SectionHeading>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="min-w-0">
                <div className="mb-3">
                  <label className="text-sm font-medium" htmlFor="project-mom">
                    {translateI18n("projectCreate.momPdf")} <span className="text-destructive" aria-hidden="true">*</span>
                  </label>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{translateI18n("ui.exactPdf")}</p>
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
                  <p className="mt-1.5 text-xs text-destructive">{translateI18n("copy.momRequired")}</p>
                ) : null}
              </div>

              <div className="min-w-0">
                <div className="mb-3">
                  <label className="text-sm font-medium" htmlFor="project-photos">
                    {translateI18n("projectCreate.projectPhotos")} <span className="text-destructive" aria-hidden="true">*</span>
                  </label>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {translateI18n("projectCreate.photosHelp", { count: MAX_PROJECT_PHOTOS })}
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
                  <p className="mt-1.5 text-xs text-destructive">{translateI18n("copy.photoRequired")}</p>
                ) : null}
              </div>
            </div>

            {fileSelectionError && (
              <div role="alert" className="mt-5 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{translateStoredError(fileSelectionError, "projectCreate.invalidFile")}</span>
              </div>
            )}
          </section>

          <section className="px-5 py-6 sm:px-7">
            <SectionHeading number="04" title={translateI18n("ui.supportingDocuments")} muted>
              {translateI18n("ui.supportingDescription")}
            </SectionHeading>

            <label className="mb-2 block text-sm font-medium" htmlFor="project-documents">{translateI18n("copy.additionalFiles")}</label>
            <p className="mb-3 text-xs leading-5 text-muted-foreground">
              {translateI18n("ui.fileLimit", { count: MAX_DOCUMENT_FILES })}
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

          </fieldset>
          <div className="border-t border-border bg-muted/15 px-5 py-5 sm:px-7">
            {creationFrozen && <p className="mb-3 text-sm text-muted-foreground">{translateI18n("createReceipt.locked")}{create.creationRequestId && <span className="mt-1 block break-all font-mono text-xs">{translateI18n("createReceipt.operation",{id:create.creationRequestId})}</span>}</p>}
            {submitError && (
              <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{translateStoredError(submitError)}</span>
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
                {translateI18n("common.cancel")}
              </Button>
              <Button type="submit" className="w-full sm:w-auto" disabled={create.isPending || Boolean(fileSelectionError)}>
                {translateI18n(create.isPending ? "projectCreate.creating" : creationFrozen ? "createReceipt.retry" : "project.create")}
              </Button>
            </div>
          </div>
        </div>

        <aside className="rounded-lg border border-border bg-card px-5 py-5 lg:sticky lg:top-24">
          <h2 className="text-base font-semibold text-foreground">{translateI18n("copy.beforeCreate")}</h2>
          <div className="mt-5 space-y-5">
            <ChecklistItem
              label={translateI18n("projectCreate.projectInfo")}
              detail={translateI18n(projectDetailsComplete ? "projectCreate.detailsReady" : "projectCreate.detailsMissing")}
              complete={projectDetailsComplete}
            />
            <ChecklistItem
              label="MoM PDF"
              detail={mom ? mom.name : translateI18n("projectCreate.momMissing")}
              complete={Boolean(mom)}
            />
            <ChecklistItem
              label={translateI18n("ui.outputDocumentList")}
              detail={
                scenarioId
                  ? translateI18n("projectCreate.outputSummary", { selected: allSelectedDocumentKeys.length, required: mandatoryKeys.length, optional: selectedOptionalKeys.length })
                  : translateI18n("ui.chooseScenarioFirst")
              }
              complete={Boolean(scenarioId && allSelectedDocumentKeys.length > 0)}
            />
            <ChecklistItem
              label={translateI18n("projectCreate.projectPhotos")}
              detail={photos.length ? translateI18n("projectCreate.photosAttached", { count: photos.length }) : translateI18n("projectCreate.photosMissing")}
              complete={photos.length > 0}
            />
            <ChecklistItem
              label={translateI18n("ui.supportingDocuments")}
              detail={documents.length ? translateI18n("ui.attachedFiles", { count: documents.length }) : translateI18n("ui.noAttachedFiles")}
              complete={documents.length > 0}
              optional
            />
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <h3 className="text-sm font-semibold text-foreground">{translateI18n("copy.nextStep")}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {translateI18n("ui.planningNext")}
            </p>
          </div>
        </aside>
      </form>
      <BusinessConfirmation open={confirming} onOpenChange={setConfirming} title={name.trim()}
        changes={[customer.trim(), scenarios.find(item => item.id === scenarioId)?.name || scenarioId, formatEstimatedValue(estimatedRevenue), mom?.name || "", ...photos.map(file => file.name), ...documents.map(file => file.name)]}
        action={translateI18n(creationFrozen ? "createReceipt.retry" : "businessAudit.create")} errorKey={submitError ? projectCreateErrorKey(create.error) : undefined} allowConflictRetry={true} onConfirm={createConfirmed} />
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
