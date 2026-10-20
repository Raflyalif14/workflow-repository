"use client";

import { ArrowLeft } from "lucide-react";
import { translate } from "@/i18n";
import { Button } from "@/components/ui/button";

export interface ProjectCreateHeaderProps {
  onBack: () => void;
  disabled?: boolean;
}

export function ProjectCreateHeader({ onBack, disabled = false }: ProjectCreateHeaderProps) {
  return (
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          {translate("copy.salesWorkspace")}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">
          {translate("project.create")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {translate("projectCreate.intro")}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2 sm:w-auto"
        onClick={onBack}
        disabled={disabled}
      >
        <ArrowLeft className="h-4 w-4" />
        {translate("copy.backToProject")}
      </Button>
    </header>
  );
}
