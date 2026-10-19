"use client";

import { LoaderCircle } from "lucide-react";
import { useLanguage } from "@/components/i18n/language-provider";

export default function Loading() {
  const { t } = useLanguage();

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="space-y-6 py-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
        {t("nav.loadingPage")}
      </p>
      <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
        <div className="h-8 w-48 max-w-full rounded-lg bg-muted" />
        <div className="h-24 rounded-xl bg-muted" />
        <div className="h-64 rounded-xl bg-muted" />
      </div>
    </div>
  );
}
