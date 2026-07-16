import { createWorker, type Worker } from "tesseract.js";
import { withInferredAlign } from "@/utils/ocrLineAlign";

/**
 * OCR layout contract (authority for faithful PDF recreation):
 *
 * - `bbox` — absolute placement of the visual line on the page (x0,y0,x1,y1).
 * - `align` — inferred CSS text-align (left | center | right | justify).
 * - `words` — optional word boxes for spacing / justify evidence (geometry only).
 * - `confidence` — line confidence 0–100 when Tesseract provides it.
 * - Line height (`y1 - y0`) — primary signal for font size in rem.
 *
 * Translation must redistribute text onto these boxes; it must not invent new
 * vertical positions or discard alignment unless boxes are missing.
 */

/** Map app ISO 639-1 codes → Tesseract traineddata codes. */
const TESSERACT_LANG_BY_ISO: Record<string, string> = {
  ca: "cat",
  es: "spa",
  en: "eng",
  fr: "fra",
  pt: "por",
  it: "ita",
  de: "deu",
  gl: "glg",
  eu: "eus",
  ar: "ara",
  zh: "chi_sim",
};

/** Default multi-script pack for ACSA-like docs. */
export const DEFAULT_OCR_LANGS = "fra+cat+spa+eng";

/** Drop Tesseract words below this confidence (0–100). */
const MIN_WORD_CONFIDENCE = 42;

/** Relative word height below this fraction of page height → noise. */
const MIN_WORD_HEIGHT_RATIO = 0.0035;

/** Relative word height above this → stamp / giant garbage glyph. */
const MAX_WORD_HEIGHT_RATIO = 0.045;

export function tesseractLangsForIso(code: string | null | undefined): string {
  const primary = code
    ? TESSERACT_LANG_BY_ISO[code.toLowerCase()]
    : undefined;
  if (!primary) return DEFAULT_OCR_LANGS;
  // Always keep a small Latin fallback set with the selected source first.
  const pack = [primary, "eng", "fra", "spa", "cat"];
  return [...new Set(pack)].join("+");
}

export type OcrBBox = { x0: number; y0: number; x1: number; y1: number };

export type OcrTextAlign = "left" | "center" | "right" | "justify";

export type OcrWord = {
  text: string;
  bbox: OcrBBox;
  confidence?: number;
};

export type OcrLine = {
  text: string;
  bbox: OcrBBox;
  /** Inferred horizontal alignment for layout recreation. */
  align?: OcrTextAlign;
  confidence?: number;
  /** Word boxes used for justify detection / spacing (not rendered individually). */
  words?: OcrWord[];
};

export type OcrPageResult = {
  text: string;
  lines: OcrLine[];
  width: number;
  height: number;
};

type RecognizeNode = {
  text?: string;
  bbox?: OcrBBox;
  confidence?: number;
  words?: RecognizeNode[];
  lines?: RecognizeNode[];
  paragraphs?: RecognizeNode[];
  blocks?: RecognizeNode[];
};

let sharedWorker: Worker | null = null;
let sharedWorkerLangs: string | null = null;

async function getWorker(
  langs: string,
  onProgress?: (ratio: number, status: string) => void,
): Promise<Worker> {
  if (sharedWorker && sharedWorkerLangs === langs) return sharedWorker;
  if (sharedWorker) {
    await sharedWorker.terminate();
    sharedWorker = null;
    sharedWorkerLangs = null;
  }

  const worker = await createWorker(langs, undefined, {
    logger: (m) => {
      if (typeof m.progress === "number") {
        onProgress?.(m.progress, m.status ?? "");
      }
    },
  });
  await worker.setParameters({
    // AUTO page segmentation — better for full scanned letters.
    tessedit_pageseg_mode: "3" as never,
  });
  sharedWorker = worker;
  sharedWorkerLangs = langs;
  return worker;
}

function isUsableWord(
  text: string,
  bbox: OcrBBox | undefined,
  confidence: number | undefined,
  pageHeight: number,
): boolean {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return false;
  if (confidence != null && confidence < MIN_WORD_CONFIDENCE) return false;
  if (!bbox) return cleaned.length > 0;
  const h = Math.max(0, bbox.y1 - bbox.y0);
  const ratio = h / Math.max(pageHeight, 1);
  if (h > 0 && ratio < MIN_WORD_HEIGHT_RATIO) return false;
  if (ratio > MAX_WORD_HEIGHT_RATIO && cleaned.length <= 4) return false;
  // Isolated 1–2 char giants from packing codes / stamps.
  if (cleaned.length <= 2 && ratio > 0.02) return false;
  return true;
}

function extractWords(
  lineNode: RecognizeNode,
  pageHeight: number,
): OcrWord[] {
  const raw = lineNode.words ?? [];
  const out: OcrWord[] = [];
  for (const word of raw) {
    const text = (word.text ?? "").replace(/\s+/g, " ").trim();
    if (
      !isUsableWord(text, word.bbox, word.confidence, pageHeight)
    ) {
      continue;
    }
    out.push({
      text,
      bbox: word.bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
      confidence: word.confidence,
    });
  }
  return out;
}

function bboxFromWords(words: OcrWord[]): OcrBBox | undefined {
  if (words.length === 0) return undefined;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const w of words) {
    x0 = Math.min(x0, w.bbox.x0);
    y0 = Math.min(y0, w.bbox.y0);
    x1 = Math.max(x1, w.bbox.x1);
    y1 = Math.max(y1, w.bbox.y1);
  }
  if (!Number.isFinite(x0)) return undefined;
  return { x0, y0, x1, y1 };
}

function pushLine(
  target: OcrLine[],
  text: string,
  bbox: OcrBBox | undefined,
  options?: { confidence?: number; words?: OcrWord[] },
): void {
  const words = options?.words?.length ? options.words : undefined;
  const cleaned =
    words && words.length > 0
      ? words.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim()
      : text.replace(/\s+/g, " ").trim();
  if (!cleaned) return;
  const resolvedBBox =
    bbox ?? bboxFromWords(words ?? []) ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
  target.push({
    text: cleaned,
    bbox: resolvedBBox,
    confidence: options?.confidence,
    words,
  });
}

function collectLines(
  node: RecognizeNode | undefined,
  out: OcrLine[],
  pageHeight: number,
): void {
  if (!node) return;
  if (node.lines?.length) {
    for (const line of node.lines) {
      const words = extractWords(line, pageHeight);
      pushLine(out, line.text ?? "", line.bbox, {
        confidence: line.confidence,
        words,
      });
    }
    return;
  }
  if (node.paragraphs?.length) {
    for (const paragraph of node.paragraphs) {
      collectLines(paragraph, out, pageHeight);
    }
    return;
  }
  if (node.blocks?.length) {
    for (const block of node.blocks) collectLines(block, out, pageHeight);
  }
}

function linesFromFullText(
  text: string,
  width: number,
  height: number,
): OcrLine[] {
  const rows = text
    .replace(/\u000c/g, "")
    .split(/\n+/)
    .map((row) => row.trim())
    .filter(Boolean);
  if (rows.length === 0) return [];

  const lineHeight = height / Math.max(rows.length, 1);
  return rows.map((row, index) => ({
    text: row,
    bbox: {
      x0: width * 0.06,
      y0: lineHeight * index + lineHeight * 0.15,
      x1: width * 0.94,
      y1: lineHeight * (index + 1) - lineHeight * 0.15,
    },
  }));
}

function linesFromRecognizeData(
  data: RecognizeNode & { text?: string },
  width: number,
  height: number,
): OcrLine[] {
  const out: OcrLine[] = [];
  collectLines(data, out, height);
  if (out.length > 0) return withInferredAlign(out, width);

  // Top-level lines / paragraphs if present on Page.
  if (data.lines?.length) {
    for (const line of data.lines) {
      const words = extractWords(line, height);
      pushLine(out, line.text ?? "", line.bbox, {
        confidence: line.confidence,
        words,
      });
    }
    if (out.length > 0) return withInferredAlign(out, width);
  }
  if (data.paragraphs?.length) {
    for (const paragraph of data.paragraphs) {
      collectLines(paragraph, out, height);
    }
    if (out.length > 0) return withInferredAlign(out, width);
  }

  return withInferredAlign(
    linesFromFullText(data.text ?? "", width, height),
    width,
  );
}

/** OCR an image/canvas and return full text + line boxes for layout. */
export async function ocrPage(
  image: HTMLCanvasElement | Blob | string,
  options?: {
    langs?: string;
    signal?: AbortSignal;
    onProgress?: (ratio: number, status: string) => void;
  },
): Promise<OcrPageResult> {
  options?.signal?.throwIfAborted();
  const langs = options?.langs ?? DEFAULT_OCR_LANGS;
  const worker = await getWorker(langs, options?.onProgress);
  options?.signal?.throwIfAborted();

  const result = await worker.recognize(
    image,
    undefined,
    // blocks must be requested — default output is text-only (no line bboxes).
    { text: true, blocks: true },
  );
  options?.signal?.throwIfAborted();

  const width =
    typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement
      ? image.width
      : 1;
  const height =
    typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement
      ? image.height
      : 1;

  const text = (result.data.text ?? "").replace(/\u000c/g, "").trim();
  const lines = linesFromRecognizeData(result.data as RecognizeNode, width, height);

  return {
    text: text || lines.map((line) => line.text).join("\n"),
    lines,
    width,
    height,
  };
}

/** Plain-text helper kept for callers that only need a string. */
export async function ocrImage(
  image: HTMLCanvasElement | Blob | string,
  options?: {
    langs?: string;
    signal?: AbortSignal;
    onProgress?: (ratio: number, status: string) => void;
  },
): Promise<string> {
  const page = await ocrPage(image, options);
  return page.text;
}
