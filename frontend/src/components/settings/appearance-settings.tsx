"use client";

import { Check, Moon, Sun } from "lucide-react";
import { useLanguage } from "@/components/i18n/language-provider";
import { useTheme } from "@/components/theme/theme-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AppearanceSettings() {
  const { t } = useLanguage();
  const { theme, ready, storageError, setTheme } = useTheme();
  return <Card id="appearance">
    <CardHeader><CardTitle className="text-base">{t("appearance.title")}</CardTitle><CardDescription>{t("appearance.description")}</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      <div className="grid max-w-xl grid-cols-2 gap-3" role="group" aria-label={t("appearance.title")}>
        {(["light", "dark"] as const).map(option => {
          const Icon = option === "light" ? Sun : Moon;
          return <button key={option} type="button" data-theme-option={option} disabled={!ready} aria-pressed={ready && theme === option} onClick={() => setTheme(option)}
            className={`min-w-0 rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring ${ready && theme === option ? "border-primary bg-primary-soft ring-1 ring-primary" : "border-border bg-card hover:bg-muted"}`}>
            <span aria-hidden="true" className={`mb-3 flex h-20 overflow-hidden rounded-lg border ${option === "dark" ? "border-slate-600 bg-slate-950" : "border-slate-200 bg-slate-100"}`}>
              <span className={`w-1/4 border-r p-2 ${option === "dark" ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}><span className="block h-2 w-full rounded bg-blue-500" /></span>
              <span className="flex flex-1 flex-col gap-2 p-3"><span className={`h-2 w-2/3 rounded ${option === "dark" ? "bg-slate-600" : "bg-slate-300"}`} /><span className={`flex-1 rounded ${option === "dark" ? "bg-slate-800" : "bg-white"}`} /></span>
            </span>
            <span className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{t(`appearance.${option}`)}{ready && theme === option && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}</span>
          </button>;
        })}
      </div>
      <p className="text-xs text-muted-foreground">{t("appearance.localHelp")}</p>
      {storageError && <p className="text-sm text-warning" role="alert">{t("appearance.storageError")}</p>}
    </CardContent>
  </Card>;
}
