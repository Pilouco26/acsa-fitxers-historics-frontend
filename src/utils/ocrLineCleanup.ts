import type { OcrBBox, OcrLine } from "@/utils/ocrImage";

/** Max line height as fraction of page (taller → stamp / noise / artifact). */
const MAX_HEIGHT_RATIO = 0.048;

/** Short tokens (≤3 chars) above this height are almost always garbage. */
const MAX_SHORT_HEIGHT_RATIO = 0.022;

/** Drop lines below this confidence when the text is also weak. */
const MIN_WEAK_CONFIDENCE = 48;

function boxArea(b: OcrBBox): number {
  return Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
}

function iou(a: OcrBBox, b: OcrBBox): number {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  if (inter <= 0) return 0;
  const union = boxArea(a) + boxArea(b) - inter;
  return union > 0 ? inter / union : 0;
}

/** Vertical overlap as fraction of the shorter box height. */
function verticalOverlapRatio(a: OcrBBox, b: OcrBBox): number {
  const overlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (overlap <= 0) return 0;
  const shorter = Math.min(a.y1 - a.y0, b.y1 - b.y0);
  return shorter > 0 ? overlap / shorter : 0;
}

function horizontalOverlapRatio(a: OcrBBox, b: OcrBBox): number {
  const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  if (overlap <= 0) return 0;
  const shorter = Math.min(a.x1 - a.x0, b.x1 - b.x0);
  return shorter > 0 ? overlap / shorter : 0;
}

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function letterCount(text: string): number {
  return (text.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) ?? []).length;
}

function medianLineHeight(lines: OcrLine[]): number {
  const heights = lines
    .map((l) => Math.max(0, l.bbox.y1 - l.bbox.y0))
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  if (heights.length === 0) return 0;
  return heights[Math.floor(heights.length / 2)] ?? 0;
}

/**
 * True for OCR artifacts: oversized 1–3 char stamps, punctuation noise,
 * absurdly tall boxes, and very low-confidence scraps.
 */
export function isGarbageOcrLine(
  line: OcrLine,
  pageWidth: number,
  pageHeight: number,
  medianH: number,
): boolean {
  const text = compactText(line.text);
  if (!text) return true;

  const safeW = Math.max(pageWidth, 1);
  const safeH = Math.max(pageHeight, 1);
  const bw = Math.max(0, line.bbox.x1 - line.bbox.x0);
  const bh = Math.max(0, line.bbox.y1 - line.bbox.y0);
  const hRatio = bh / safeH;
  const wRatio = bw / safeW;
  const letters = letterCount(text);
  const alnum = (text.match(/[0-9A-Za-zÀ-ÖØ-öø-ÿ]/g) ?? []).length;

  // Extreme tall box (stamps, columns of giant OCR junk).
  if (hRatio > MAX_HEIGHT_RATIO) return true;

  // Tiny fragments that Tesseract draws as huge glyphs ("H", "82", "DC"…).
  if (text.length <= 3 && hRatio > MAX_SHORT_HEIGHT_RATIO) return true;
  if (text.length <= 2 && hRatio > 0.016) return true;
  if (text.length <= 2 && wRatio > 0.12 && hRatio > 0.012) return true;

  // Short token whose box is much taller than typical body lines.
  if (
    medianH > 0 &&
    text.length <= 4 &&
    bh > medianH * 2.4 &&
    hRatio > 0.014
  ) {
    return true;
  }

  // Almost no letters — dots / markers / noise (keep price-like "4,00").
  if (letters === 0 && !/\d/.test(text) && text.length < 10) return true;
  if (alnum === 0 && text.length < 8) return true;

  // Sparse: few chars in a large area (classic garbage glyph bbox).
  const areaRatio = wRatio * hRatio;
  if (text.length <= 4 && areaRatio > 0.006 && hRatio > 0.015) return true;

  // Very low confidence + short text.
  if (
    line.confidence != null &&
    line.confidence < MIN_WEAK_CONFIDENCE &&
    text.length < 8
  ) {
    return true;
  }

  // Repeated identical short chars often from ruled lines / stamps ("HHH").
  if (/^(.)\1{2,}$/.test(text.replace(/\s/g, "")) && text.length <= 6) {
    return true;
  }

  // Vowel-less Latin scraps ("DD 4", "OHERE", "HH") — not real words.
  const compact = text.replace(/\s+/g, "");
  if (
    compact.length >= 2 &&
    compact.length <= 8 &&
    /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(compact) &&
    !/[AEIOUYaeiouyÀÈÉÌÍÒÓÙÚàèéìíòóùú]/.test(compact) &&
    !/^\d+[.,]\d+$/.test(compact)
  ) {
    return true;
  }

  return false;
}

/**
 * Prefer longer / higher-confidence lines when boxes heavily overlap — this
 * removes duplicate OCR hits that cause stacked/overlapping translated text.
 */
export function dedupeOverlappingOcrLines(lines: OcrLine[]): OcrLine[] {
  const ranked = [...lines].sort((a, b) => {
    const ca = a.confidence ?? 55;
    const cb = b.confidence ?? 55;
    if (cb !== ca) return cb - ca;
    if (b.text.length !== a.text.length) return b.text.length - a.text.length;
    return boxArea(a.bbox) - boxArea(b.bbox);
  });

  const kept: OcrLine[] = [];
  for (const line of ranked) {
    const conflicts = kept.some((other) => {
      const sameSpot = iou(line.bbox, other.bbox) >= 0.28;
      const stacked =
        verticalOverlapRatio(line.bbox, other.bbox) >= 0.55 &&
        horizontalOverlapRatio(line.bbox, other.bbox) >= 0.22;
      // Nearly identical baselines with shared text fragment.
      const yMidA = (line.bbox.y0 + line.bbox.y1) / 2;
      const yMidB = (other.bbox.y0 + other.bbox.y1) / 2;
      const h = Math.max(
        line.bbox.y1 - line.bbox.y0,
        other.bbox.y1 - other.bbox.y0,
        1,
      );
      const sameRow =
        Math.abs(yMidA - yMidB) < h * 0.55 &&
        horizontalOverlapRatio(line.bbox, other.bbox) >= 0.28;
      return sameSpot || stacked || sameRow;
    });
    if (!conflicts) kept.push(line);
  }

  return kept.sort(
    (a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0,
  );
}

function lineScore(line: OcrLine): number {
  return (
    (line.confidence ?? 55) +
    letterCount(line.text) * 3 +
    compactText(line.text).length
  );
}

/**
 * Collapse "ghost" rows: OCR often emits two boxes for one visual line with a
 * tiny vertical offset. Keep the stronger text on that baseline.
 */
export function collapseGhostRows(
  lines: OcrLine[],
  pageHeight: number,
): OcrLine[] {
  const medianH =
    medianLineHeight(lines) || Math.max(pageHeight * 0.014, 1);
  const sorted = [...lines].sort(
    (a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0,
  );
  const out: OcrLine[] = [];

  for (const line of sorted) {
    const mid = (line.bbox.y0 + line.bbox.y1) / 2;
    const rivalIdx = out.findIndex((other) => {
      const omid = (other.bbox.y0 + other.bbox.y1) / 2;
      return (
        Math.abs(omid - mid) < medianH * 0.6 &&
        horizontalOverlapRatio(other.bbox, line.bbox) > 0.2
      );
    });
    if (rivalIdx < 0) {
      out.push(line);
      continue;
    }
    if (lineScore(line) > lineScore(out[rivalIdx])) {
      out[rivalIdx] = line;
    }
  }

  return out;
}

/**
 * Drop scraps floating in the gutter / between columns: short, mid-width
 * fragments that sit left of the main text column.
 */
export function dropGutterScraps(
  lines: OcrLine[],
  pageWidth: number,
): OcrLine[] {
  if (lines.length < 8) return lines;
  const leftEdges = lines
    .filter((l) => compactText(l.text).length >= 24)
    .map((l) => l.bbox.x0)
    .sort((a, b) => a - b);
  if (leftEdges.length < 3) return lines;
  const bodyLeft = leftEdges[Math.floor(leftEdges.length * 0.2)] ?? 0;

  return lines.filter((line) => {
    const text = compactText(line.text);
    if (text.length >= 18) return true;
    // Short fragment clearly left of the body column → scrap.
    if (line.bbox.x1 < bodyLeft - pageWidth * 0.01 && text.length < 16) {
      return false;
    }
    return true;
  });
}

/**
 * If two lines in the same column still intersect vertically after dedupe,
 * keep only the stronger one (prevents crushed paragraph stacks).
 */
export function enforceMinRowGap(
  lines: OcrLine[],
  pageHeight: number,
): OcrLine[] {
  const medianH =
    medianLineHeight(lines) || Math.max(pageHeight * 0.014, 1);
  const sorted = [...lines].sort(
    (a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0,
  );
  const out: OcrLine[] = [];

  for (const line of sorted) {
    const rivalIdx = out.findIndex(
      (other) =>
        horizontalOverlapRatio(other.bbox, line.bbox) > 0.4 &&
        line.bbox.y0 < other.bbox.y1 - medianH * 0.2,
    );
    if (rivalIdx < 0) {
      out.push(line);
      continue;
    }
    if (lineScore(line) > lineScore(out[rivalIdx])) {
      out[rivalIdx] = line;
    }
  }

  return out;
}

/**
 * Full cleanup pipeline used before layout translate: size/confidence filters
 * + overlap dedupe. Call with page width and height from OCR.
 */
export function cleanOcrLinesForLayout(
  lines: OcrLine[],
  pageWidth: number,
  pageHeight: number,
): OcrLine[] {
  const basic = lines.filter((line) => {
    const h =
      (line.bbox.y1 - line.bbox.y0) / Math.max(pageHeight, 1);
    const text = compactText(line.text);
    return text.length >= 2 && h > 0.0035 && h < 0.12;
  });

  const medianH = medianLineHeight(basic);
  const filtered = basic.filter(
    (line) => !isGarbageOcrLine(line, pageWidth, pageHeight, medianH),
  );

  // Second pass median after removing giants (more stable body height).
  const medianH2 = medianLineHeight(filtered);
  const refined =
    medianH2 > 0 && Math.abs(medianH2 - medianH) / Math.max(medianH, 1) > 0.15
      ? filtered.filter(
          (line) => !isGarbageOcrLine(line, pageWidth, pageHeight, medianH2),
        )
      : filtered;

  const deduped = dedupeOverlappingOcrLines(refined);
  const collapsed = collapseGhostRows(deduped, pageHeight);
  const deGutter = dropGutterScraps(collapsed, pageWidth);
  return enforceMinRowGap(deGutter, pageHeight);
}
