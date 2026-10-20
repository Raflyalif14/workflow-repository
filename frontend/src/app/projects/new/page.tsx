"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { translate as translateI18n } from "@/i18n";
import { useLanguage } from "@/components/i18n/language-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { BusinessConfirmation } from "@/components/projects/business-confirmation";
import { ProjectCreateHeader } from "@/components/projects/project-create-header";
import { ProjectCreateDetails } from "@/components/projects/project-create-details";
import { ProjectCreateScenario } from "@/components/projects/project-create-scenario";
import { ProjectCreateAttachments } from "@/components/projects/project-create-attachments";
import { ProjectCreateChecklist } from "@/components/projects/project-create-checklist";
import { ProjectCreateActions } from "@/components/projects/project-create-actions";
import { useCreateProject } from "@/hooks/use-projects";
import { useScenarios } from "@/hooks/use-scenarios";
import { getMandatoryDocumentKeys, resolveScenarioKey } from "@/constants/scenarios";
import { formatEstimatedValue } from "@/lib/project-estimated-value";
import { projectCreateErrorKey, type ProjectCreateInput } from "@/lib/project-create-request";
import { getProjectRevenueError, getProjectValidationError } from "@/lib/project-create-validation";

export default function NewProjectPage() {
  useLanguage();
  const router = useRouter();
  const { user } = useAuth();
  const scenariosQuery = useScenarios();
  const scenarios = (scenariosQuery.data || []).filter((scenario) => scenario.is_active);
  const create = useCreateProject();

  // Dialog & idempotency state
  const [confirming, setConfirming] = useState(false);
  const [creationFrozen, setCreationFrozen] = useState(false);
  const creationInput = useRef<ProjectCreateInput | null>(null);
  const createdProjectId = useRef<string | null>(null);
  const isSubmitting = useRef(false);

  // Form field state
  const [name, setName] = useState("");
  const [customer, setCustomer] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const [estimatedRevenue, setEstimatedRevenue] = useState("");
  const [selectedOptionalKeys, setSelectedOptionalKeys] = useState<string[]>([]);
  const [mom, setMom] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [documents, setDocuments] = useState<File[]>([]);

  // Validation & error state
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fileSelectionError, setFileSelectionError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Access control
  if (!user || user.role !== "SALES") {
    return (
      <div className="container py-12 text-center text-destructive">
        {translateI18n("copy.createForbidden")}
      </div>
    );
  }

  // Derived scenario & document keys
  const selectedScenario = scenarios.find((scenario) => scenario.id === scenarioId);
  const scenarioKey = resolveScenarioKey(selectedScenario?.name);
  const mandatoryKeys = selectedScenario ? getMandatoryDocumentKeys(scenarioKey) : [];
  const allSelectedDocumentKeys = selectedScenario
    ? Array.from(new Set([...mandatoryKeys, ...selectedOptionalKeys]))
    : [];

  const toggleOptionalKey = (key: string) => {
    setSelectedOptionalKeys((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    );
  };

  const projectDetailsComplete = Boolean(
    name.trim() && customer.trim() && selectedScenario && !getProjectRevenueError(estimatedRevenue)
  );

  const clearError = () => setSubmitError(null);

  // Step 1: Validate and open confirmation dialog
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (create.isPending || isSubmitting.current) return;
    setSubmitAttempted(true);

    if (creationFrozen) {
      setConfirming(true);
      return;
    }

    if (scenariosQuery.isError) {
      setSubmitError("copy.scenarioLoadError");
      return;
    }

    if (fileSelectionError) {
      setSubmitError(fileSelectionError);
      return;
    }

    const validationError = getProjectValidationError({
      name,
      customer,
      scenarioId,
      scenarios,
      estimatedRevenue,
      mom,
      photos,
      documents,
    });
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setConfirming(true);
  };

  // Step 2: Confirmed submission with retry and duplicate protection
  const createConfirmed = async () => {
    if (createdProjectId.current) {
      router.push(`/projects/${createdProjectId.current}`);
      return;
    }
    if (isSubmitting.current || create.isPending) return;

    if (!creationFrozen) {
      const error =
        fileSelectionError ||
        (scenariosQuery.isError
          ? "copy.scenarioLoadError"
          : getProjectValidationError({
              name,
              customer,
              scenarioId,
              scenarios,
              estimatedRevenue,
              mom,
              photos,
              documents,
            }));
      if (error) {
        setSubmitError(error);
        setConfirming(false);
        throw new Error("Project form validation failed");
      }
    }

    // Preserve the exact confirmed input if scenarios refresh before a retry
    const input = creationInput.current ?? {
      name: name.trim(),
      customer: customer.trim(),
      scenario_id: scenarioId,
      estimated_revenue: Number(estimatedRevenue),
      mom: mom!,
      photos,
      documents,
      selectedDocumentKeys: allSelectedDocumentKeys,
    };
    creationInput.current = input;
    setCreationFrozen(true);
    isSubmitting.current = true;

    try {
      const project = await create.mutateAsync(input);
      createdProjectId.current = project.id;
      setMom(null);
      setPhotos([]);
      setDocuments([]);
      setFileSelectionError(null);
      router.push(`/projects/${project.id}`);
    } catch (error) {
      setSubmitError(projectCreateErrorKey(error));
      throw error;
    } finally {
      isSubmitting.current = false;
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-7 sm:px-6 xl:px-8 xl:py-9">
      <ProjectCreateHeader
        onBack={() => router.push("/projects")}
        disabled={create.isPending}
      />

      <form noValidate onSubmit={submit} className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-hidden page-surface">
          <fieldset disabled={creationFrozen} className="min-w-0">
            <ProjectCreateDetails
              name={name}
              customer={customer}
              estimatedRevenue={estimatedRevenue}
              setName={setName}
              setCustomer={setCustomer}
              setEstimatedRevenue={setEstimatedRevenue}
              clearError={clearError}
              disabled={create.isPending}
              submitAttempted={submitAttempted}
            />

            <ProjectCreateScenario
              scenarios={scenarios}
              scenarioId={scenarioId}
              selectedOptionalKeys={selectedOptionalKeys}
              allSelectedDocumentKeys={allSelectedDocumentKeys}
              setScenarioId={setScenarioId}
              setSelectedOptionalKeys={setSelectedOptionalKeys}
              toggleOptionalKey={toggleOptionalKey}
              clearError={clearError}
              disabled={create.isPending}
              submitAttempted={submitAttempted}
              isLoading={scenariosQuery.isLoading}
              hasError={scenariosQuery.isError}
              onRetry={() => {
                clearError();
                void scenariosQuery.refetch();
              }}
            />

            <ProjectCreateAttachments
              mom={mom}
              photos={photos}
              documents={documents}
              setMom={setMom}
              setPhotos={setPhotos}
              setDocuments={setDocuments}
              onError={(error) => {
                setFileSelectionError(error);
                setSubmitError(error);
              }}
              fileSelectionError={fileSelectionError}
              disabled={create.isPending}
              submitAttempted={submitAttempted}
            />
          </fieldset>

          <ProjectCreateActions
            isPending={create.isPending}
            creationFrozen={creationFrozen}
            creationRequestId={create.creationRequestId}
            submitError={submitError}
            fileSelectionError={fileSelectionError}
            onCancel={() => router.push("/projects")}
          />
        </div>

        <ProjectCreateChecklist
          projectDetailsComplete={projectDetailsComplete}
          mom={mom}
          scenarioId={selectedScenario?.id || ""}
          allSelectedDocumentKeys={allSelectedDocumentKeys}
          mandatoryKeys={mandatoryKeys}
          selectedOptionalKeys={selectedOptionalKeys}
          photos={photos}
          documents={documents}
        />
      </form>

      <BusinessConfirmation
        open={confirming}
        onOpenChange={setConfirming}
        title={name.trim()}
        changes={[
          customer.trim(),
          scenarios.find((item) => item.id === scenarioId)?.name || scenarioId,
          formatEstimatedValue(estimatedRevenue),
          mom?.name || "",
          ...photos.map((file) => file.name),
          ...documents.map((file) => file.name),
        ]}
        action={translateI18n(creationFrozen ? "createReceipt.retry" : "businessAudit.create")}
        errorKey={submitError ? projectCreateErrorKey(create.error) : undefined}
        allowConflictRetry={true}
        onConfirm={createConfirmed}
      />
    </div>
  );
}
