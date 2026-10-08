"use client";

import { Languages } from "lucide-react";
import { useLanguage } from "@/components/i18n/language-provider";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, isLoading, isSaving, t } = useLanguage();
  return (
    <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <Languages className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
      {!compact && <span className="sr-only">{t("language.label")}</span>}
      <select
        aria-label={t("language.label")}
        className="h-10 min-w-0 max-w-full rounded-lg border border-input bg-card px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={locale}
        disabled={isLoading || isSaving}
        onChange={(event) => { void setLocale(event.target.value as "en" | "id").catch(() => undefined); }}
      >
        <option value="en">{t("language.english")}</option>
        <option value="id">{t("language.indonesian")}</option>
      </select>
    </label>
  );
}
