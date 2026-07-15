import { ocrPage, tesseractLangsForIso, type OcrBBox, type OcrLine } from "@/utils/ocrImage";

export type TranslatedOcrLine = OcrLine & { translated: string };

export type TranslatedPageResult = {
  width: number;
  height: number;
  backgroundUrl: string;
  lines: TranslatedOcrLine[];
  plainParagraphs: string[];
};

/** Group OCR lines into paragraphs using vertical gaps (blank-line spacing). */
export function groupLinesIntoParagraphs(
  lines: OcrLine[],
  pageHeight: number,
): OcrLine[][] {
  if (lines.length === 0) return [];
  const sorted = [...lines].sort(
    (a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0,
  );
  const heights = sorted
    .map((line) => line.bbox.y1 - line.bbox.y0)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  const medianH =
    heights[Math.floor(heights.length / 2)] ?? Math.max(pageHeight * 0.02, 1);
  const gapThreshold = medianH * 1.65;

  const paragraphs: OcrLine[][] = [];
  let current: OcrLine[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const line = sorted[i];
    const gap = line.bbox.y0 - prev.bbox.y1;
    if (gap > gapThreshold) {
      paragraphs.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  paragraphs.push(current);
  return paragraphs;
}

/** Prefer blank-line / OCR line breaks so the translator keeps document structure. */
export function splitTextIntoParagraphs(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\u000c/g, "").trim();
  if (!normalized) return [];

  const byBlank = normalized
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (byBlank.length > 1) return byBlank;

  const byLine = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (byLine.length > 1) return byLine;

  return [normalized];
}

/** Spread a paragraph translation back onto its source OCR lines by weight. */
export function distributeTranslationToLines(
  lines: OcrLine[],
  translated: string,
): TranslatedOcrLine[] {
  const words = translated.trim().split(/\s+/).filter(Boolean);
  if (lines.length === 0) return [];
  if (words.length === 0) {
    return lines.map((line) => ({ ...line, translated: line.text }));
  }
  if (lines.length === 1) {
    return [{ ...lines[0], translated: words.join(" ") }];
  }

  const totalChars = lines.reduce((sum, line) => sum + line.text.length, 0);
  let wordIndex = 0;
  return lines.map((line, index) => {
    const isLast = index === lines.length - 1;
    const share = isLast
      ? words.length - wordIndex
      : Math.max(
          1,
          Math.round((line.text.length / Math.max(totalChars, 1)) * words.length),
        );
    const piece = words.slice(wordIndex, wordIndex + share).join(" ");
    wordIndex += share;
    return { ...line, translated: piece || line.text };
  });
}

/** Average nearby light pixels so whiteouts match aged paper, not pure white. */
function samplePaperFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
): string {
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(Math.max(0, y - 3)));
  const sw = Math.max(1, Math.min(12, Math.floor(w)));
  try {
    const { data } = ctx.getImageData(sx, sy, sw, 1);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const pr = data[i];
      const pg = data[i + 1];
      const pb = data[i + 2];
      if (pr + pg + pb < 420) continue;
      r += pr;
      g += pg;
      b += pb;
      n += 1;
    }
    if (n === 0) return "rgb(244, 239, 230)";
    return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
  } catch {
    return "rgb(244, 239, 230)";
  }
}

/**
 * Clone the scanned page and cover original OCR text regions so translated
 * lines can sit on the same logo / paper / stamps background.
 */
export function buildWhitenedPageBackground(
  source: HTMLCanvasElement,
  lines: Array<{ bbox: OcrBBox; text: string; translated: string }>,
): string {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) return source.toDataURL("image/jpeg", 0.92);

  ctx.drawImage(source, 0, 0);

  for (const line of lines) {
    const boxW = Math.max(1, line.bbox.x1 - line.bbox.x0);
    const boxH = Math.max(1, line.bbox.y1 - line.bbox.y0);
    const padX = boxW * 0.03;
    const padY = boxH * 0.22;
    const x = Math.max(0, line.bbox.x0 - padX);
    const y = Math.max(0, line.bbox.y0 - padY);
    const lengthRatio =
      line.translated.length / Math.max(line.text.length, 1);
    const widthScale = Math.min(1.65, Math.max(1.1, lengthRatio * 1.05));
    const w = Math.min(out.width - x - 2, boxW * widthScale + padX * 2);
    const h = Math.min(out.height - y - 2, boxH + padY * 2);

    ctx.fillStyle = samplePaperFill(ctx, x, y, boxW);
    ctx.fillRect(x, y, w, h);
  }

  return out.toDataURL("image/jpeg", 0.92);
}

/** Filter OCR lines that are likely body text (not noise / full-page headers). */
export function usableOcrLines(lines: OcrLine[], pageHeight: number): OcrLine[] {
  return lines.filter((line) => {
    const h = (line.bbox.y1 - line.bbox.y0) / Math.max(pageHeight, 1);
    return line.text.length >= 2 && h > 0.004 && h < 0.12;
  });
}

/** OCR one rendered page and translate its paragraphs into positioned lines. */
export async function ocrAndTranslateCanvas(options: {
  canvas: HTMLCanvasElement;
  sourceLanguage: string;
  targetLanguage: string;
  signal?: AbortSignal;
  onOcrProgress?: (ratio: number) => void;
  translate: (text: string) => Promise<string>;
}): Promise<TranslatedPageResult> {
  const { canvas, sourceLanguage, signal, onOcrProgress, translate } = options;
  signal?.throwIfAborted();

  const ocr = await ocrPage(canvas, {
    langs: tesseractLangsForIso(sourceLanguage),
    signal,
    onProgress: onOcrProgress,
  });

  if (!ocr.text.trim() && ocr.lines.length === 0) {
    return {
      width: canvas.width,
      height: canvas.height,
      backgroundUrl: canvas.toDataURL("image/jpeg", 0.92),
      lines: [],
      plainParagraphs: [],
    };
  }

  const lines = usableOcrLines(ocr.lines, ocr.height);
  const lineParagraphs =
    lines.length >= 4 ? groupLinesIntoParagraphs(lines, ocr.height) : [];
  const sourceParagraphs =
    lineParagraphs.length > 1
      ? lineParagraphs.map((group) =>
          group
            .map((line) => line.text)
            .join(" ")
            .trim(),
        )
      : splitTextIntoParagraphs(ocr.text);

  const translatedParas: string[] = [];
  for (const paragraph of sourceParagraphs) {
    signal?.throwIfAborted();
    const piece = await translate(paragraph);
    translatedParas.push(piece.trim() || paragraph);
  }

  let out: TranslatedOcrLine[] = [];
  if (lineParagraphs.length > 1) {
    for (let i = 0; i < lineParagraphs.length; i++) {
      out.push(
        ...distributeTranslationToLines(
          lineParagraphs[i],
          translatedParas[i] ?? "",
        ),
      );
    }
  }

  return {
    width: canvas.width,
    height: canvas.height,
    backgroundUrl:
      out.length > 0
        ? buildWhitenedPageBackground(canvas, out)
        : canvas.toDataURL("image/jpeg", 0.92),
    lines: out,
    plainParagraphs: translatedParas,
  };
}
