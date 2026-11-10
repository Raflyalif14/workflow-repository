"use client";

import { useEffect, useRef } from "react";
import {
  Trophy,
  XCircle,
  Sparkles,
  Calendar,
  User,
  Building2,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  FileCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { translate as translateI18n } from "@/i18n";
import { formatDate, formatIdr } from "@/lib/project-detail-format";
import { triggerWonConfetti } from "@/lib/confetti";
import type { Project } from "@/types/project";

type ProjectResultCardProps = {
  project: Project;
};

export function ProjectResultCard({ project }: ProjectResultCardProps) {
  const hasTriggeredInitialConfetti = useRef(false);

  // Trigger confetti once on initial mount if project is WON
  useEffect(() => {
    if (project.status === "WON" && !hasTriggeredInitialConfetti.current) {
      hasTriggeredInitialConfetti.current = true;
      // Slight delay for smooth visual transition
      const timer = setTimeout(() => {
        triggerWonConfetti();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [project.status]);

  if (project.status !== "WON" && project.status !== "LOST") {
    return null;
  }

  const isWon = project.status === "WON";
  const finalValue = project.final_contract_value;
  const estimatedRevenue = project.estimated_revenue;

  // Calculate variance if both numbers are valid
  const variance = (() => {
    if (!isWon || finalValue == null || estimatedRevenue == null || estimatedRevenue <= 0) {
      return null;
    }
    const diff = finalValue - estimatedRevenue;
    const pct = Math.round((Math.abs(diff) / estimatedRevenue) * 100);
    return {
      diff,
      pct,
      isHigher: diff > 0,
      isLower: diff < 0,
      isMatch: diff === 0,
    };
  })();

  const salesName = project.sales?.fullName || project.sales?.full_name || "-";
  const saName = project.pic?.fullName || project.pic?.full_name || "-";
  const decidedDate = project.outcome_decided_at || project.updated_at;

  if (isWon) {
    return (
      <Card className="overflow-hidden border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-background shadow-md">
        <CardContent className="p-5 sm:p-6 space-y-5">
          {/* Header with Title and Celebrate Button */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-inner">
                <Trophy className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold tracking-tight text-foreground">
                    {translateI18n("projectResultCard.wonTitle")}
                  </h2>
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-semibold gap-1 text-[11px]">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>WON</span>
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {translateI18n("projectResultCard.wonSubtitle")}
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => triggerWonConfetti()}
              className="self-start shrink-0 gap-1.5 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-medium text-xs rounded-xl"
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{translateI18n("projectResultCard.celebrateAgain")}</span>
            </Button>
          </div>

          {/* Key Value & Details Grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-1">
            {/* Final Contract Value Card */}
            <div className="rounded-xl border border-emerald-500/30 bg-card p-3.5 space-y-1 shadow-sm">
              <p className="text-xs font-semibold text-muted-foreground">
                {translateI18n("projectResultCard.finalValue")}
              </p>
              <p className="text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatIdr(finalValue, 2)}
              </p>
              {variance && (
                <div className="pt-1">
                  {variance.isHigher ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      <TrendingUp className="h-3 w-3" />
                      <span>{translateI18n("projectResultCard.varianceAbove", { diff: formatIdr(variance.diff, 0), pct: variance.pct })}</span>
                    </span>
                  ) : variance.isLower ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                      <TrendingDown className="h-3 w-3" />
                      <span>{translateI18n("projectResultCard.varianceBelow", { diff: formatIdr(Math.abs(variance.diff), 0), pct: variance.pct })}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      {translateI18n("projectResultCard.varianceMatch")}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Sales PIC */}
            <div className="rounded-xl border border-border/60 bg-card p-3.5 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-primary" />
                <span>{translateI18n("projectResultCard.salesOwner")}</span>
              </p>
              <p className="text-sm font-semibold text-foreground truncate">{salesName}</p>
              <p className="text-[11px] text-muted-foreground truncate">{project.customer || "-"}</p>
            </div>

            {/* Solution Architect */}
            <div className="rounded-xl border border-border/60 bg-card p-3.5 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                <span>{translateI18n("projectResultCard.solutionArchitect")}</span>
              </p>
              <p className="text-sm font-semibold text-foreground truncate">{saName}</p>
              <p className="text-[11px] text-muted-foreground">{project.active_scenario?.name || project.scenario?.name || "-"}</p>
            </div>

            {/* Decided At */}
            <div className="rounded-xl border border-border/60 bg-card p-3.5 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span>{translateI18n("projectResultCard.decidedAt")}</span>
              </p>
              <p className="text-sm font-semibold text-foreground">{formatDate(decidedDate)}</p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <FileCheck className="h-3 w-3" />
                <span>Evidence Attached</span>
              </p>
            </div>
          </div>

          {/* Footer Note */}
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300 border border-emerald-500/20">
            <Sparkles className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="leading-relaxed">
              {translateI18n("projectResultCard.evidenceNote")}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // LOST STATE
  return (
    <Card className="overflow-hidden border-2 border-border/80 bg-card shadow-sm">
      <CardContent className="p-5 sm:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 shadow-inner">
            <XCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                {translateI18n("projectResultCard.lostTitle")}
              </h2>
              <Badge variant="destructive" className="font-semibold text-[11px]">
                LOST
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {translateI18n("projectResultCard.lostSubtitle")}
            </p>
          </div>
        </div>

        {/* Loss Reason Callout */}
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-1.5">
          <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
            <span>{translateI18n("projectResultCard.lossReasonTitle")}</span>
          </p>
          <blockquote className="text-sm font-medium italic text-foreground leading-relaxed pl-2 border-l-2 border-destructive/40">
            &ldquo;{project.loss_reason || translateI18n("common.notAvailable")}&rdquo;
          </blockquote>
        </div>

        {/* Details Grid */}
        <div className="grid gap-3 sm:grid-cols-3 pt-1">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">{translateI18n("projectResultCard.initialEstimate")}</p>
            <p className="text-base font-semibold text-foreground tabular-nums">
              {formatIdr(estimatedRevenue, 2)}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">{translateI18n("projectResultCard.salesOwner")}</p>
            <p className="text-sm font-semibold text-foreground truncate">{salesName}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">{translateI18n("projectResultCard.decidedAt")}</p>
            <p className="text-sm font-semibold text-foreground">{formatDate(decidedDate)}</p>
          </div>
        </div>

        {/* Footer Note */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          💡 {translateI18n("projectResultCard.evaluationNote")}
        </p>
      </CardContent>
    </Card>
  );
}

