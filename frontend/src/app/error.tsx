"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLanguage();

  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
      <p className="text-sm font-semibold text-destructive">500</p>
      <h1 className="text-2xl font-semibold">{t("common.unexpectedError")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {error.message || t("common.unexpectedError")}
      </p>
      <div className="flex items-center gap-3">
        <Button onClick={() => reset()} variant="outline">
          {t("common.retry")}
        </Button>
        <Link
          href="/"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-deep"
        >
          {t("notFound.back")}
        </Link>
      </div>
    </section>
  );
}
