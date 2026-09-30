import { en } from "./en";
import { id } from "./id";
import type { TranslationKey, TranslationParams } from "./types";

export type AppLanguage = "en" | "id";
export type { TranslationKey, TranslationParams };

export const DEFAULT_LANGUAGE: AppLanguage = "en";
export function resolveLanguagePreference(accountLanguage?: string | null, cachedLanguage?: string | null): AppLanguage {
  if (accountLanguage === "en" || accountLanguage === "id") return accountLanguage;
  if (cachedLanguage === "en" || cachedLanguage === "id") return cachedLanguage;
  return DEFAULT_LANGUAGE;
}

export function getLanguageCacheKey(userId?: string) {
  return userId ? `workflow-locale:${userId}` : "workflow-locale";
}
const dictionaries = { en, id } as const;
let activeLanguage: AppLanguage = DEFAULT_LANGUAGE;

export function setActiveLanguage(language: AppLanguage) { activeLanguage = language; }
export function getActiveLanguage() { return activeLanguage; }
export function getIntlLocale(language: AppLanguage = activeLanguage) { return language === "id" ? "id-ID" : "en-US"; }

export function translate(key: TranslationKey, params: TranslationParams = {}, language: AppLanguage = activeLanguage): string {
  const [domain, entry] = key.split(".") as [keyof typeof en, string];
  const dictionary = dictionaries[language] as Record<string, Record<string, string>>;
  const template = dictionary[domain]?.[entry] || (dictionaries.en as Record<string, Record<string, string>>)[domain]?.[entry] || key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match);
}

export function isTranslationKey(value: string): value is TranslationKey {
  const [domain, entry, extra] = value.split(".");
  return !extra && Boolean(domain && entry
    && Object.prototype.hasOwnProperty.call(dictionaries.en, domain)
    && Object.prototype.hasOwnProperty.call((dictionaries.en as Record<string, Record<string, string>>)[domain], entry));
}

export function translateStoredMessage(value: string): string {
  return isTranslationKey(value) ? translate(value) : value;
}

export function translateStoredError(value: string, fallback: TranslationKey = "common.unexpectedError"): string {
  return isTranslationKey(value) ? translate(value) : translate(fallback);
}

export function formatDate(value: string | number | Date, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }, language: AppLanguage = activeLanguage) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(getIntlLocale(language), options).format(date);
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions, language: AppLanguage = activeLanguage) {
  return new Intl.NumberFormat(getIntlLocale(language), options).format(value);
}

export function translateRole(role?: string | null, language: AppLanguage = activeLanguage) {
  const key = role && role in dictionaries.en.role ? role : "UNKNOWN";
  return dictionaries[language].role[key as keyof typeof en.role];
}

export function translateProjectStatus(status?: string | null, language: AppLanguage = activeLanguage) {
  const key = status && status in dictionaries.en.projectStatus ? status : "UNKNOWN";
  return dictionaries[language].projectStatus[key as keyof typeof en.projectStatus];
}

export function translateMilestoneStatus(status?: string | null, language: AppLanguage = activeLanguage) {
  const key = status && status in dictionaries.en.milestoneStatus ? status : "UNKNOWN";
  return dictionaries[language].milestoneStatus[key as keyof typeof en.milestoneStatus];
}

export function translateApprovalStatus(status?: string | null, language: AppLanguage = activeLanguage) {
  const key = status && status in dictionaries.en.approvalStatus ? status : "UNKNOWN";
  return dictionaries[language].approvalStatus[key as keyof typeof en.approvalStatus];
}

export function translateDocumentStatus(status?: string | null, language: AppLanguage = activeLanguage) {
  const key = status && status in dictionaries.en.documentStatus ? status : "UNKNOWN";
  return dictionaries[language].documentStatus[key as keyof typeof en.documentStatus];
}

export function translateOutputStatus(status?: string | null, language: AppLanguage = activeLanguage) {
  const key = status && status in dictionaries.en.outputStatus ? status : null;
  return key ? dictionaries[language].outputStatus[key as keyof typeof en.outputStatus] : translate("common.notAvailable", {}, language);
}

export function translateOutputName(key: string, fallbackName: string, language: AppLanguage = activeLanguage): string {
  return key in dictionaries.en.outputName
    ? dictionaries[language].outputName[key as keyof typeof en.outputName]
    : fallbackName;
}
