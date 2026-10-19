"use client";

import { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { useLanguage } from "@/components/i18n/language-provider";

/** Render inside Link so the router owns the pending lifecycle. */
export function NavigationLinkFeedback({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  const { t } = useLanguage();

  if (!pending || typeof document === "undefined") return null;

  return (
    <>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl border border-primary bg-primary/5" />
      {/* Keep feedback visible when the mobile drawer closes after a click. */}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[60]">
          <div aria-hidden="true" className="h-0.5 bg-primary motion-safe:animate-pulse" />
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-navigation-status=""
            className="absolute right-4 top-20 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm"
          >
            <LoaderCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-primary motion-safe:animate-spin" />
            <span>{t("nav.openingPage", { page: label })}</span>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
