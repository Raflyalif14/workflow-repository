"use client";
import { translate as translateI18n } from "@/i18n";
import { Input } from "@/components/ui/input";
import { getProjectRevenueError } from "@/lib/project-create-validation";
import { SectionHeading } from "./project-create-section-heading";

export interface ProjectCreateDetailsProps {
  name: string;
  customer: string;
  estimatedRevenue: string;
  setName: (value: string) => void;
  setCustomer: (value: string) => void;
  setEstimatedRevenue: (value: string) => void;
  clearError: () => void;
  disabled: boolean;
  submitAttempted: boolean;
}

export function ProjectCreateDetails({
  name,
  customer,
  estimatedRevenue,
  setName,
  setCustomer,
  setEstimatedRevenue,
  clearError,
  disabled,
  submitAttempted,
}: ProjectCreateDetailsProps) {
  const revenueError = getProjectRevenueError(estimatedRevenue);
  return (
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
            disabled={disabled}
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
            disabled={disabled}
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
            placeholder="1500000000"
            disabled={disabled}
            aria-invalid={submitAttempted && Boolean(revenueError)}
              aria-describedby={submitAttempted && revenueError ? "project-revenue-error" : "project-revenue-help"}
          />
          <p id="project-revenue-help" className="mt-1.5 text-xs text-muted-foreground">{translateI18n("copy.revenueHelp")}</p>
          {submitAttempted && revenueError && (
            <p id="project-revenue-error" className="mt-1.5 text-xs text-destructive">{translateI18n(revenueError)}</p>
          )}
        </div>
      </div>
    </section>
  );
}
