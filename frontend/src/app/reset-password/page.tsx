"use client";

import React, { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { clearStoredAuth, validatePasswordPolicy } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function ResetPasswordPage() {
  const [tokenHash, setTokenHash] = useState("");
  const [isValidLink, setIsValidLink] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token_hash") || "";
    const type = params.get("type") || "";
    setTokenHash(token);
    setIsValidLink(Boolean(token) && type === "recovery");
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const passwordError = validatePasswordPolicy(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password tidak sama.");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token_hash: tokenHash,
          new_password: newPassword,
        }),
      });
      clearStoredAuth();
      setSuccess("Password berhasil direset. Silakan login kembali.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link reset tidak valid atau kedaluwarsa.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md border-border/70 bg-card/80 shadow-2xl shadow-black/30 hover:border-border/70">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl">Reset Password</CardTitle>
          <p className="text-sm text-muted-foreground">
            Create a new password from your recovery link.
          </p>
        </CardHeader>
        <CardContent>
          {!isValidLink ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Link reset password tidak valid atau sudah kedaluwarsa.</span>
              </div>
              <Link href="/forgot-password">
                <Button className="w-full" variant="outline">
                  Request New Link
                </Button>
              </Link>
            </div>
          ) : success ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{success}</span>
              </div>
              <Link href="/login">
                <Button className="w-full gap-2">
                  Login
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <PasswordField
                id="new_password"
                label="New Password"
                value={newPassword}
                show={showNewPassword}
                onChange={setNewPassword}
                onToggle={() => setShowNewPassword((value) => !value)}
              />
              <PasswordField
                id="confirm_password"
                label="Confirm Password"
                value={confirmPassword}
                show={showConfirmPassword}
                onChange={setConfirmPassword}
                onToggle={() => setShowConfirmPassword((value) => !value)}
              />

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Reset Password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  show,
  onChange,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  show: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pl-9 pr-10"
          required
        />
        <button
          type="button"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
          onClick={onToggle}
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
