import { formatNumber, translate } from "@/i18n";
import type { DashboardHeadSaProjectValues } from "@/types/dashboard";

type Props = {
  role?: string;
  values?: DashboardHeadSaProjectValues | null;
  loading: boolean;
  hasError: boolean;
};

export function HeadSaProjectValuesPanel({ role, values, loading, hasError }: Props) {
  if (role !== "HEAD_SA") return null;

  const message = loading
    ? translate("dashboardPage.loadingProjectValues")
    : hasError
      ? translate("dashboardPage.projectValuesError")
      : !values
        ? translate("dashboardPage.projectValuesUnavailable")
        : null;

  return (
    <section aria-labelledby="head-sa-project-values-heading" className="rounded-xl border border-border bg-card p-5">
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
