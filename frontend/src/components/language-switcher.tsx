"use client";

import { Languages } from "lucide-react";
import { useLanguage } from "@/components/i18n/language-provider";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, isLoading, isSaving, t } = useLanguage();
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!compact && <span className="sr-only">{t("language.label")}</span>}
      <select
        aria-label={t("language.label")}
        className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
