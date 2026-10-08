"use client";

import React, { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Layers,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { TranslationKey } from "@/i18n";

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, user } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [nextPath, setNextPath] = useState("/");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (next?.startsWith("/")) setNextPath(next);
  }, []);
  useEffect(() => {
    if (isAuthenticated) {
      router.replace(user?.mustChangePassword ? "/change-password" : nextPath);
    }
  }, [isAuthenticated, nextPath, router, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const loggedInUser = await login({ email, password });
      router.replace(loggedInUser.mustChangePassword ? "/change-password" : nextPath);
    } catch (err) {
      setError("auth.loginError");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto flex w-full max-w-5xl justify-end"><LanguageSwitcher /></div>
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center gap-8 lg:grid-cols-[1fr_420px]">
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">WorkflowHub</p>
              <p className="text-xs text-muted-foreground">{t("auth.enterprisePlatform")}</p>
            </div>
          </div>

          <div className="max-w-xl space-y-3">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {t("auth.loginHeading")}
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {t("auth.loginDescription")}
            </p>
          </div>

          <div className="grid max-w-xl gap-3 sm:grid-cols-3">
            {(["auth.backendAuth", "auth.roleAccess", "auth.protectedApi"] as TranslationKey[]).map((key) => (
              <div
                key={key}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-xs text-muted-foreground"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                <span>{t(key)}</span>
              </div>
            ))}
          </div>
        </section>

        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl">{t("auth.login")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("auth.credentialsHelp")}
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
                  {t("auth.email")}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                  {t("auth.password")}
                </label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pl-9 pr-10"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{t("auth.loginError")}</span>
                </div>
              )}

              <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
                <span>{isSubmitting ? t("auth.signingIn") : t("auth.signIn")}</span>
                <ArrowRight className="h-4 w-4" />
              </Button>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <Link className="hover:text-foreground" href="/forgot-password">
                  {t("auth.forgotPassword")}
                </Link>
                <Link className="hover:text-foreground" href="/register">
                  {t("auth.createAccount")}
                </Link>
              </div>
            </form>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
