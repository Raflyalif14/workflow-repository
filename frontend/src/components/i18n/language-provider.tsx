"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { apiClient } from "@/lib/api-client";
import {
  AppLanguage,
  DEFAULT_LANGUAGE,
  TranslationKey,
  TranslationParams,
  formatDate,
  formatNumber,
  setActiveLanguage,
  translate,
} from "@/i18n";

const LOCALE_STORAGE_KEY = "workflow-locale";
const isLanguage = (value: unknown): value is AppLanguage => value === "en" || value === "id";

type LanguageContextValue = {
  locale: AppLanguage;
  currentLocale: AppLanguage;
  isLoading: boolean;
  isSaving: boolean;
  error: TranslationKey | null;
  setLocale: (locale: AppLanguage) => Promise<void>;
  toggleLocale: () => Promise<void>;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  formatDate: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function readCachedLocale(userId?: string): AppLanguage {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  const userValue = userId ? window.localStorage.getItem(`${LOCALE_STORAGE_KEY}:${userId}`) : null;
  const value = userValue || window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

function cacheLocale(locale: AppLanguage, userId?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  if (userId) window.localStorage.setItem(`${LOCALE_STORAGE_KEY}:${userId}`, locale);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [locale, setLocaleState] = useState<AppLanguage>(DEFAULT_LANGUAGE);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);

  const applyLocale = useCallback((nextLocale: AppLanguage) => {
    setActiveLanguage(nextLocale);
    setLocaleState(nextLocale);
    if (typeof document !== "undefined") document.documentElement.lang = nextLocale;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cached = readCachedLocale(user?.id);
    const initial = user?.preferredLanguage || cached || DEFAULT_LANGUAGE;
    applyLocale(initial);
    if (!user) return;

    setIsLoading(true);
    setError(null);
    apiClient<{ language: AppLanguage }>("/auth/preferences/language")
      .then((preference) => {
        if (cancelled) return;
        applyLocale(preference.language);
        cacheLocale(preference.language, user.id);
      })
      .catch(() => {
        if (!cancelled) setError("language.loadError");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [applyLocale, user?.id, user?.preferredLanguage]);

  const setLocale = useCallback(async (nextLocale: AppLanguage) => {
    setError(null);
    if (!user) {
      applyLocale(nextLocale);
      cacheLocale(nextLocale);
      return;
    }
    setIsSaving(true);
    try {
      const preference = await apiClient<{ language: AppLanguage }>("/auth/preferences/language", {
        method: "PUT",
        body: JSON.stringify({ language: nextLocale }),
      });
      applyLocale(preference.language);
      cacheLocale(preference.language, user.id);
    } catch {
      setError("language.saveError");
      throw new Error(translate("language.saveError", {}, locale));
    } finally {
      setIsSaving(false);
    }
  }, [applyLocale, locale, user]);

  const value = useMemo<LanguageContextValue>(() => ({
    locale,
    currentLocale: locale,
    isLoading,
    isSaving,
    error,
    setLocale,
    toggleLocale: () => setLocale(locale === "en" ? "id" : "en"),
    t: (key, params) => translate(key, params, locale),
    formatDate: (value, options) => formatDate(value, options, locale),
    formatNumber: (value, options) => formatNumber(value, options, locale),
  }), [error, isLoading, isSaving, locale, setLocale]);

  return <LanguageContext.Provider value={value}><React.Fragment key={locale}>{children}</React.Fragment></LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used within LanguageProvider");
  return value;
}
