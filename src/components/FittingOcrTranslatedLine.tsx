import { useLayoutEffect, useRef, useState } from "react";
import {
  fitOcrLineFontSizeRem,
  ocrLineFontSizeRem,
} from "@/utils/ocrLineFontSize";
import type { OcrBBox } from "@/utils/ocrImage";

/**
 * Absolutely positioned OCR translation line that shrinks its font until the
 * text fits the available box (translations are often longer than the source).
 */
export function FittingOcrTranslatedLine({
  text,
  title,
  bbox,
  layoutW,
  layoutH,
}: {
  text: string;
  title?: string;
  bbox: OcrBBox;
  layoutW: number;
  layoutH: number;
}) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const initialRem = ocrLineFontSizeRem(bbox, layoutH);
  const [fontSizeRem, setFontSizeRem] = useState(initialRem);

  const left = (bbox.x0 / layoutW) * 100;
  const top = (bbox.y0 / layoutH) * 100;
  const naturalWidth = ((bbox.x1 - bbox.x0) / layoutW) * 100;
  // Longer translations: use remaining space toward the right margin.
  const width = Math.min(
    Math.max(naturalWidth, 8),
    Math.max(12, 98 - left),
  );
  const heightPct = Math.max(
    ((bbox.y1 - bbox.y0) / layoutH) * 100,
    0.6,
  );
  // Allow slight vertical growth before shrinking further.
  const maxHeightPct = heightPct * 1.45;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const applyFit = () => {
      const page = el.offsetParent as HTMLElement | null;
      const pageHeight = page?.clientHeight ?? el.clientHeight;
      const maxHeightPx = Math.max(8, (maxHeightPct / 100) * pageHeight);
      const fitted = fitOcrLineFontSizeRem(el, initialRem, maxHeightPx);
      setFontSizeRem(fitted);
    };

    applyFit();

    const page = el.offsetParent;
    if (!page || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver(() => applyFit());
    ro.observe(page);
    return () => ro.disconnect();
  }, [text, initialRem, maxHeightPct, width, layoutW, layoutH]);

  return (
    <p
      ref={ref}
      className="pdf-ocr-page-line"
      style={{
        top: `${top}%`,
        left: `${left}%`,
        width: `${width}%`,
        maxHeight: `${maxHeightPct}%`,
        fontSize: `${fontSizeRem}rem`,
      }}
      title={title ?? text}
    >
      {text}
    </p>
  );
}
