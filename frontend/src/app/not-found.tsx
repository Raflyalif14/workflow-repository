"use client";

import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";

export default function NotFound() {
  const { t } = useLanguage();
  return <section className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
    <p className="text-sm font-semibold text-primary">404</p>
    <h1 className="text-2xl font-semibold">{t("notFound.title")}</h1>
    <p className="max-w-md text-sm text-muted-foreground">{t("notFound.description")}</p>
    <Link href="/" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-deep">{t("notFound.back")}</Link>
  </section>;
}
