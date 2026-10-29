import { BarChart3, type LucideIcon } from 'lucide-react';
import { formatNumber, translate } from '@/i18n';

export type ListSummaryItem = {
  label: string; value: number | string; scope: string; icon: LucideIcon; primary?: boolean;
};

export function ListSummary({ 'aria-label': label, description, items, loading = false, hasError = false, refreshing = false }: {
  'aria-label': string; description: string; items: ListSummaryItem[];
  loading?: boolean; hasError?: boolean; refreshing?: boolean;
}) {
  const unavailable = loading || hasError;
  return <section aria-label={label} className="page-surface min-w-0 overflow-hidden" data-testid="list-summary">
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 px-4 py-3 sm:px-5">
      <div className="min-w-0"><h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><BarChart3 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{label}</h2>
      <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">{description}</p></div>
      {(unavailable || refreshing) && <p role={hasError ? 'alert' : 'status'} className={`text-xs ${hasError ? 'text-destructive' : 'text-muted-foreground'}`}>{translate(hasError ? 'listSummary.unavailable' : loading ? 'common.loading' : 'listSummary.refreshing')}</p>}
    </div>
    <dl className="grid min-w-0 grid-cols-2 xl:grid-cols-4">{items.map((item, index) => {
      const Icon = item.icon;
      return <div key={item.label} className={`min-w-0 border-border/60 px-4 py-3 sm:px-5 ${index % 2 ? 'border-l' : ''} ${index >= 2 ? 'border-t' : ''} ${index ? 'xl:border-l' : ''} xl:border-t-0 ${item.primary ? 'bg-primary/5' : ''}`}>
        <div className="flex min-h-10 items-start justify-between gap-2"><dt className="min-w-0 text-xs font-medium leading-5 text-foreground">{item.label}</dt><Icon className={`mt-0.5 h-4 w-4 shrink-0 ${item.primary ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" /></div>
        <dd><p data-summary-value={unavailable ? undefined : item.value} className={`mt-1 text-2xl font-semibold tabular-nums ${item.primary ? 'text-primary' : 'text-foreground'}`}>{unavailable ? '—' : typeof item.value === 'number' ? formatNumber(item.value) : item.value}</p>
        <p className={`mt-1 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-4 ${item.primary ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{item.scope}</p></dd>
      </div>;
    })}</dl>
  </section>;
}
