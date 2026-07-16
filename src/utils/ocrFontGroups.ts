import type { OcrBBox, OcrLine, OcrWord } from "@/utils/ocrImage";
import { OCR_FONT_GROUP_FIT, OCR_LINE_HEIGHT_TO_FONT } from "@/utils/ocrLineFontSize";

/** Page-relative glyph height assigned to a typographic group. */
export type OcrFontGroupedLine<T extends OcrLine = OcrLine> = T & {
  /** Median box-height / page-height for this line's font group. */
  fontHeightRatio: number;
  /** Stable id within the page (0 = often body). */
  fontGroupId: number;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function weightedMedian(entries: Array<{ value: number; weight: number }>): number {
  if (entries.length === 0) return 0;
  const total = entries.reduce((s, e) => s + Math.max(e.weight, 1), 0);
  const sorted = [...entries].sort((a, b) => a.value - b.value);
  let acc = 0;
  for (const entry of sorted) {
    acc += Math.max(entry.weight, 1);
    if (acc >= total / 2) return entry.value;
  }
  return sorted[sorted.length - 1]?.value ?? 0;
}

function medianWordHeightRatio(
  words: OcrWord[] | undefined,
  pageHeight: number,
): number | null {
  if (!words?.length) return null;
  const safeHeight = Math.max(pageHeight, 1);
  const ratios = words
    .map((w) => Math.max(0, w.bbox.y1 - w.bbox.y0) / safeHeight)
    .filter((r) => r > 0.002 && r < 0.08)
    .sort((a, b) => a - b);
  if (ratios.length === 0) return null;
  return ratios[Math.floor(ratios.length / 2)] ?? null;
}

/** Raw height signal for one OCR line (before group smoothing). */
export function ocrLineHeightRatio(
  bbox: OcrBBox,
  pageHeight: number,
  words?: OcrWord[],
): number {
  const safeH = Math.max(pageHeight, 1);
  const lineRatio = Math.max(0, (bbox.y1 - bbox.y0) / safeH);
  const wordRatio = medianWordHeightRatio(words, pageHeight);
  return Math.max(lineRatio, (wordRatio ?? 0) * 1.15, 0.004);
}

/**
 * Heuristic: cluster lines by similar glyph height, then assign each cluster
 * its length-weighted median height. Body text (longest lines) anchors grouping
 * so titles / labels / fine print stay as separate bands.
 *
 * Typical letter bands relative to body median:
 * - fine / labels  (~0.55–0.75×)
 * - body / address (~1×)
 * - subtitle       (~1.3–1.6×)
 * - title          (~1.8×+)
 */
export function assignOcrFontGroups<T extends OcrLine>(
  lines: T[],
  pageHeight: number,
): Array<OcrFontGroupedLine<T>> {
  if (lines.length === 0) return [];

  const measured = lines.map((line, index) => ({
    index,
    line,
    ratio: ocrLineHeightRatio(line.bbox, pageHeight, line.words),
    weight: Math.max(line.text.replace(/\s+/g, "").length, 1),
  }));

  // Body anchor: median height of longer lines (letter corpus), else overall.
  const longLines = measured.filter((m) => m.weight >= 18);
  const bodyMedian = weightedMedian(
    (longLines.length >= 3 ? longLines : measured).map((m) => ({
      value: m.ratio,
      weight: m.weight,
    })),
  );

  // Relative gap to start a new group (captures title vs body vs labels).
  const gapThreshold = Math.max(bodyMedian * 0.18, 0.0028);

  const sorted = [...measured].sort((a, b) => a.ratio - b.ratio);
  const clusters: Array<typeof measured> = [];
  let current: typeof measured = [];

  for (const item of sorted) {
    if (current.length === 0) {
      current = [item];
      continue;
    }
    const clusterMedian = median(current.map((c) => c.ratio));
    if (item.ratio - clusterMedian > gapThreshold) {
      clusters.push(current);
      current = [item];
    } else {
      current.push(item);
    }
  }
  if (current.length) clusters.push(current);

  // Merge tiny satellite clusters into nearest neighbor (noise from one-off boxes).
  const merged: Array<typeof measured> = [];
  for (const cluster of clusters) {
    const weight = cluster.reduce((s, c) => s + c.weight, 0);
    if (
      merged.length > 0 &&
      cluster.length <= 2 &&
      weight < 24 &&
      Math.abs(
        median(cluster.map((c) => c.ratio)) -
          median(merged[merged.length - 1].map((c) => c.ratio)),
      ) < gapThreshold * 1.35
    ) {
      merged[merged.length - 1].push(...cluster);
    } else {
      merged.push(cluster);
    }
  }

  const groupOfIndex = new Map<number, { id: number; ratio: number }>();
  merged.forEach((cluster, id) => {
    const ratio = weightedMedian(
      cluster.map((c) => ({ value: c.ratio, weight: c.weight })),
    );
    for (const item of cluster) {
      groupOfIndex.set(item.index, { id, ratio });
    }
  });

  // Snap near-body outliers into the dominant body band (stops word-level jitter).
  const bodyBand = bodyMedian * 0.22;
  const bodyGroupRatio =
    [...groupOfIndex.values()]
      .map((g) => g.ratio)
      .sort(
        (a, b) =>
          Math.abs(a - bodyMedian) - Math.abs(b - bodyMedian),
      )[0] ?? bodyMedian;

  let bodyGroupId =
    [...groupOfIndex.entries()].find(
      ([, g]) => Math.abs(g.ratio - bodyGroupRatio) < 1e-6,
    )?.[1].id ?? 0;

  for (const item of measured) {
    if (Math.abs(item.ratio - bodyMedian) <= bodyBand) {
      groupOfIndex.set(item.index, {
        id: bodyGroupId,
        ratio: bodyGroupRatio,
      });
    }
  }

  return lines.map((line, index) => {
    const group = groupOfIndex.get(index) ?? {
      id: 0,
      ratio: bodyMedian || ocrLineHeightRatio(line.bbox, pageHeight, line.words),
    };
    return {
      ...line,
      fontGroupId: group.id,
      fontHeightRatio: group.ratio,
    };
  });
}

/** Convert a group height ratio into CSS px on the displayed page. */
export function fontPxFromHeightRatio(
  fontHeightRatio: number,
  pageClientHeight: number,
): number {
  const safePage = Math.max(pageClientHeight, 1);
  const px =
    safePage * fontHeightRatio * OCR_LINE_HEIGHT_TO_FONT * OCR_FONT_GROUP_FIT;
  return Math.min(Math.max(px, 10), safePage * 0.05);
}
