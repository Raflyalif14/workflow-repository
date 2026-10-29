import { CheckCircle2, FolderKanban, Layers3 } from 'lucide-react';
import { formatNumber, translate } from '@/i18n';
import { formatRevenue } from '@/lib/dashboard-overview';
import type { DashboardSalesPipeline } from '@/types/dashboard';

export function ProjectPipelineSummary({ data, loading, hasError, onRetry }: {
  data?: DashboardSalesPipeline | null; loading: boolean; hasError: boolean; onRetry: () => void;
}) {
  if (loading && !data) return <p role="status" className="dashboard-surface p-5 text-sm text-muted-foreground">{translate('salesPipeline.loading')}</p>;
  if (!data || hasError) return <div role="alert" className="dashboard-surface p-5 text-sm text-muted-foreground">
    <p>{translate('salesPipeline.unavailable')}</p><button type="button" onClick={onRetry} className="mt-2 min-h-9 rounded-lg px-3 text-primary hover:bg-primary-soft">{translate('common.retry')}</button>
  </div>;
  const value = (label: string, count: number, tone = '') => <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className={`mt-0.5 text-xl font-semibold tabular-nums ${tone}`}>{formatNumber(count)}</dd></div>;
  const revenue = (label: string, amount: number) => <div className="mt-auto border-t border-border pt-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words text-base font-semibold tabular-nums">{formatRevenue(amount)}</p></div>;
  return <div data-testid="sales-pipeline-summary">
    <div className="grid min-w-0 gap-3 xl:grid-cols-3">
      <section aria-labelledby="sales-pra-heading" className="dashboard-surface flex min-w-0 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2"><h3 id="sales-pra-heading" className="text-sm font-semibold">Pra-Tender</h3><FolderKanban className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /></div>
        <dl className="grid grid-cols-2 gap-3">{value('Active', data.preTender.active)}{value('Postponed', data.preTender.postponed)}</dl>
        {revenue('Estimated Revenue', data.preTender.estimatedRevenue)}
      </section>
      <section aria-labelledby="sales-tender-heading" className="dashboard-surface flex min-w-0 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2"><h3 id="sales-tender-heading" className="text-sm font-semibold">On Submission Tender</h3><Layers3 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /></div>
        <dl className="flex items-center justify-between gap-3 rounded-lg bg-primary-soft px-3 py-2 text-primary"><dt className="text-xs">{translate('salesPipeline.transition')}</dt><dd className="text-lg font-semibold tabular-nums">{formatNumber(data.submissionTender.advancedFromPreTender)}</dd></dl>
        <dl className="grid grid-cols-2 gap-3">{value('On Progress Tender', data.submissionTender.inProgress)}{value('Waiting Result', data.submissionTender.waitingResult)}{data.submissionTender.postponed > 0 && value('Postponed', data.submissionTender.postponed)}</dl>
        {revenue('Estimated Revenue', data.submissionTender.estimatedRevenue)}
      </section>
      <section aria-labelledby="sales-result-heading" className="dashboard-surface flex min-w-0 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2"><h3 id="sales-result-heading" className="text-sm font-semibold">{translate('salesPipeline.results')}</h3><CheckCircle2 className="h-4 w-4 shrink-0 text-[hsl(var(--success))]" aria-hidden="true" /></div>
        <dl className="grid grid-cols-2 gap-3">{value('WON', data.results.won, 'text-[hsl(var(--success))]')}{value('LOST', data.results.lost, 'text-destructive')}</dl>
        {revenue('Final Revenue', data.results.finalRevenue)}
      </section>
    </div>
    <details className="mt-2 px-2 text-xs text-muted-foreground">
      <summary className="w-fit cursor-pointer rounded py-1 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{translate('salesPipeline.details')}</summary>
      <div className="mt-2 space-y-2 leading-5"><p>{translate('salesPipeline.preHelp')} {translate('salesPipeline.preEstimateHelp')}</p><p>{translate('salesPipeline.transitionHelp')} {translate('salesPipeline.tenderHelp')} {translate('salesPipeline.estimateHelp')}</p><p>{translate('salesPipeline.resultsHelp')}</p></div>
    </details>
  </div>;
}

export const SalesPipelineSummary = ProjectPipelineSummary;
