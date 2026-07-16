import type { OcrBBox, OcrWord } from "@/utils/ocrImage";

export const OCR_LINE_FONT_MIN_REM = 0.55;
export const OCR_LINE_FONT_MAX_REM = 2.1;

/** Scale factor: OCR box height → rendered glyph height (fit MT into boxes). */
export const OCR_LINE_HEIGHT_TO_FONT = 0.9;

/** Extra shrink applied to group medians so longer translations rarely clip. */
export const OCR_FONT_GROUP_FIT = 0.88;

function medianWordHeightRatio(
  words: OcrWord[] | undefined,
  pageHeight: number,
): number | null {
  if (!words?.length) return null;
  const safeHeight = Math.max(pageHeight, 1);
  const ratios = words
    .map((w) => Math.max(0, w.bbox.y1 - w.bbox.y0) / safeHeight)
    .filter((r) => r > 0.002 && r < 0.1)
    .sort((a, b) => a - b);
  if (ratios.length === 0) return null;
  return ratios[Math.floor(ratios.length / 2)] ?? null;
}

/** Map OCR line box height → readable rem (fallback when page px unknown). */
export function ocrLineFontSizeRem(
  bbox: OcrBBox,
  pageHeight: number,
  words?: OcrWord[],
): number {
  const safeHeight = Math.max(pageHeight, 1);
  const lineRatio = Math.max(0, (bbox.y1 - bbox.y0) / safeHeight);
  const wordRatio = medianWordHeightRatio(words, pageHeight);
  // Prefer the larger of line vs word — word boxes often undershoot glyph height.
  const heightRatio = Math.max(lineRatio, wordRatio ?? 0);
  const raw = heightRatio * 72;
  return Math.min(
    OCR_LINE_FONT_MAX_REM,
    Math.max(OCR_LINE_FONT_MIN_REM, raw),
  );
}

/**
 * Font size in CSS px so glyphs match the OCR box height on the displayed page.
 * `pageClientHeight` is the rendered paper height in the DOM.
 */
export function ocrLineFontSizePx(
  bbox: OcrBBox,
  layoutH: number,
  pageClientHeight: number,
  words?: OcrWord[],
  textLength = 12,
): number {
  const safeLayout = Math.max(layoutH, 1);
  const safePage = Math.max(pageClientHeight, 1);
  const lineRatio = Math.max(0, (bbox.y1 - bbox.y0) / safeLayout);
  const wordRatio = medianWordHeightRatio(words, layoutH);
  // Line bbox is the visual row; boost slightly so scan descenders don't shrink text.
  const heightRatio = Math.max(lineRatio, (wordRatio ?? 0) * 1.25);
  let px = safePage * heightRatio * OCR_LINE_HEIGHT_TO_FONT;
  // Short OCR tokens must never explode into stamp-sized glyphs.
  if (textLength <= 2) px = Math.min(px, safePage * 0.028);
  else if (textLength <= 4) px = Math.min(px, safePage * 0.036);
  else if (textLength <= 8) px = Math.min(px, safePage * 0.05);
  return Math.min(Math.max(px, 11), safePage * 0.055);
}

/**
 * Binary-search a px size so `el` fits within its client width and
 * `maxHeightPx`. Mutates `el.style.fontSize` as a side effect for measuring.
 */
export function fitOcrLineFontSizePx(
  el: HTMLElement,
  initialPx: number,
  maxHeightPx: number,
  minPx = 11,
): number {
  const start = Math.max(minPx, initialPx);
  const fits = (size: number) => {
    el.style.fontSize = `${size}px`;
    return (
      el.scrollWidth <= el.clientWidth + 1 &&
      el.scrollHeight <= maxHeightPx + 1
    );
  };

  if (fits(start)) return start;
  if (!fits(minPx)) {
    el.style.fontSize = `${minPx}px`;
    return minPx;
  }

  let lo = minPx;
  let hi = start;
  while (hi - lo > 0.25) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  el.style.fontSize = `${lo}px`;
  return Math.round(lo * 10) / 10;
}

/**
 * Binary-search a rem size so `el` fits within its client width and
 * `maxHeightPx`. Mutates `el.style.fontSize` as a side effect for measuring.
 */
export function fitOcrLineFontSizeRem(
  el: HTMLElement,
  initialRem: number,
  maxHeightPx: number,
  minRem: number = OCR_LINE_FONT_MIN_REM,
): number {
  const start = Math.min(
    OCR_LINE_FONT_MAX_REM,
    Math.max(minRem, initialRem),
  );
  const fits = (size: number) => {
    el.style.fontSize = `${size}rem`;
    return (
      el.scrollWidth <= el.clientWidth + 1 &&
      el.scrollHeight <= maxHeightPx + 1
    );
  };

  if (fits(start)) return start;
  if (!fits(minRem)) {
    el.style.fontSize = `${minRem}rem`;
    return minRem;
  }

  let lo = minRem;
  let hi = start;
  while (hi - lo > 0.015) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  el.style.fontSize = `${lo}rem`;
  return Math.round(lo * 1000) / 1000;
}
