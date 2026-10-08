"use client";

import { RadioTower, Server, Settings, Shield, Workflow } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PersonalNotificationSettings } from "@/components/settings/personal-notification-settings";
import { getAuthSession } from "@/lib/auth";

export default function SettingsPage() {
  const { user } = useAuth();
  const { error, t } = useLanguage();
  const isSystemAdmin = user?.role === "SUPER_ADMIN";

  return (
    <div className="container space-y-6 py-8">
      <div className="border-b border-border/50 pb-6">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <Settings className="h-4 w-4" aria-hidden="true" />
          {t("settings.personal")}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{t("nav.settings")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("settings.personalDescription")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("language.preference")}</CardTitle>
          <CardDescription>{t("language.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <LanguageSwitcher />
          {error && <p className="text-sm text-destructive" role="alert">{t(error)}</p>}
        </CardContent>
      </Card>

      <PersonalNotificationSettings key={`${user?.id ?? "anonymous"}:${getAuthSession()?.id ?? "none"}`} />

      {isSystemAdmin && (
        <section className="space-y-4" aria-labelledby="system-settings-title">
          <div>
            <h2 id="system-settings-title" className="text-xl font-semibold">{t("settings.system")}</h2>
            <p className="text-sm text-muted-foreground">{t("settings.systemDescription")}</p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Workflow className="h-4 w-4" />{t("settings.workflowTemplates")}</CardTitle><CardDescription>{t("settings.workflowDescription")}</CardDescription></CardHeader>
              <CardContent><Link href="/settings/workflows"><Button><Workflow className="mr-2 h-4 w-4" />{t("settings.openWorkflow")}</Button></Link></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><RadioTower className="h-4 w-4" />{t("settings.telegramHealth")}</CardTitle><CardDescription>{t("settings.telegramDescription")}</CardDescription></CardHeader>
              <CardContent><Link href="/settings/telegram-delivery-health"><Button><RadioTower className="mr-2 h-4 w-4" />{t("settings.openTelegram")}</Button></Link></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4" />{t("settings.authentication")}</CardTitle><CardDescription>{t("settings.authenticationDescription")}</CardDescription></CardHeader>
              <CardContent className="space-y-3 text-xs">
                <SettingRow label={t("settings.authenticationProvider")} value="Supabase Auth" />
                <SettingRow label={t("settings.applicationRoles")} value="4 Roles" />
                <SettingRow label={t("settings.profileStorage")} value="Supabase Database" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Server className="h-4 w-4" />{t("settings.repositoryStorage")}</CardTitle><CardDescription>{t("settings.repositoryDescription")}</CardDescription></CardHeader>
              <CardContent className="space-y-3 text-xs">
                <SettingRow label={t("settings.storageProvider")} value="Supabase Storage" success />
                <SettingRow label={t("settings.access")} value="Backend-signed download URLs" />
                <SettingRow label="Bucket" value={t("settings.environmentConfigured")} />
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </div>
  );
}

function SettingRow({ label, value, success = false }: { label: string; value: string; success?: boolean }) {
  return <div className="flex items-center justify-between border-b border-border/30 py-1.5 last:border-0"><span className="text-muted-foreground">{label}</span><Badge variant={success ? "success" : "outline"}>{value}</Badge></div>;
}
