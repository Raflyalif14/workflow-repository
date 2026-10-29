import { formatNumber, translate } from "@/i18n";
import type { DashboardHeadSaProjectValues, DashboardSalesPipeline } from "@/types/dashboard";
import { ProjectPipelineSummary } from './sales-pipeline-summary';

type Props = {
  role?: string;
  values?: DashboardHeadSaProjectValues | null;
  loading: boolean;
  hasError: boolean;
  pipeline?: DashboardSalesPipeline | null;
  onRetry?: () => void;
};

export function HeadSaProjectValuesPanel({ role, values, loading, hasError, pipeline, onRetry }: Props) {
  if (role !== "HEAD_SA") return null;

  if (pipeline !== undefined) return (
    <section aria-labelledby="head-sa-project-values-heading" className="space-y-3">
      <div><h2 id="head-sa-project-values-heading" className="text-base font-semibold">{translate('salesPipeline.headTitle')}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{translate('salesPipeline.headScope')}</p></div>
      <ProjectPipelineSummary data={pipeline} loading={loading} hasError={hasError} onRetry={onRetry || (() => {})} />
    </section>
  );

  const message = loading
    ? translate("dashboardPage.loadingProjectValues")
    : hasError
      ? translate("dashboardPage.projectValuesError")
      : !values
        ? translate("dashboardPage.projectValuesUnavailable")
        : null;

  return (
    <section aria-labelledby="head-sa-project-values-heading" className="dashboard-surface p-5 sm:p-6">
      <h2 id="head-sa-project-values-heading" className="text-base font-semibold text-foreground">
        {translate("dashboardPage.headSaProjectValues")}
      </h2>
      {message ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>
      ) : values ? (
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {[
            {
              label: translate("dashboardPage.activeProjectEstimate"),
              help: translate("dashboardPage.activeEstimateHelp"),
              count: values.active.count,
              value: values.active.estimatedRevenue,
            },
            {
              label: translate("dashboardPage.wonProjectContract"),
              help: translate("dashboardPage.wonContractHelp"),
              count: values.won.count,
              value: values.won.finalContractValue,
            },
          ].map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="text-sm text-muted-foreground">{item.label}</dt>
              <dd className="mt-1 break-words text-xl font-semibold tabular-nums text-foreground">
                {formatNumber(item.value, { style: "currency", currency: "IDR", maximumFractionDigits: 0 })}
              </dd>
              <dd className="mt-1 text-sm text-foreground">
                {translate("dashboardPage.projectCount", { count: formatNumber(item.count) })}
              </dd>
              <dd className="mt-1 text-xs text-muted-foreground">{item.help}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
