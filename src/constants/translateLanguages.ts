import { DOCUMENT_LANGUAGE_OPTIONS } from "@/constants/documentFilters";

/** Target languages for on-demand document translation. */
export const TRANSLATE_LANGUAGE_OPTIONS = [
  ...DOCUMENT_LANGUAGE_OPTIONS,
  { value: "ar", label: "Àrab (ar)" },
  { value: "zh", label: "Xinès (zh)" },
] as const;

export type TranslateLanguageCode =
  (typeof TRANSLATE_LANGUAGE_OPTIONS)[number]["value"];

const LANG_ALIASES: Record<string, TranslateLanguageCode> = {
  ca: "ca",
  cat: "ca",
  catalan: "ca",
  català: "ca",
  catala: "ca",
  es: "es",
  spa: "es",
  spanish: "es",
  castellà: "es",
  castella: "es",
  fr: "fr",
  fra: "fr",
  french: "fr",
  français: "fr",
  francais: "fr",
  en: "en",
  eng: "en",
  english: "en",
  pt: "pt",
  por: "pt",
  portuguese: "pt",
  it: "it",
  ita: "it",
  italian: "it",
  de: "de",
  deu: "de",
  ger: "de",
  german: "de",
  gl: "gl",
  glg: "gl",
  eu: "eu",
  eus: "eu",
  ar: "ar",
  ara: "ar",
  arabic: "ar",
  zh: "zh",
  chi: "zh",
  "zh-cn": "zh",
  "zh-hans": "zh",
  chinese: "zh",
};

/** Normalize classifier / PDF language strings to a supported ISO code. */
export function normalizeTranslateLanguage(
  value: string | null | undefined,
): TranslateLanguageCode | null {
  if (!value) return null;
  const key = value.trim().toLowerCase().replace(/_/g, "-");
  if (!key) return null;
  if (TRANSLATE_LANGUAGE_OPTIONS.some((option) => option.value === key)) {
    return key as TranslateLanguageCode;
  }
  const aliased = LANG_ALIASES[key];
  if (aliased) return aliased;
  // BCP-47 tags like "fr-FR" / "zh-Hans" → primary subtag
  const primary = key.split("-")[0];
  if (
    primary &&
    TRANSLATE_LANGUAGE_OPTIONS.some((option) => option.value === primary)
  ) {
    return primary as TranslateLanguageCode;
  }
  return LANG_ALIASES[primary] ?? null;
}

export function translateLanguageLabel(
  code: TranslateLanguageCode | string | null | undefined,
): string {
  if (!code) return "desconegut";
  const normalized = normalizeTranslateLanguage(code) ?? code;
  const option = TRANSLATE_LANGUAGE_OPTIONS.find(
    (item) => item.value === normalized,
  );
  return option?.label ?? String(normalized);
}

/**
 * Pick a useful translation target from the document's classified language.
 * Prefers Catalan for ACSA; never defaults to translating into the same language.
 */
export function resolveDefaultTranslateLanguage(
  documentLanguage: string | null | undefined,
): TranslateLanguageCode {
  const source = normalizeTranslateLanguage(documentLanguage);
  if (source === "ca") return "es";
  return "ca";
}

/** Catalan / Spanish sources are already in a working language — skip translation UI. */
export function looksLikePassthroughSource(
  language?: string | null,
): boolean {
  const normalized = normalizeTranslateLanguage(language);
  return normalized === "ca" || normalized === "es";
}
