"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Clock3,
  LoaderCircle,
  RadioTower,
  RefreshCw,
  Send,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { RoleGuard } from "@/components/auth/role-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTelegramDeliveryHealth } from "@/hooks/use-notifications";
import type { TelegramDeliveryFailureKind, TelegramDeliveryRecentFailure } from "@/types/notification";

const formatTimestamp = (value: string | null, emptyLabel = "-"): string => {
  if (!value) return emptyLabel;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const failureKindDetails: Record<TelegramDeliveryFailureKind, { title: string; description: string; className: string }> = {
  RETRYABLE: {
    title: "Retryable",
    description: "A definite safe retry condition. The worker may retry it automatically.",
    className: "border-primary/20 text-primary",
  },
  AMBIGUOUS: {
    title: "Ambiguous",
    description: "The delivery outcome is uncertain, so it is not retried automatically to avoid duplicate messages.",
    className: "border-amber-400/20 text-amber-400",
  },
  TERMINAL: {
    title: "Terminal",
    description: "This delivery will not be retried automatically.",
    className: "border-destructive/30 text-destructive",
  },
};

function FailureKindBadge({ kind }: { kind: TelegramDeliveryFailureKind | null }) {
  if (!kind) return <Badge variant="outline">Legacy / Unknown</Badge>;
  if (kind === "RETRYABLE") return <Badge variant="default">Retryable</Badge>;
  if (kind === "AMBIGUOUS") return <Badge variant="warning">Ambiguous</Badge>;
  return <Badge variant="destructive">Terminal</Badge>;
}

function MetricCard({
  label,
  value,
  description,
  icon,
  iconClassName,
  valueClassName = "text-foreground",
}: {
  label: string;
  value: number;
  description: string;
  icon: ReactNode;
  iconClassName: string;
  valueClassName?: string;
}) {
  return (
    <Card className="group h-full border-border/60 bg-card/70 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </CardTitle>
          <CardDescription className="text-[11px] text-muted-foreground/80">{description}</CardDescription>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${iconClassName}`}>
          {icon}
        </span>
      </CardHeader>
      <CardContent>
        <div className={`text-4xl font-bold tracking-tight ${valueClassName}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function RecentFailureRow({ failure }: { failure: TelegramDeliveryRecentFailure }) {
  return (
    <div className="grid gap-3 rounded-xl border border-border/40 bg-muted/10 p-3.5 transition-colors duration-200 hover:border-primary/30 hover:bg-muted/25 md:grid-cols-[minmax(11rem,1.5fr)_auto_repeat(4,minmax(6.5rem,0.8fr))] md:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{failure.notificationType}</p>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Telegram delivery failed</p>
      </div>
      <div>
        <FailureKindBadge kind={failure.failureKind} />
      </div>
      <FailureField label="Attempts" value={String(failure.attemptCount)} />
      <FailureField label="Last attempt" value={formatTimestamp(failure.lastAttemptAt)} />
      <FailureField label="Next retry" value={formatTimestamp(failure.nextRetryAt, "Not scheduled")} />
      <FailureField label="Created" value={formatTimestamp(failure.createdAt)} />
    </div>
  );
}

function FailureField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground md:hidden">{label}</p>
      <p className="mt-0.5 break-words text-xs text-muted-foreground md:mt-0">{value}</p>
    </div>
  );
}

export default function TelegramDeliveryHealthPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN"]}>
      <TelegramDeliveryHealthContent />
    </RoleGuard>
  );
}

function TelegramDeliveryHealthContent() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const { data: health, isLoading, isError, isFetching, refetch } = useTelegramDeliveryHealth(isSuperAdmin);
  const needsAttention = Boolean(health && (health.summary.failed > 0 || health.summary.dueRetryable > 0));

  return (
    <div className="container space-y-6 py-8">
      <div className="flex flex-col gap-5 border-b border-border/60 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <Link href="/settings">
            <Button variant="ghost" size="sm" className="mb-4 -ml-2 gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Settings
            </Button>
          </Link>
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
              <RadioTower className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Operational Monitoring</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Telegram Delivery Health</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review delivery status, retry backlog, and recent Telegram delivery failures.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {health && (
            <div className="text-right text-xs text-muted-foreground" aria-live="polite">
              <p className="font-medium text-foreground">{isFetching ? "Refreshing..." : "Last generated"}</p>
              <p className="mt-0.5">{formatTimestamp(health.generatedAt)}</p>
            </div>
          )}
          <Button variant="outline" className="gap-2" disabled={!isSuperAdmin || isFetching} onClick={() => void refetch()}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-36 animate-pulse rounded-xl border border-border/60 bg-card/70" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-xl border border-border/60 bg-card/70" />
            ))}
          </div>
        </div>
      ) : isError || !health ? (
        <Card className="border-border/60 bg-card/70 shadow-sm">
          <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 px-5 text-center">
            <CircleAlert className="h-6 w-6 text-destructive" aria-hidden="true" />
            <div>
              <p className="text-base font-semibold tracking-tight text-foreground">Unable to load Telegram delivery health.</p>
              <p className="mt-1 text-sm text-muted-foreground">Refresh to request the latest operational data.</p>
            </div>
            <Button variant="outline" className="gap-2" onClick={() => void refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/70 px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${needsAttention ? "border-amber-400/20 bg-amber-400/10 text-amber-400" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-400"}`}>
                {needsAttention ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{needsAttention ? "Needs Attention" : "Operational"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {needsAttention ? "Review failed deliveries and the retry backlog." : "No failed or due retryable Telegram deliveries."}
                </p>
              </div>
            </div>
            <Badge variant={needsAttention ? "warning" : "success"}>{needsAttention ? "Attention" : "Operational"}</Badge>
          </div>

          <section className="space-y-3" aria-labelledby="telegram-delivery-summary">
            <div>
              <h2 id="telegram-delivery-summary" className="text-base font-semibold tracking-tight text-foreground">Delivery Summary</h2>
              <p className="mt-1 text-xs text-muted-foreground">Current aggregate state for Telegram delivery records.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Total" value={health.summary.total} description="All Telegram deliveries" icon={<Activity className="h-4 w-4 text-primary" />} iconClassName="border-primary/15 bg-primary/10" />
              <MetricCard label="Sent" value={health.summary.sent} description="Recorded as delivered" icon={<Send className="h-4 w-4 text-emerald-400" />} iconClassName="border-emerald-400/15 bg-emerald-400/10" valueClassName="text-emerald-400" />
              <MetricCard label="Pending" value={health.summary.pending} description="Awaiting a result" icon={<Clock3 className="h-4 w-4 text-amber-400" />} iconClassName="border-amber-400/15 bg-amber-400/10" valueClassName="text-amber-400" />
              <MetricCard label="Failed" value={health.summary.failed} description="All failed deliveries" icon={<AlertTriangle className="h-4 w-4 text-destructive" />} iconClassName="border-destructive/30 bg-destructive/10" valueClassName="text-destructive" />
            </div>
          </section>

          <section className="space-y-3" aria-labelledby="telegram-delivery-failure-summary">
            <div>
              <h2 id="telegram-delivery-failure-summary" className="text-base font-semibold tracking-tight text-foreground">Failure and Retry State</h2>
              <p className="mt-1 text-xs text-muted-foreground">Classification is supplied by the backend delivery lifecycle.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Retryable" value={health.summary.retryable} description="Eligible retry classification" icon={<RefreshCw className="h-4 w-4 text-primary" />} iconClassName="border-primary/15 bg-primary/10" valueClassName="text-primary" />
              <MetricCard label="Ambiguous" value={health.summary.ambiguous} description="Outcome cannot be confirmed" icon={<CircleAlert className="h-4 w-4 text-amber-400" />} iconClassName="border-amber-400/15 bg-amber-400/10" valueClassName="text-amber-400" />
              <MetricCard label="Terminal" value={health.summary.terminal} description="No automatic retry" icon={<ShieldAlert className="h-4 w-4 text-destructive" />} iconClassName="border-destructive/30 bg-destructive/10" valueClassName="text-destructive" />
              <MetricCard label="Due Retry" value={health.summary.dueRetryable} description="Retryable records now due" icon={<Clock3 className="h-4 w-4 text-destructive" />} iconClassName="border-destructive/30 bg-destructive/10" valueClassName="text-destructive" />
            </div>
          </section>

          <Card className="border-border/60 bg-card/70 shadow-sm">
            <CardHeader className="space-y-3 border-b border-border/40">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                  <CircleAlert className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <CardTitle className="text-base font-semibold tracking-tight">Failure Classification</CardTitle>
                  <CardDescription className="mt-1 text-xs">How the delivery lifecycle treats each failure kind.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 pt-5 md:grid-cols-3">
              {(Object.keys(failureKindDetails) as TelegramDeliveryFailureKind[]).map((kind) => {
                const detail = failureKindDetails[kind];
                return (
                  <div key={kind} className="space-y-2 border-l-2 pl-3 first:border-primary/20 md:first:border-primary/20" >
                    <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${detail.className}`}>{detail.title}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{detail.description}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/40">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10 text-destructive">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <CardTitle className="text-base font-semibold tracking-tight">Recent Delivery Failures</CardTitle>
                  <CardDescription className="mt-1 text-xs">Newest Telegram failures first, limited to the latest 20 records.</CardDescription>
                </div>
              </div>
              <Badge variant="outline">{health.recentFailures.length} shown</Badge>
            </CardHeader>
            {health.recentFailures.length === 0 ? (
              <CardContent className="space-y-3 py-14 text-center">
                <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-400" aria-hidden="true" />
                <div>
                  <p className="text-base font-semibold tracking-tight text-foreground">No recent Telegram delivery failures.</p>
                  <p className="mt-1 text-xs text-muted-foreground">New failures will appear here when reported by the delivery lifecycle.</p>
                </div>
              </CardContent>
            ) : (
              <CardContent className="space-y-2 pt-5">
                <div className="hidden grid-cols-[minmax(11rem,1.5fr)_auto_repeat(4,minmax(6.5rem,0.8fr))] gap-3 px-3.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground md:grid">
                  <span>Notification type</span>
                  <span>Classification</span>
                  <span>Attempts</span>
                  <span>Last attempt</span>
                  <span>Next retry</span>
                  <span>Created</span>
                </div>
                {health.recentFailures.map((failure) => <RecentFailureRow key={failure.deliveryId} failure={failure} />)}
              </CardContent>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
