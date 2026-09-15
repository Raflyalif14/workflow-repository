export const BUSINESS_TIMEZONE = "Asia/Jakarta";

export function getLocalDateOnlyKey(date: Date = new Date(), timeZone = BUSINESS_TIMEZONE): string {
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date value");

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  if (!year || !month || !day) throw new Error("Invalid date value");

  return `${year}-${month}-${day}`;
}

export function toDateOnlyKey(date: Date | string): string {
  if (typeof date === "string") {
    const match = date.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  return getLocalDateOnlyKey(new Date(date));
}

export function isInitialSubmissionBeforeEffectiveStart(
  startDate?: string | null,
  isActiveRevision = false,
  today = getLocalDateOnlyKey()
): boolean {
  if (!startDate || isActiveRevision) return false;
  return toDateOnlyKey(startDate) > toDateOnlyKey(today);
}

export function formatMilestoneDate(value?: string | null): string {
  if (!value) return "Date unavailable";
  const dateKey = toDateOnlyKey(value);
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("id-ID", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}
