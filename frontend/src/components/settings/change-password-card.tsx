"use client";

import { useState } from "react";
import { AlertCircle, Check, CheckCircle2, Eye, EyeOff, KeyRound, Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/i18n/language-provider";
import { apiClient } from "@/lib/api-client";

export function ChangePasswordCard() {
  const { t } = useLanguage();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Password rules validation
  const rules = {
    minLength: newPassword.length >= 12,
    uppercase: /[A-Z]/.test(newPassword),
    lowercase: /[a-z]/.test(newPassword),
    number: /[0-9]/.test(newPassword),
    special: /[^A-Za-z0-9]/.test(newPassword),
  };
  const isAllRulesPassed = Object.values(rules).every(Boolean);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!currentPassword) {
      setError(t("changePassword.currentPasswordPlaceholder"));
      return;
    }
    if (newPassword.length < 12) {
      setError(t("changePassword.errorMinLength"));
      return;
    }
    if (newPassword === currentPassword) {
      setError(t("changePassword.errorSame"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("changePassword.errorMismatch"));
      return;
    }

    setLoading(true);
    try {
      await apiClient<{ message: string }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      setSuccess(t("changePassword.success"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("incorrect") || msg.includes("Current password")) {
        setError(t("changePassword.errorCurrentIncorrect"));
      } else if (msg.includes("different")) {
        setError(t("changePassword.errorSame"));
      } else if (msg.includes("characters") || msg.includes("policy")) {
        setError(t("changePassword.errorMinLength"));
      } else {
        setError(msg || t("changePassword.errorGeneric"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card id="change-password" className="border-border/70 shadow-sm scroll-mt-6" data-testid="change-password-card">
      <CardHeader className="border-b border-border/50 pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
          <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
          {t("changePassword.title")}
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          {t("changePassword.description")}
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
          {/* Success banner */}
          {success && (
            <div
              role="status"
              className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
              <span>{success}</span>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-medium text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Current password */}
          <div className="space-y-1.5">
            <label
              htmlFor="input-current-password"
              className="text-xs font-medium text-foreground flex items-center justify-between"
            >
              <span>{t("changePassword.currentPassword")}</span>
            </label>
            <div className="relative">
              <Input
                id="input-current-password"
                type={showCurrent ? "text" : "password"}
                placeholder={t("changePassword.currentPasswordPlaceholder")}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
                className="pr-10 text-sm"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                aria-label={t(showCurrent ? "changePassword.hidePassword" : "changePassword.showPassword")}
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div className="space-y-1.5">
            <label
              htmlFor="input-new-password"
              className="text-xs font-medium text-foreground flex items-center justify-between"
            >
              <span>{t("changePassword.newPassword")}</span>
            </label>
            <div className="relative">
              <Input
                id="input-new-password"
                type={showNew ? "text" : "password"}
                placeholder={t("changePassword.newPasswordPlaceholder")}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                disabled={loading}
                className="pr-10 text-sm"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                aria-label={t(showNew ? "changePassword.hidePassword" : "changePassword.showPassword")}
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Password complexity requirement checklist */}
          {newPassword && (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-1.5 text-[11px]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <span className={`flex items-center gap-1.5 ${rules.minLength ? "text-emerald-500 font-medium" : "text-muted-foreground"}`}>
                  <Check className={`h-3 w-3 ${rules.minLength ? "text-emerald-500" : "opacity-30"}`} />
                  {t("changePassword.ruleMinLength")}
                </span>
                <span className={`flex items-center gap-1.5 ${rules.uppercase ? "text-emerald-500 font-medium" : "text-muted-foreground"}`}>
                  <Check className={`h-3 w-3 ${rules.uppercase ? "text-emerald-500" : "opacity-30"}`} />
                  {t("changePassword.ruleUppercase")}
                </span>
                <span className={`flex items-center gap-1.5 ${rules.lowercase ? "text-emerald-500 font-medium" : "text-muted-foreground"}`}>
                  <Check className={`h-3 w-3 ${rules.lowercase ? "text-emerald-500" : "opacity-30"}`} />
                  {t("changePassword.ruleLowercase")}
                </span>
                <span className={`flex items-center gap-1.5 ${rules.number ? "text-emerald-500 font-medium" : "text-muted-foreground"}`}>
                  <Check className={`h-3 w-3 ${rules.number ? "text-emerald-500" : "opacity-30"}`} />
                  {t("changePassword.ruleNumber")}
                </span>
                <span className={`flex items-center gap-1.5 sm:col-span-2 ${rules.special ? "text-emerald-500 font-medium" : "text-muted-foreground"}`}>
                  <Check className={`h-3 w-3 ${rules.special ? "text-emerald-500" : "opacity-30"}`} />
                  {t("changePassword.ruleSpecial")}
                </span>
              </div>
            </div>
          )}

          {/* Confirm new password */}
          <div className="space-y-1.5">
            <label
              htmlFor="input-confirm-password"
              className="text-xs font-medium text-foreground flex items-center justify-between"
            >
              <span>{t("changePassword.confirmPassword")}</span>
            </label>
            <div className="relative">
              <Input
                id="input-confirm-password"
                type={showConfirm ? "text" : "password"}
                placeholder={t("changePassword.confirmPasswordPlaceholder")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                disabled={loading}
                className="pr-10 text-sm"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                aria-label={t(showConfirm ? "changePassword.hidePassword" : "changePassword.showPassword")}
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={loading || !currentPassword || !newPassword || !confirmPassword || !isAllRulesPassed}
              className="gap-2 text-xs font-medium min-w-36"
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              {t(loading ? "changePassword.submitting" : "changePassword.submit")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
