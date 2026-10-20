"use client";
import { FileCheck, Loader2, Lock } from "lucide-react";
import { translate as translateI18n, translateOutputName } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getScenarioDocuments, resolveScenarioKey, SCENARIO_DEFINITIONS } from "@/constants/scenarios";
import type { Scenario } from "@/types/scenario";
import { SectionHeading } from "./project-create-section-heading";

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

export interface ProjectCreateScenarioProps {
  scenarios: Scenario[];
  scenarioId: string;
  selectedOptionalKeys: string[];
  allSelectedDocumentKeys: string[];
  setScenarioId: (value: string) => void;
  setSelectedOptionalKeys: (value: string[]) => void;
  toggleOptionalKey: (key: string) => void;
  clearError: () => void;
  disabled: boolean;
  submitAttempted: boolean;
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
}

export function ProjectCreateScenario({
  scenarios,
  scenarioId,
  selectedOptionalKeys,
  allSelectedDocumentKeys,
  setScenarioId,
  setSelectedOptionalKeys,
  toggleOptionalKey,
  clearError,
  disabled,
  submitAttempted,
  isLoading,
  hasError,
  onRetry,
}: ProjectCreateScenarioProps) {
  const selectedScenario = scenarios.find(scenario => scenario.id === scenarioId && scenario.is_active);
  const scenarioDocuments = selectedScenario ? getScenarioDocuments(resolveScenarioKey(selectedScenario.name)) : [];
  return (
    <section className="border-b border-border px-5 py-6 sm:px-7">
      <SectionHeading number="02" title={translateI18n("projectCreate.projectScenario")}>
        {translateI18n("ui.scenarioGuidance")}
      </SectionHeading>

      <label className="mb-2 block text-sm font-medium" htmlFor="project-scenario">
        {translateI18n("projectDetail.scenario")} <span className="text-destructive" aria-hidden="true">*</span>
      </label>
      <select
        id="project-scenario"
        className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        value={scenarioId}
        onChange={(event) => {
          setScenarioId(event.target.value);
          setSelectedOptionalKeys([]);
          clearError();
        }}
        disabled={isLoading || hasError || disabled}
        aria-invalid={submitAttempted && !selectedScenario}
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
      {submitAttempted && !selectedScenario && (
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
                      disabled={doc.isRequired || disabled}
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
      {hasError ? (
        <div role="alert" className="mt-3 space-y-2 text-sm text-destructive">
          <p>{translateI18n("copy.scenarioLoadError")}</p>
          <Button type="button" variant="outline" onClick={onRetry} disabled={isLoading || disabled}>{translateI18n("common.retry")}</Button>
        </div>
      ) : !isLoading && scenarios.length === 0 ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">{translateI18n("copy.noScenarios")}</p>
      ) : null}
    </section>
  );
}
