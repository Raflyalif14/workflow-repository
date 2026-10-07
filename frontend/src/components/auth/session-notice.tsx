"use client";
import { useAuth } from "./auth-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";

export function SessionNotice() {
  const { profileError, retryProfile, isLoading } = useAuth();
  const { t } = useLanguage();
  if (!profileError) return null;
  return <div role="alert" className="flex flex-wrap items-center justify-center gap-3 border-b bg-secondary px-4 py-2 text-sm">
    <span>{t(profileError === "forbidden" ? "auth.sessionForbidden" : "auth.sessionTemporary")}</span>
    <Button size="sm" variant="outline" disabled={isLoading} onClick={() => void retryProfile()}>{t("auth.retrySession")}</Button>
  </div>;
}
