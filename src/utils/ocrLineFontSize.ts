import type { OcrBBox } from "@/utils/ocrImage";

export const OCR_LINE_FONT_MIN_REM = 0.42;
export const OCR_LINE_FONT_MAX_REM = 1.05;

/** Map OCR line box height → readable rem (tall boxes must not explode). */
export function ocrLineFontSizeRem(bbox: OcrBBox, pageHeight: number): number {
  const safeHeight = Math.max(pageHeight, 1);
  const heightRatio = Math.max(0, (bbox.y1 - bbox.y0) / safeHeight);
  // Dense table rows are often ~0.8–1.5% of page height; body ~1.2–2.5%.
  const raw = heightRatio * 42;
  return Math.min(
    OCR_LINE_FONT_MAX_REM,
    Math.max(OCR_LINE_FONT_MIN_REM, raw),
  );
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
