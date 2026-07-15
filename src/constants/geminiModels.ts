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
