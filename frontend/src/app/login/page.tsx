"use client";

import React, { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Layers,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth/auth-provider";

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      router.replace(nextPath);
    }
  }, [isAuthenticated, nextPath, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await login({ email, password });
      router.replace(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center gap-8 lg:grid-cols-[1fr_420px]">
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">WorkflowHub</p>
              <p className="text-xs text-muted-foreground">Enterprise Platform</p>
            </div>
          </div>

          <div className="max-w-xl space-y-3">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Sign in to manage workflow operations.
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              Access dashboard metrics, project stages, document reviews, approval queues,
              and user administration from one authenticated workspace.
            </p>
          </div>

          <div className="grid max-w-xl gap-3 sm:grid-cols-3">
            {["Supabase Auth", "Role based access", "Protected API"].map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-xs text-muted-foreground"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <Card className="border-border/70 bg-card/80 shadow-2xl shadow-black/30 hover:border-border/70">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl">Login</CardTitle>
            <p className="text-sm text-muted-foreground">
              Use an account managed through Supabase Auth.
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
                  Email
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
                  Password
                </label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
                <span>{isSubmitting ? "Signing in..." : "Sign in"}</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
