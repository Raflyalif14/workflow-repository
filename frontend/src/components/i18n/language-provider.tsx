"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { apiClient } from "@/lib/api-client";
import { getAccessToken } from "@/lib/auth";
import { isCurrentLanguagePreferenceRequest, loadLanguagePreference } from "@/lib/language-preference-request";
import {
  AppLanguage,
  DEFAULT_LANGUAGE,
  TranslationKey,
  TranslationParams,
  formatDate,
  formatNumber,
  getLanguageCacheKey,
  resolveLanguagePreference,
  setActiveLanguage,
  translate,
} from "@/i18n";

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
  const value = window.localStorage.getItem(getLanguageCacheKey(userId));
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

function cacheLocale(locale: AppLanguage, userId?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getLanguageCacheKey(), locale);
  if (userId) window.localStorage.setItem(getLanguageCacheKey(userId), locale);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [locale, setLocaleState] = useState<AppLanguage>(DEFAULT_LANGUAGE);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const changeGeneration = useRef(0);
  const activeUserId = useRef(user?.id);
  activeUserId.current = user?.id;

  const applyLocale = useCallback((nextLocale: AppLanguage) => {
    setActiveLanguage(nextLocale);
    setLocaleState(nextLocale);
    if (typeof document !== "undefined") document.documentElement.lang = nextLocale;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const generation = ++changeGeneration.current;
    const cached = readCachedLocale(user?.id);
    const initial = resolveLanguagePreference(user?.preferredLanguage, cached);
    applyLocale(initial);
    if (!user) return;

    setIsLoading(true);
    setError(null);
    loadLanguagePreference(user.id, getAccessToken(), async () =>
      (await apiClient<{ language: AppLanguage }>("/auth/preferences/language")).language
    )
      .then((language) => {
        if (cancelled || !isCurrentLanguagePreferenceRequest(user.id, activeUserId.current, generation, changeGeneration.current)) return;
        applyLocale(language);
        cacheLocale(language, user.id);
      })
      .catch(() => {
        if (!cancelled && isCurrentLanguagePreferenceRequest(user.id, activeUserId.current, generation, changeGeneration.current)) setError("language.loadError");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [applyLocale, user?.id, user?.preferredLanguage]);

  const setLocale = useCallback(async (nextLocale: AppLanguage) => {
    const generation = ++changeGeneration.current;
    const userId = user?.id;
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
      if (generation === changeGeneration.current && activeUserId.current === userId) {
        applyLocale(preference.language);
        cacheLocale(preference.language, userId);
      }
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

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used within LanguageProvider");
  return value;
}
