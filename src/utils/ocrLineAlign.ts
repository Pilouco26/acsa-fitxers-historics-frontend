import type { OcrBBox, OcrTextAlign, OcrWord } from "@/utils/ocrImage";

/** Minimum words before justify is considered. */
const JUSTIFY_MIN_WORDS = 3;

/** Relative gap CV above this → likely justified (vs natural spacing). */
const JUSTIFY_GAP_CV = 0.55;

/**
 * Infer horizontal alignment for an OCR line from its page margins and
 * (when available) inter-word gaps.
 *
 * Authority: bbox vs page width for left/center/right; word gaps for justify.
 */
export function inferOcrLineAlign(
  bbox: OcrBBox,
  pageWidth: number,
  words?: OcrWord[],
): OcrTextAlign {
  const safeW = Math.max(pageWidth, 1);
  const leftInset = Math.max(0, bbox.x0) / safeW;
  const rightInset = Math.max(0, safeW - bbox.x1) / safeW;
  const lineWidth = Math.max(0, bbox.x1 - bbox.x0) / safeW;
  const insetDelta = Math.abs(leftInset - rightInset);

  // Narrow centered titles / signatures.
  if (
    lineWidth < 0.85 &&
    insetDelta < 0.08 &&
    leftInset > 0.08 &&
    rightInset > 0.08
  ) {
    return "center";
  }

  // Right-aligned (date lines, etc.).
  if (leftInset > 0.22 && rightInset < 0.12 && leftInset - rightInset > 0.14) {
    return "right";
  }

  if (looksJustified(words, bbox)) {
    return "justify";
  }

  return "left";
}

function looksJustified(words: OcrWord[] | undefined, lineBBox: OcrBBox): boolean {
  if (!words || words.length < JUSTIFY_MIN_WORDS) return false;

  const gaps: number[] = [];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].bbox.x0 - words[i - 1].bbox.x1;
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length < 2) return false;

  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (mean <= 0) return false;
  const variance =
    gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
  const cv = Math.sqrt(variance) / mean;

  const lineW = Math.max(1, lineBBox.x1 - lineBBox.x0);
  const avgCharApprox = lineW / Math.max(words.reduce((s, w) => s + w.text.length, 0), 1);
  // Wide stretches between words (not just OCR jitter).
  const wideGaps = gaps.filter((g) => g > avgCharApprox * 2.2).length;

  return cv >= JUSTIFY_GAP_CV && wideGaps >= 1;
}

/** Attach `align` to each OCR line using page width. */
export function withInferredAlign<T extends { bbox: OcrBBox; words?: OcrWord[]; align?: OcrTextAlign }>(
  lines: T[],
  pageWidth: number,
): Array<T & { align: OcrTextAlign }> {
  return lines.map((line) => ({
    ...line,
    align: line.align ?? inferOcrLineAlign(line.bbox, pageWidth, line.words),
  }));
}
