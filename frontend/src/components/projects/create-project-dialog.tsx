"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createProjectFormSchema,
  CreateProjectFormValues,
} from "@/schemas/project.schema";
import { useCreateProject, useScenarios } from "@/hooks/use-projects";
import { Clock, Info } from "lucide-react";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
}: CreateProjectDialogProps) {
  const createProjectMutation = useCreateProject();
  const { data: scenarios = [], isLoading: isLoadingScenarios } = useScenarios();
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateProjectFormValues>({
    resolver: zodResolver(createProjectFormSchema),
    defaultValues: {
      projectCode: "",
      name: "",
      clientName: "",
      description: "",
      scenarioId: "",
      startDate: new Date().toISOString().split("T")[0],
      targetEndDate: "",
    },
  });

  const selectedScenario = scenarios.find((s) => s.id === selectedScenarioId);

  const onSubmit = async (data: CreateProjectFormValues) => {
    try {
      await createProjectMutation.mutateAsync(data);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      alert(err.message || "Failed to create project");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Create New Project (Sales)</DialogTitle>
        <DialogDescription>
          Initiate a new client engagement, select a workflow scenario, and configure timeline deadlines.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Project Code *
            </label>
            <Input
              placeholder="e.g. PRJ-2026-001"
              {...register("projectCode")}
              disabled={isSubmitting}
            />
            {errors.projectCode && (
              <p className="text-xs text-destructive mt-1">{errors.projectCode.message}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Customer / Client Name *
            </label>
            <Input
              placeholder="e.g. Bank Mandiri, Telkomsel"
              {...register("clientName")}
              disabled={isSubmitting}
            />
            {errors.clientName && (
              <p className="text-xs text-destructive mt-1">{errors.clientName.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Project Title *
          </label>
          <Input
            placeholder="e.g. Core Banking Cloud Migration & Sizing"
            {...register("name")}
            disabled={isSubmitting}
          />
          {errors.name && (
            <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
          )}
        </div>

        {/* Scenario Picker */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Select Workflow Scenario *
          </label>
          <select
            {...register("scenarioId")}
            onChange={(e) => {
              setValue("scenarioId", e.target.value);
              setSelectedScenarioId(e.target.value);
            }}
            className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={isSubmitting || isLoadingScenarios}
          >
            <option value="">-- Choose a standard Scenario --</option>
            {scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name} (SLA: {scenario.slaWorkingDays} Working Days)
              </option>
            ))}
          </select>
          {errors.scenarioId && (
            <p className="text-xs text-destructive mt-1">{errors.scenarioId.message}</p>
          )}
        </div>

        {/* Selected Scenario Preview */}
        {selectedScenario && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between font-medium text-primary">
              <span className="flex items-center gap-1.5">
                <Info className="h-4 w-4" />
                <span>Scenario: {selectedScenario.name}</span>
              </span>
              <span className="flex items-center gap-1 font-mono">
                <Clock className="h-3.5 w-3.5" />
                <span>{selectedScenario.slaWorkingDays} Working Days SLA</span>
              </span>
            </div>
            {selectedScenario.stages && selectedScenario.stages.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1 text-muted-foreground">
                <span className="font-semibold text-foreground">Auto-generated Milestones:</span>
                {selectedScenario.stages.map((stage, idx) => (
                  <span key={stage.id} className="bg-background px-2 py-0.5 rounded border border-border">
                    {idx + 1}. {stage.name} ({stage.defaultDurationDays}d)
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Start Date *
            </label>
            <Input
              type="date"
              {...register("startDate")}
              disabled={isSubmitting}
            />
            {errors.startDate && (
              <p className="text-xs text-destructive mt-1">{errors.startDate.message}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Target End Date (Optional)
            </label>
            <Input
              type="date"
              {...register("targetEndDate")}
              placeholder="Auto-calculated from SLA if empty"
              disabled={isSubmitting}
            />
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Leave blank to auto-calculate with holidays & weekends.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Description
          </label>
          <textarea
            rows={2}
            placeholder="Brief scope, client expectations, or business requirements..."
            {...register("description")}
            className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={isSubmitting}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating Project..." : "Create Project"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
