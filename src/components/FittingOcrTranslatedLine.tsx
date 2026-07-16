import { useLayoutEffect, useRef, useState } from "react";
import {
  fitOcrLineFontSizePx,
  ocrLineFontSizePx,
} from "@/utils/ocrLineFontSize";
import { fontPxFromHeightRatio } from "@/utils/ocrFontGroups";
import type { OcrBBox, OcrTextAlign, OcrWord } from "@/utils/ocrImage";

/**
 * Absolutely positioned OCR translation line. Prefers the typographic group's
 * median height; only shrinks when the translation cannot fit the box.
 */
export function FittingOcrTranslatedLine({
  text,
  title,
  bbox,
  layoutW,
  layoutH,
  align = "left",
  words,
  fontHeightRatio,
  fontGroupId,
}: {
  text: string;
  title?: string;
  bbox: OcrBBox;
  layoutW: number;
  layoutH: number;
  align?: OcrTextAlign;
  words?: OcrWord[];
  /** Page-relative median height for this line's font group. */
  fontHeightRatio?: number;
  fontGroupId?: number;
}) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [fontSizePx, setFontSizePx] = useState(12);

  const leftRatio = bbox.x0 / layoutW;
  const naturalWidthRatio = Math.max((bbox.x1 - bbox.x0) / layoutW, 0.04);
  const sourceLen = Math.max((title ?? text).trim().length, 1);
  const lengthRatio = Math.max(1, text.trim().length / sourceLen);

  let left = leftRatio * 100;
  let width: number;

  if (align === "center") {
    const grown = Math.min(0.92, naturalWidthRatio * Math.min(lengthRatio, 1.55));
    width = grown * 100;
    left = Math.max(2, (100 - width) / 2);
  } else if (align === "right") {
    width = Math.min(naturalWidthRatio * Math.min(lengthRatio, 1.35), 0.94) * 100;
    left = Math.max(2, 98 - width);
  } else if (align === "justify") {
    width = Math.min(Math.max(naturalWidthRatio, 0.55), 0.92) * 100;
    left = leftRatio * 100;
  } else {
    // Left: grow toward the right margin for longer MT; keep source left edge.
    width =
      Math.min(
        Math.max(naturalWidthRatio * Math.min(lengthRatio, 1.65), 0.1),
        Math.max(0.94 - leftRatio, naturalWidthRatio),
      ) * 100;
    left = leftRatio * 100;
  }

  const heightPct = Math.max(((bbox.y1 - bbox.y0) / layoutH) * 100, 0.85);
  const maxHeightPct = heightPct * 1.12;
  const top = (bbox.y0 / layoutH) * 100;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const applyFit = () => {
      const page = el.offsetParent as HTMLElement | null;
      const pageHeight = page?.clientHeight ?? el.clientHeight;
      const maxHeightPx = Math.max(10, (maxHeightPct / 100) * pageHeight);

      if (fontHeightRatio != null && fontHeightRatio > 0) {
        // Group median already scaled by OCR_FONT_GROUP_FIT — keep members uniform.
        const groupPx = fontPxFromHeightRatio(fontHeightRatio, pageHeight);
        el.style.fontSize = `${groupPx}px`;
        setFontSizePx(groupPx);
        return;
      }

      const initialPx = ocrLineFontSizePx(
        bbox,
        layoutH,
        pageHeight,
        words,
        text.trim().length,
      );
      const minPx = align === "center" ? Math.max(11, initialPx * 0.75) : 10;
      const fitted = fitOcrLineFontSizePx(el, initialPx, maxHeightPx, minPx);
      setFontSizePx(fitted);
    };

    applyFit();

    const page = el.offsetParent;
    if (!page || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver(() => applyFit());
    ro.observe(page);
    return () => ro.disconnect();
  }, [
    text,
    title,
    bbox,
    layoutW,
    layoutH,
    align,
    words,
    fontHeightRatio,
    maxHeightPct,
    width,
  ]);

  return (
    <p
      ref={ref}
      className={`pdf-ocr-page-line pdf-ocr-page-line--${align}`}
      data-ocr-align={align}
      data-font-group={fontGroupId ?? undefined}
      style={{
        top: `${top}%`,
        left: `${left}%`,
        width: `${width}%`,
        maxHeight: `${maxHeightPct}%`,
        fontSize: `${fontSizePx}px`,
        textAlign: align,
      }}
      title={title ?? text}
    >
      {text}
    </p>
  );
}
