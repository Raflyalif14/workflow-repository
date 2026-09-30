"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOutputOutboxHealth, useRetryStorageCleanup, useStorageCleanupHealth } from "@/hooks/use-operational-health";
import { getIntlLocale, translate as t } from "@/i18n";
import { canRetryStorageCleanup } from "@/lib/operational-health";
import type { StorageCleanupFilter } from "@/types/operational-health";

const date = (value: string | null) => value
  ? new Intl.DateTimeFormat(getIntlLocale(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : t("operations.notAvailable");
const number = (value: number) => new Intl.NumberFormat(getIntlLocale()).format(value);
const age = (seconds: number | null) => seconds === null ? t("operations.notAvailable")
  : seconds >= 86_400 ? t("operations.ageDays", { count: number(Math.floor(seconds / 86_400)) })
  : seconds >= 3_600 ? t("operations.ageHours", { count: number(Math.floor(seconds / 3_600)) })
  : t("operations.ageMinutes", { count: number(Math.floor(seconds / 60)) });

function Pagination({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (page: number) => void }) {
  return <nav aria-label={t("operations.pagination")} className="flex items-center justify-end gap-2 text-sm">
    <span className="mr-auto text-muted-foreground">{t("operations.pageOf", { page, total: totalPages })}</span>
    <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("operations.previous")}</Button>
    <Button type="button" size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{t("operations.next")}</Button>
  </nav>;
}

export function OutputOutboxPanel({ enabled }: { enabled: boolean }) {
  useLanguage();
  const [page, setPage] = useState(1);
  const query = useOutputOutboxHealth(page, enabled);
  useEffect(() => { if (query.data && page > query.data.totalPages) setPage(query.data.totalPages); }, [page, query.data]);
  const summary = query.data?.summary;
  return <Card>
    <CardHeader className="flex flex-row items-center justify-between gap-3">
      <div><CardTitle>{t("operations.outboxTitle")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{t("operations.outboxHelp")}</p></div>
      <Button type="button" variant="outline" size="sm" disabled={!enabled || query.isFetching} onClick={() => void query.refetch()}>{t("operations.refresh")}</Button>
    </CardHeader>
    <CardContent className="space-y-4">
      {query.isLoading ? <p className="text-sm text-muted-foreground">{t("operations.loadingOutbox")}</p>
        : query.isError || !query.data ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{t("operations.outboxError")}</p><Button variant="outline" size="sm" onClick={() => void query.refetch()}>{t("common.retry")}</Button></div>
        : <>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-muted-foreground">{t("operations.pending")}</dt><dd className="font-semibold">{number(summary!.pending)}</dd></div>
            <div><dt className="text-muted-foreground">{t("operations.previouslyFailed")}</dt><dd className="font-semibold">{number(summary!.previouslyFailed)}</dd></div>
            <div><dt className="text-muted-foreground">{t("operations.oldestPending")}</dt><dd className="font-semibold">{age(summary!.oldestAgeSeconds)}</dd><dd className="text-xs text-muted-foreground">{date(summary!.oldestCreatedAt)}</dd></div>
            <div><dt className="text-muted-foreground">{t("operations.latestAttempt")}</dt><dd className="font-semibold">{date(summary!.latestAttemptAt)}</dd></div>
          </dl>
          {query.data.items.length === 0 ? <p className="border-t pt-4 text-sm text-muted-foreground">{t("operations.noPending")}</p>
            : <div className="divide-y border-t">
              {query.data.items.map((item) => <div key={item.id} className="grid min-w-0 gap-2 py-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div className="min-w-0"><span className="text-muted-foreground">{t("operations.jobId")}</span><p className="break-all font-medium">{item.id}</p><p>{date(item.createdAt)}</p></div>
                <div><span className="text-muted-foreground">{t("operations.attempts")}</span><p>{number(item.attemptCount)}</p><p>{date(item.lastAttemptAt)}</p></div>
                <div><span className="text-muted-foreground">{t("operations.category")}</span><p>{item.errorCategory || t("operations.notAvailable")}</p><p>SQLSTATE: {item.sqlstate || t("operations.notAvailable")}</p></div>
                <div className="min-w-0"><span className="text-muted-foreground">{t("operations.operation")}</span><p className="break-all">{item.errorOperation || t("operations.notAvailable")}</p></div>
              </div>)}
            </div>}
          <Pagination page={page} totalPages={query.data.totalPages} setPage={setPage} />
        </>}
    </CardContent>
  </Card>;
}

export function StorageCleanupPanel({ enabled }: { enabled: boolean }) {
  useLanguage();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StorageCleanupFilter>("ALL");
  const [rowError, setRowError] = useState<string | null>(null);
  const query = useStorageCleanupHealth(page, status, enabled);
  const retry = useRetryStorageCleanup();
  useEffect(() => { if (query.data && page > query.data.totalPages) setPage(query.data.totalPages); }, [page, query.data]);
  const retryRow = async (id: string) => {
    setRowError(null);
    try { await retry.mutateAsync(id); }
    catch { setRowError(id); }
  };
  return <Card>
    <CardHeader className="flex flex-row items-center justify-between gap-3">
      <div><CardTitle>{t("operations.cleanupTitle")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{t("operations.cleanupHelp")}</p></div>
      <Button type="button" variant="outline" size="sm" disabled={!enabled || query.isFetching} onClick={() => void query.refetch()}>{t("operations.refresh")}</Button>
    </CardHeader>
    <CardContent className="space-y-4">
      {query.isLoading ? <p className="text-sm text-muted-foreground">{t("operations.loadingCleanup")}</p>
        : query.isError || !query.data ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{t("operations.cleanupError")}</p><Button variant="outline" size="sm" onClick={() => void query.refetch()}>{t("common.retry")}</Button></div>
        : <>
          <dl className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
            {(["total", "pending", "failed", "completed"] as const).map((key) => <div key={key}><dt className="text-muted-foreground">{t(`operations.${key}`)}</dt><dd className="font-semibold">{number(query.data!.summary[key])}</dd></div>)}
          </dl>
          <label className="block text-sm">{t("operations.filterStatus")}
            <select className="ml-2 rounded-md border border-border bg-background px-2 py-1" value={status} onChange={(event) => { setStatus(event.target.value as StorageCleanupFilter); setPage(1); setRowError(null); }}>
              {(["ALL", "PENDING", "FAILED", "COMPLETED"] as const).map((value) => <option key={value} value={value}>{t(`operations.status${value}`)}</option>)}
            </select>
          </label>
          {query.data.items.length === 0 ? <p className="border-t pt-4 text-sm text-muted-foreground">{t("operations.noCleanups")}</p>
            : <div className="divide-y border-t">{query.data.items.map((item) => <div key={item.id} className="grid min-w-0 gap-2 py-3 text-xs sm:grid-cols-2 lg:grid-cols-4 lg:items-center">
              <div className="min-w-0"><span className="text-muted-foreground">{t("operations.jobId")}</span><p className="break-all font-medium">{item.id}</p><p>{date(item.createdAt)}</p></div>
              <div><p>{t(`operations.status${item.status}`)}</p><p>{t("operations.objects")}: {number(item.storageObjectCount)}</p><p>{t("operations.attempts")}: {t("operations.notTracked")}</p></div>
              <div><p>{t("operations.updated")}: {date(item.updatedAt)}</p><p>{t("operations.failureCode")}: {item.failureCode || t("operations.notAvailable")}</p></div>
              <div className="space-y-1 lg:text-right">{canRetryStorageCleanup(item.status) && <Button type="button" size="sm" variant="outline" disabled={retry.isPending || !enabled} onClick={() => void retryRow(item.id)}>{retry.isPending && retry.variables === item.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}{retry.isPending && retry.variables === item.id ? t("operations.retrying") : t("operations.retryCleanup")}</Button>}{rowError === item.id && <p role="alert" className="text-destructive">{t("operations.retryError")}</p>}</div>
            </div>)}</div>}
          <Pagination page={page} totalPages={query.data.totalPages} setPage={setPage} />
        </>}
    </CardContent>
  </Card>;
}
