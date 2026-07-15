/** Minimal typings for Chrome's built-in Translator / Language Detector APIs. */

export type AIAvailability =
  | "unavailable"
  | "downloadable"
  | "downloading"
  | "available";

type DownloadProgressEvent = Event & { loaded: number; total?: number };

interface CreateMonitor {
  addEventListener(
    type: "downloadprogress",
    listener: (event: DownloadProgressEvent) => void,
  ): void;
}

interface TranslatorInstance {
  translate(input: string): Promise<string>;
  translateStreaming(input: string): AsyncIterable<string>;
  destroy(): void;
}

interface LanguageDetectorInstance {
  detect(
    input: string,
  ): Promise<Array<{ detectedLanguage: string; confidence: number }>>;
  destroy(): void;
}

interface TranslatorStatic {
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<AIAvailability>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: CreateMonitor) => void;
  }): Promise<TranslatorInstance>;
}

interface LanguageDetectorStatic {
  availability(): Promise<AIAvailability>;
  create(options?: {
    monitor?: (m: CreateMonitor) => void;
  }): Promise<LanguageDetectorInstance>;
}

declare global {
  interface Window {
    Translator?: TranslatorStatic;
    LanguageDetector?: LanguageDetectorStatic;
  }
}

const CHUNK_SIZE = 3500;

export function isBrowserTranslatorSupported(): boolean {
  return typeof window !== "undefined" && typeof window.Translator !== "undefined";
}

export function isBrowserLanguageDetectorSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.LanguageDetector !== "undefined"
  );
}

/** Split long text into chunks that stay within on-device translator limits. */
export function chunkTextForTranslation(text: string, size = CHUNK_SIZE): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= size) return [normalized];

  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > size) {
    let splitAt = remaining.lastIndexOf("\n\n", size);
    if (splitAt < size * 0.4) splitAt = remaining.lastIndexOf("\n", size);
    if (splitAt < size * 0.4) splitAt = remaining.lastIndexOf(" ", size);
    if (splitAt < size * 0.4) splitAt = size;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export async function detectBrowserLanguage(
  text: string,
  onDownloadProgress?: (ratio: number) => void,
): Promise<string | null> {
  if (!window.LanguageDetector) return null;

  const availability = await window.LanguageDetector.availability();
  if (availability === "unavailable") return null;

  const detector = await window.LanguageDetector.create({
    monitor(m) {
      m.addEventListener("downloadprogress", (e) => {
        onDownloadProgress?.(e.loaded);
      });
    },
  });

  try {
    const sample = text.slice(0, 2000);
    const results = await detector.detect(sample);
    const top = results[0];
    if (!top || top.detectedLanguage === "und") return null;
    return top.detectedLanguage;
  } finally {
    detector.destroy();
  }
}

export async function getTranslatorAvailability(
  sourceLanguage: string,
  targetLanguage: string,
): Promise<AIAvailability | "no-api"> {
  const Translator = window.Translator;
  if (!Translator) return "no-api";
  return Translator.availability({ sourceLanguage, targetLanguage });
}

/**
 * Must be called from a user gesture when the pack is downloadable/downloading.
 * Creates the translator (triggers download if needed), then destroys it.
 */
export async function downloadTranslatorModel(options: {
  sourceLanguage: string;
  targetLanguage: string;
  onDownloadProgress?: (ratio: number) => void;
}): Promise<AIAvailability> {
  const Translator = window.Translator;
  if (!Translator) {
    throw new Error(
      "Aquest navegador no admet la Translator API (cal Chrome 138+ d'escriptori).",
    );
  }

  const pair = {
    sourceLanguage: options.sourceLanguage,
    targetLanguage: options.targetLanguage,
  };

  const availability = await Translator.availability(pair);
  if (availability === "unavailable") {
    throw new Error(
      `El parell d'idiomes ${pair.sourceLanguage} → ${pair.targetLanguage} no està disponible al navegador.`,
    );
  }
  if (availability === "available") {
    return "available";
  }

  const translator = await Translator.create({
    ...pair,
    monitor(m) {
      m.addEventListener("downloadprogress", (e) => {
        options.onDownloadProgress?.(e.loaded);
      });
    },
  });
  translator.destroy();

  return Translator.availability(pair);
}

export async function translateTextInBrowser(options: {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  signal?: AbortSignal;
  onDownloadProgress?: (ratio: number) => void;
  onChunkProgress?: (done: number, total: number) => void;
}): Promise<string> {
  const Translator = window.Translator;
  if (!Translator) {
    throw new Error(
      "Aquest navegador no admet la Translator API (cal Chrome 138+ d'escriptori).",
    );
  }

  const pair = {
    sourceLanguage: options.sourceLanguage,
    targetLanguage: options.targetLanguage,
  };

  const availability = await Translator.availability(pair);
  if (availability === "unavailable") {
    throw new Error(
      `El parell d'idiomes ${pair.sourceLanguage} → ${pair.targetLanguage} no està disponible al navegador.`,
    );
  }

  options.signal?.throwIfAborted();

  const translator = await Translator.create({
    ...pair,
    monitor(m) {
      m.addEventListener("downloadprogress", (e) => {
        options.onDownloadProgress?.(e.loaded);
      });
    },
  });

  try {
    options.signal?.throwIfAborted();
    const chunks = chunkTextForTranslation(options.text);
    const translated: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      options.signal?.throwIfAborted();
      options.onChunkProgress?.(i, chunks.length);

      if (typeof translator.translateStreaming === "function" && chunks[i].length > 800) {
        let piece = "";
        for await (const part of translator.translateStreaming(chunks[i])) {
          options.signal?.throwIfAborted();
          piece += part;
        }
        translated.push(piece);
      } else {
        translated.push(await translator.translate(chunks[i]));
      }
    }

    options.onChunkProgress?.(chunks.length, chunks.length);
    return translated.join("\n\n");
  } finally {
    translator.destroy();
  }
}
