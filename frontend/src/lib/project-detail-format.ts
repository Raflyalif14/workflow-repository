import { translate as translateI18n, getIntlLocale } from "@/i18n";

export function formatIdr(value: number | null | undefined): string {
  return value === null || value === undefined
    ? translateI18n("common.notAvailable")
    : new Intl.NumberFormat(getIntlLocale(), { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(getIntlLocale(), { dateStyle: "medium" });
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString(getIntlLocale(), { dateStyle: "medium", timeStyle: "short" });
}
