/** Gemini models selectable in Settings. */
export const GEMINI_MODEL_OPTIONS = [
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash-Lite" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
] as const;

export type GeminiModelId = (typeof GEMINI_MODEL_OPTIONS)[number]["value"];

export const DEFAULT_GEMINI_MODEL: GeminiModelId = "gemini-2.5-flash-lite";

/**
 * Normalize a free-text Gemini model into an API model id.
 * e.g. "Gemini 2.5 Flash" → "gemini-2.5-flash", "models/gemini-3.5-flash" → "gemini-3.5-flash"
 */
export function normalizeGeminiModelId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const lower = trimmed.toLowerCase();
  const byValue = GEMINI_MODEL_OPTIONS.find((o) => o.value === lower);
  if (byValue) return byValue.value;
  const byLabel = GEMINI_MODEL_OPTIONS.find(
    (o) => o.label.toLowerCase() === lower,
  );
  if (byLabel) return byLabel.value;

  return trimmed
    .replace(/^models\//i, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
