import { createWorker, type Worker } from "tesseract.js";

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

export type OcrLine = {
  text: string;
  bbox: OcrBBox;
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

function pushLine(target: OcrLine[], text: string, bbox?: OcrBBox): void {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return;
  target.push({
    text: cleaned,
    bbox: bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
  });
}

function collectLines(node: RecognizeNode | undefined, out: OcrLine[]): void {
  if (!node) return;
  if (node.lines?.length) {
    for (const line of node.lines) {
      pushLine(out, line.text ?? "", line.bbox);
    }
    return;
  }
  if (node.paragraphs?.length) {
    for (const paragraph of node.paragraphs) collectLines(paragraph, out);
    return;
  }
  if (node.blocks?.length) {
    for (const block of node.blocks) collectLines(block, out);
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
  collectLines(data, out);
  if (out.length > 0) return out;

  // Top-level lines / paragraphs if present on Page.
  if (data.lines?.length) {
    for (const line of data.lines) pushLine(out, line.text ?? "", line.bbox);
    if (out.length > 0) return out;
  }
  if (data.paragraphs?.length) {
    for (const paragraph of data.paragraphs) collectLines(paragraph, out);
    if (out.length > 0) return out;
  }

  return linesFromFullText(data.text ?? "", width, height);
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

  const result = await worker.recognize(image);
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
