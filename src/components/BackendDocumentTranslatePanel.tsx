import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  buildHeaders,
  documentFileUrl,
  getDocument,
  translateDocument,
} from "@/api/client";
import type {
  DocumentTranslateResponse,
  LayoutPage,
  TranslatedPage,
  TranslatedPageSegment,
} from "@/api/types";
import { FittingOcrTranslatedLine } from "@/components/FittingOcrTranslatedLine";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import {
  PageLetterContent,
  PagePlainContent,
} from "@/components/LetterTranslateContent";
import {
  looksLikePassthroughSource,
  normalizeTranslateLanguage,
  resolveDefaultTranslateLanguage,
} from "@/constants/translateLanguages";
import {
  resolveLayoutPageResults,
  revokeTranslatedPageBackgrounds,
} from "@/utils/backendLayoutTranslate";
import {
  pageHasMetaSections,
  resolveLetterSections,
} from "@/utils/letterSections";
import type { TranslatedPageResult } from "@/utils/ocrTranslateHelpers";
import { openPdfDocument, renderPdfPageToCanvas } from "@/utils/pdfDocument";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;
const ZOOM_DEFAULT = 1.25;
const PAGE_DISPLAY_REM = 34;

type Phase =
  | "idle"
  | "loading-pdf"
  | "loading-layout"
  | "translating"
  | "done"
  | "error";

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
}

function getPagePaperStyle(
  size: { width: number; height: number } | null | undefined,
): CSSProperties {
  if (!size) {
    return { minHeight: "28rem", width: `${PAGE_DISPLAY_REM}rem` };
  }
  return {
    width: `${PAGE_DISPLAY_REM}rem`,
    aspectRatio: `${size.width} / ${size.height}`,
  };
}

function normalizeTranslatedPages(
  pages: TranslatedPage[] | null | undefined,
): TranslatedPage[] {
  if (!pages?.length) return [];
  return [...pages].sort((a, b) => a.page - b.page);
}

function revokePreviewUrls(urls: Record<number, string>) {
  for (const url of Object.values(urls)) {
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  }
}

function canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("No s'ha pogut generar la vista prèvia de la pàgina."));
          return;
        }
        resolve(URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.82,
    );
  });
}

function syncScrollRatio(source: HTMLElement, target: HTMLElement) {
  const maxSource = source.scrollHeight - source.clientHeight;
  const maxTarget = target.scrollHeight - target.clientHeight;
  if (maxTarget <= 0) {
    target.scrollTop = 0;
    return;
  }
  const ratio = maxSource > 0 ? source.scrollTop / maxSource : 0;
  target.scrollTop = ratio * maxTarget;
}

function translationLoadingLabel(
  phase: Phase,
  statusMessage: string | null,
): string {
  if (statusMessage) return statusMessage;
  if (phase === "loading-layout") return "Carregant layout…";
  if (phase === "translating") return "Traduint document…";
  if (phase === "loading-pdf") return "Carregant document…";
  return "Preparant traducció…";
}

function scrollStageToPage(stage: HTMLElement, page: number) {
  const el = stage.querySelector<HTMLElement>(`[data-translate-page="${page}"]`);
  if (!el) return;
  const top =
    el.getBoundingClientRect().top -
    stage.getBoundingClientRect().top +
    stage.scrollTop;
  stage.scrollTop = Math.max(0, top);
}

function centerStageHorizontally(stage: HTMLElement) {
  const overflow = stage.scrollWidth - stage.clientWidth;
  stage.scrollLeft = overflow > 0 ? overflow / 2 : 0;
}

function TranslationPageBlock({
  page,
  text,
  segments,
  showLetterhead,
  lang,
  dir,
}: {
  page: number;
  text: string;
  segments?: TranslatedPageSegment[] | null;
  showLetterhead: boolean;
  lang?: string;
  dir: "ltr" | "rtl";
}) {
  const sections = resolveLetterSections({ text, segments });

  return (
    <article
      className={`pdf-ocr-paper pdf-ocr-paper--translation pdf-ocr-paper--plain-view${
        sections ? " backend-translate-page--structured" : ""
      }`}
      data-translate-page={page}
      lang={lang}
      dir={dir}
    >
      {sections ? (
        <PageLetterContent
          sections={sections}
          showLetterhead={showLetterhead}
        />
      ) : text.trim() ? (
        <PagePlainContent text={text} />
      ) : (
        <p className="empty-state" style={{ padding: "1.5rem" }}>
          (Pàgina sense text)
        </p>
      )}
    </article>
  );
}

/**
 * Backend layout-preserving translate workspace: original PDF + whitened scan
 * overlay (`layout_pages`), with text fallback when layout is unavailable.
 */
export function BackendDocumentTranslatePanel({
  documentId,
  translatedText,
  translatedPages,
  layoutPages: initialLayoutPages,
  layoutPdfUrl: initialLayoutPdfUrl,
  documentLanguage,
  open,
  onTranslated,
}: {
  documentId: number;
  translatedText?: string | null;
  translatedPages?: TranslatedPage[] | null;
  layoutPages?: LayoutPage[] | null;
  layoutPdfUrl?: string | null;
  /** Classified / metadata language of the source document. */
  documentLanguage?: string | null;
  /** Kept for callers; structure comes from `segments` / markers. */
  docType?: string | null;
  docTypeCa?: string | null;
  open: boolean;
  onTranslated?: (result: DocumentTranslateResponse) => void;
}) {
  const targetLanguage = resolveDefaultTranslateLanguage(documentLanguage);
  const [showLetterhead, setShowLetterhead] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pagePreviews, setPagePreviews] = useState<Record<number, string>>({});
  const [pageSizes, setPageSizes] = useState<
    Record<number, { width: number; height: number }>
  >({});
  const [pageResults, setPageResults] = useState<
    Record<number, TranslatedPageResult>
  >({});
  const [textPages, setTextPages] = useState<TranslatedPage[]>(
    () => normalizeTranslatedPages(translatedPages),
  );
  const [textFallback, setTextFallback] = useState(translatedText ?? "");
  const [rotation, setRotation] = useState(0);

  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const panesRef = useRef<HTMLDivElement | null>(null);
  const originalStageRef = useRef<HTMLDivElement | null>(null);
  const translationStageRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef(false);
  const scrollToPageRef = useRef<number | null>(null);
  const pageNumberRef = useRef(pageNumber);
  const pagePreviewsRef = useRef<Record<number, string>>({});
  const pageResultsRef = useRef<Record<number, TranslatedPageResult>>({});
  const autoStartedRef = useRef(false);
  const translateAbortRef = useRef<AbortController | null>(null);
  const initialLayoutPagesRef = useRef(initialLayoutPages);
  const initialLayoutPdfUrlRef = useRef(initialLayoutPdfUrl);
  const storedLayoutLoadedRef = useRef(false);
  const initialScrollCenteredRef = useRef(false);
  const zoomAnchorRef = useRef<{
    previousZoom: number;
    nextZoom: number;
    original: { x: number; y: number; localX: number; localY: number } | null;
    translation: { x: number; y: number; localX: number; localY: number } | null;
  } | null>(null);

  pageNumberRef.current = pageNumber;
  initialLayoutPagesRef.current = initialLayoutPages;
  initialLayoutPdfUrlRef.current = initialLayoutPdfUrl;

  const metaSource = normalizeTranslateLanguage(documentLanguage);
  const useLayout = Object.keys(pageResults).length > 0;
  const pages = textPages;
  const usePages = pages.length > 0;
  const pagesByNumber = useMemo(() => {
    const map = new Map<number, TranslatedPage>();
    for (const page of pages) map.set(page.page, page);
    return map;
  }, [pages]);

  const combinedText = usePages
    ? pages
        .map((page) => page.text)
        .filter((text) => text.trim())
        .join("\n\n")
    : textFallback;
  const looksArabic =
    targetLanguage === "ar" || /[\u0600-\u06FF]/.test(combinedText);
  const dir = looksArabic ? "rtl" : "ltr";
  const passthrough = looksLikePassthroughSource(documentLanguage);
  const hasAnyText = usePages
    ? pages.some(
        (page) =>
          page.text.trim() || page.segments?.some((s) => s.text.trim()),
      )
    : Boolean(textFallback.trim());
  const canToggleLetterhead =
    !useLayout &&
    (usePages
      ? pages.some((page) => pageHasMetaSections(page))
      : pageHasMetaSections({ text: textFallback, segments: null }));

  const effectivePageCount = Math.max(
    pageCount,
    useLayout
      ? Math.max(...Object.keys(pageResults).map(Number), 1)
      : usePages
        ? Math.max(...pages.map((p) => p.page), 1)
        : hasAnyText
          ? 1
          : 0,
  );
  const pageIndexes = useMemo(
    () => Array.from({ length: effectivePageCount }, (_, i) => i + 1),
    [effectivePageCount],
  );
  const rotationDeg = useMemo(() => {
    const normalized = ((rotation % 360) + 360) % 360;
    return normalized;
  }, [rotation]);
  const stackStyle = useMemo(
    () => ({
      zoom,
      ...(rotationDeg
        ? {
            transform: `rotate(${rotationDeg}deg)`,
            transformOrigin: "center center",
          }
        : {}),
    }),
    [zoom, rotationDeg],
  );

  const busy =
    phase === "loading-pdf" ||
    phase === "loading-layout" ||
    phase === "translating";
  const translationPending = phase !== "done" && phase !== "error";
  const translationLoadingLabelText = translationLoadingLabel(
    phase,
    statusMessage,
  );

  function resolveStageAnchor(
    stage: HTMLElement,
    clientX?: number,
    clientY?: number,
  ): { x: number; y: number; localX: number; localY: number } {
    const rect = stage.getBoundingClientRect();
    const localX =
      clientX != null && clientX >= rect.left && clientX <= rect.right
        ? clientX - rect.left
        : rect.width / 2;
    const localY =
      clientY != null && clientY >= rect.top && clientY <= rect.bottom
        ? clientY - rect.top
        : rect.height / 2;

    return {
      x: (stage.scrollLeft + localX) / Math.max(zoom, 0.01),
      y: (stage.scrollTop + localY) / Math.max(zoom, 0.01),
      localX,
      localY,
    };
  }

  function applyZoom(nextZoom: number, clientX?: number, clientY?: number) {
    const clamped = clampZoom(nextZoom);
    if (clamped === zoom) return;

    const original = originalStageRef.current;
    const translation = translationStageRef.current;
    zoomAnchorRef.current = {
      previousZoom: zoom,
      nextZoom: clamped,
      original: original ? resolveStageAnchor(original, clientX, clientY) : null,
      translation: translation
        ? resolveStageAnchor(translation, clientX, clientY)
        : null,
    };
    setZoom(clamped);
  }

  function goToPage(next: number) {
    const clamped = Math.min(Math.max(1, next), Math.max(effectivePageCount, 1));
    scrollToPageRef.current = clamped;
    setPageNumber(clamped);
  }

  function clearPageResults() {
    revokeTranslatedPageBackgrounds(pageResultsRef.current);
    pageResultsRef.current = {};
    setPageResults({});
  }

  async function applyLayoutPages(
    layoutPages: LayoutPage[],
    signal?: AbortSignal,
  ) {
    setStatusMessage("Carregant fons de pàgina…");
    const resolved = await resolveLayoutPageResults(layoutPages, signal);
    if (signal?.aborted) return;
    clearPageResults();
    pageResultsRef.current = resolved;
    setPageResults(resolved);
  }

  async function loadStoredLayoutPages(
    layoutPages: LayoutPage[],
    signal: AbortSignal,
  ) {
    setPhase("loading-layout");
    setError(null);
    setStatusMessage("Carregant layout…");
    await applyLayoutPages(layoutPages, signal);
    if (signal.aborted) return;
    setStatusMessage(null);
    setPhase("done");
    goToPage(1);
  }

  async function resolveStoredLayout(
    signal: AbortSignal,
  ): Promise<LayoutPage[] | null> {
    const fromProps = initialLayoutPagesRef.current;
    if (fromProps?.length) return fromProps;

    const doc = await getDocument(documentId);
    if (signal.aborted) return null;

    if (doc.layout_pages?.length) {
      initialLayoutPagesRef.current = doc.layout_pages;
      if (doc.layout_pdf_url) {
        initialLayoutPdfUrlRef.current = doc.layout_pdf_url;
      }
      if (doc.translated_text) setTextFallback(doc.translated_text);
      if (doc.translated_pages?.length) {
        setTextPages(normalizeTranslatedPages(doc.translated_pages));
      }
      return doc.layout_pages;
    }

    return null;
  }

  async function bootstrapLayout(force = false) {
    if (force) {
      storedLayoutLoadedRef.current = false;
    }
    translateAbortRef.current?.abort();
    const ac = new AbortController();
    translateAbortRef.current = ac;
    const signal = ac.signal;

    try {
      if (!force) {
        const stored = await resolveStoredLayout(signal);
        if (signal.aborted || translateAbortRef.current !== ac) return;
        if (stored?.length) {
          await loadStoredLayoutPages(stored, signal);
          return;
        }
      }

      setPhase("translating");
      setError(null);
      setStatusMessage("Traduint…");

      const result = await translateDocument(documentId, {
        target_language: targetLanguage,
        preserve_layout: true,
      });

      if (signal.aborted || translateAbortRef.current !== ac) return;

      setTextFallback(result.translated_text ?? "");
      setTextPages(normalizeTranslatedPages(result.translated_pages));
      initialLayoutPagesRef.current = result.layout_pages ?? null;
      initialLayoutPdfUrlRef.current = result.layout_pdf_url ?? null;
      onTranslated?.(result);

      if (result.layout_pages?.length) {
        await applyLayoutPages(result.layout_pages, signal);
      } else {
        clearPageResults();
      }

      if (signal.aborted || translateAbortRef.current !== ac) return;

      setStatusMessage(null);
      setPhase("done");
      goToPage(1);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(
        err instanceof Error
          ? err.message
          : "No s'ha pogut completar la traducció.",
      );
      setPhase("error");
      setStatusMessage(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    setShowLetterhead(true);
    setPageNumber(1);
    setZoom(ZOOM_DEFAULT);
    setError(null);
    setStatusMessage(null);
    setPhase("idle");
    setTextPages(normalizeTranslatedPages(translatedPages));
    setTextFallback(translatedText ?? "");
    setRotation(0);
    translateAbortRef.current?.abort();
    clearPageResults();
    autoStartedRef.current = false;
    storedLayoutLoadedRef.current = false;
    initialScrollCenteredRef.current = false;
    scrollToPageRef.current = 1;
    // Reset only when opening / switching documents — not when parent props
    // update after our own translate callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [open, documentId]);

  // Load original PDF page previews.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const ac = new AbortController();

    revokePreviewUrls(pagePreviewsRef.current);
    pagePreviewsRef.current = {};
    setPagePreviews({});
    setPageSizes({});
    setPageCount(0);
    setPhase("loading-pdf");

    (async () => {
      try {
        const previous = pdfRef.current;
        pdfRef.current = null;
        if (previous) void previous.cleanup();

        const res = await fetch(documentFileUrl(documentId), {
          headers: buildHeaders(),
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        if (cancelled) return;

        const blob = new Blob([data], { type: "application/pdf" });
        const objectUrl = URL.createObjectURL(blob);
        try {
          const pdf = await openPdfDocument(objectUrl, ac.signal);
          if (cancelled) {
            void pdf.cleanup();
            return;
          }
          pdfRef.current = pdf;
          setPageCount(pdf.numPages);

          const nextPreviews: Record<number, string> = {};
          const nextSizes: Record<number, { width: number; height: number }> =
            {};

          for (let page = 1; page <= pdf.numPages; page++) {
            ac.signal.throwIfAborted();
            const canvas = await renderPdfPageToCanvas(pdf, page, {
              scale: 1.35,
              signal: ac.signal,
            });
            if (cancelled) return;
            nextPreviews[page] = await canvasToObjectUrl(canvas);
            nextSizes[page] = { width: canvas.width, height: canvas.height };
            pagePreviewsRef.current = nextPreviews;
            setPagePreviews({ ...nextPreviews });
            setPageSizes({ ...nextSizes });
          }

          if (!cancelled) setPhase((p) => (p === "loading-pdf" ? "idle" : p));
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error
            ? err.message
            : "No s'ha pogut obrir el PDF per comparar.",
        );
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [open, documentId]);

  // Use stored layout_pages when the document already has them.
  useEffect(() => {
    if (!open || !initialLayoutPages?.length || storedLayoutLoadedRef.current) {
      return;
    }
    if (Object.keys(pageResultsRef.current).length > 0) {
      storedLayoutLoadedRef.current = true;
      return;
    }
    storedLayoutLoadedRef.current = true;
    autoStartedRef.current = true;
    translateAbortRef.current?.abort();
    const ac = new AbortController();
    translateAbortRef.current = ac;
    void loadStoredLayoutPages(initialLayoutPages, ac.signal);
  }, [open, initialLayoutPages, initialLayoutPdfUrl]);

  // No stored layout yet — fetch document or run backend translate.
  useEffect(() => {
    if (!open || initialLayoutPages?.length) return;
    if (autoStartedRef.current) return;
    if (phase !== "idle") return;
    autoStartedRef.current = true;
    void bootstrapLayout(false);
  }, [open, initialLayoutPages, phase]);

  useEffect(() => {
    return () => {
      translateAbortRef.current?.abort();
      const pdf = pdfRef.current;
      pdfRef.current = null;
      if (pdf) void pdf.cleanup();
      revokePreviewUrls(pagePreviewsRef.current);
      pagePreviewsRef.current = {};
      clearPageResults();
    };
  }, []);

  useEffect(() => {
    if (open) return;
    translateAbortRef.current?.abort();
    const pdf = pdfRef.current;
    pdfRef.current = null;
    if (pdf) void pdf.cleanup();
    clearPageResults();
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const targetPage = scrollToPageRef.current;
    if (targetPage == null || targetPage !== pageNumber) return;
    scrollToPageRef.current = null;

    const original = originalStageRef.current;
    const translation = translationStageRef.current;
    syncingScrollRef.current = true;
    if (original) scrollStageToPage(original, targetPage);
    if (translation) scrollStageToPage(translation, targetPage);
    requestAnimationFrame(() => {
      syncingScrollRef.current = false;
    });
  }, [open, pageNumber, pagePreviews, pageResults, textPages, textFallback]);

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = zoomAnchorRef.current;
    if (!anchor || anchor.nextZoom !== zoom) return;

    const original = originalStageRef.current;
    const translation = translationStageRef.current;

    const restoreStageScroll = (
      stage: HTMLElement | null,
      point: { x: number; y: number; localX: number; localY: number } | null,
    ) => {
      if (!stage || !point) return;
      stage.scrollLeft = Math.max(0, point.x * zoom - point.localX);
      stage.scrollTop = Math.max(0, point.y * zoom - point.localY);
    };

    syncingScrollRef.current = true;
    restoreStageScroll(original, anchor.original);
    restoreStageScroll(translation, anchor.translation);
    requestAnimationFrame(() => {
      syncingScrollRef.current = false;
    });
    zoomAnchorRef.current = null;
  }, [open, zoom]);

  useLayoutEffect(() => {
    if (!open || initialScrollCenteredRef.current) return;
    if (Object.keys(pagePreviews).length === 0 && !pageResultsRef.current[1]) {
      return;
    }

    const original = originalStageRef.current;
    const translation = translationStageRef.current;
    if (!original || !translation) return;

    initialScrollCenteredRef.current = true;
    syncingScrollRef.current = true;
    centerStageHorizontally(original);
    centerStageHorizontally(translation);
    requestAnimationFrame(() => {
      syncingScrollRef.current = false;
    });
  }, [open, pagePreviews, pageResults]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key !== "+" && e.key !== "=" && e.key !== "-" && e.key !== "0")
        return;
      const panes = panesRef.current;
      if (!panes) return;
      const target = e.target;
      if (!(target instanceof Node) || !panes.contains(target)) {
        if (!panes.matches(":hover")) return;
      }
      e.preventDefault();
      if (e.key === "0") {
        applyZoom(1);
        return;
      }
      const delta = e.key === "-" ? -ZOOM_STEP : ZOOM_STEP;
      applyZoom(zoom + delta);
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open, zoom]);

  useEffect(() => {
    if (!open) return;
    const panes = panesRef.current;
    if (!panes) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      applyZoom(zoom + delta, e.clientX, e.clientY);
    };

    panes.addEventListener("wheel", onWheel, { passive: false });
    return () => panes.removeEventListener("wheel", onWheel);
  }, [open, zoom]);

  useEffect(() => {
    if (!open) return;
    const original = originalStageRef.current;
    const translation = translationStageRef.current;
    if (!original || !translation) return;

    const onOriginalScroll = () => {
      if (syncingScrollRef.current) return;
      syncingScrollRef.current = true;
      syncScrollRatio(original, translation);
      updatePageFromStage(original);
      requestAnimationFrame(() => {
        syncingScrollRef.current = false;
      });
    };

    const onTranslationScroll = () => {
      if (syncingScrollRef.current) return;
      syncingScrollRef.current = true;
      syncScrollRatio(translation, original);
      updatePageFromStage(translation);
      requestAnimationFrame(() => {
        syncingScrollRef.current = false;
      });
    };

    function updatePageFromStage(stage: HTMLElement) {
      const els = stage.querySelectorAll<HTMLElement>("[data-translate-page]");
      if (els.length === 0) return;

      const stageTop =
        stage.getBoundingClientRect().top + stage.clientHeight * 0.35;
      let bestPage = pageNumberRef.current;
      let bestDistance = Number.POSITIVE_INFINITY;

      els.forEach((el) => {
        const page = Number(el.dataset.translatePage);
        if (!Number.isFinite(page)) return;
        const rect = el.getBoundingClientRect();
        const distance = Math.abs(rect.top - stageTop);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPage = page;
        }
      });

      if (bestPage !== pageNumberRef.current) {
        setPageNumber(bestPage);
      }
    }

    original.addEventListener("scroll", onOriginalScroll, { passive: true });
    translation.addEventListener("scroll", onTranslationScroll, {
      passive: true,
    });
    return () => {
      original.removeEventListener("scroll", onOriginalScroll);
      translation.removeEventListener("scroll", onTranslationScroll);
    };
  }, [open, effectivePageCount]);

  if (!open) return null;

  return (
    <div className="pdf-ocr-workspace pdf-layout-translate-workspace">
      <div className="pdf-ocr-workspace-toolbar">
        <div className="pdf-ocr-workspace-pager">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy || pageNumber <= 1}
            onClick={() => goToPage(pageNumber - 1)}
          >
            ←
          </button>
          <span>
            Pàg. {pageNumber}
            {effectivePageCount ? ` / ${effectivePageCount}` : ""}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy || !effectivePageCount || pageNumber >= effectivePageCount}
            onClick={() => goToPage(pageNumber + 1)}
          >
            →
          </button>
        </div>

        <div
          className="pdf-ocr-workspace-zoom"
          role="group"
          aria-label="Zoom document"
        >
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy || zoom <= ZOOM_MIN}
            onClick={() => applyZoom(zoom - 0.25)}
            title="Allunyar"
          >
            −
          </button>
          <span className="pdf-ocr-workspace-zoom-label">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy || zoom >= ZOOM_MAX}
            onClick={() => applyZoom(zoom + 0.25)}
            title="Apropar"
          >
            +
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy || zoom === 1}
            onClick={() => applyZoom(1)}
          >
            100%
          </button>
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={() => setRotation((deg) => (deg + 90) % 360)}
          title="Rotar 90°"
        >
          Rotar
        </button>

        {canToggleLetterhead && (
          <label className="checkbox-label backend-translate-letterhead-toggle">
            <input
              type="checkbox"
              checked={showLetterhead}
              onChange={(event) => setShowLetterhead(event.target.checked)}
            />
            Mostrar capçalera
          </label>
        )}

        {statusMessage && (
          <p className="pdf-ocr-workspace-status" aria-live="polite">
            {statusMessage}
          </p>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="pdf-ocr-workspace-panes" ref={panesRef}>
        <section
          className="pdf-ocr-workspace-pane"
          aria-label="Document original"
        >
          <h4 className="pdf-ocr-workspace-pane-title">Original</h4>
          <div
            className="pdf-ocr-doc-stage pdf-ocr-doc-stage--original"
            ref={originalStageRef}
          >
            <div className="pdf-ocr-doc-stack" style={stackStyle}>
              {pageIndexes.length === 0 ? (
                <div
                  className="pdf-ocr-paper pdf-ocr-paper--original"
                  style={getPagePaperStyle(null)}
                >
                  <p className="empty-state" style={{ padding: "1.5rem" }}>
                    Carregant document…
                  </p>
                </div>
              ) : (
                pageIndexes.map((page) => {
                  const preview = pagePreviews[page];
                  const size = pageSizes[page];
                  return (
                    <div
                      key={`original-${page}`}
                      className="pdf-ocr-paper pdf-ocr-paper--original"
                      data-translate-page={page}
                      style={getPagePaperStyle(size)}
                    >
                      {preview ? (
                        <img
                          src={preview}
                          alt={`Pàgina ${page}`}
                          draggable={false}
                        />
                      ) : (
                        <p
                          className="empty-state"
                          style={{ padding: "1.5rem" }}
                        >
                          Carregant pàgina {page}…
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section
          className="pdf-ocr-workspace-pane"
          aria-label="Document traduït"
        >
          <h4 className="pdf-ocr-workspace-pane-title">
            Traducció
            {useLayout
              ? ` (${metaSource ?? "auto"} → ${targetLanguage})`
              : null}
            {passthrough && (
              <span className="backend-translate-badge">
                Original ({metaSource ?? "ca/es"})
              </span>
            )}
          </h4>
          <div
            className="pdf-ocr-doc-stage"
            ref={translationStageRef}
            aria-busy={translationPending}
          >
            {translationPending && (
              <div className="pdf-ocr-doc-stage-loading" aria-live="polite">
                <LoadingSpinner label={translationLoadingLabelText} />
              </div>
            )}
            <div
              className={`pdf-ocr-doc-stack${
                translationPending ? " pdf-ocr-doc-stack--pending" : ""
              }`}
              style={stackStyle}
            >
              {useLayout
                ? pageIndexes.map((page) => {
                    const result = pageResults[page] ?? null;
                    const preview = pagePreviews[page];
                    const size = pageSizes[page];
                    const layoutW = result?.width ?? size?.width ?? 1;
                    const layoutH = result?.height ?? size?.height ?? 1;
                    const hasLines = Boolean(result && result.lines.length > 0);
                    const paperStyle = getPagePaperStyle(
                      result
                        ? { width: result.width, height: result.height }
                        : size,
                    );

                    return (
                      <div
                        key={`translation-${page}`}
                        className="pdf-ocr-paper pdf-ocr-paper--translation pdf-ocr-paper--on-scan"
                        data-translate-page={page}
                        lang={targetLanguage}
                        dir={dir}
                        style={paperStyle}
                      >
                        {hasLines && result ? (
                          <>
                            <img
                              className="pdf-ocr-page-bg"
                              src={result.backgroundUrl}
                              alt=""
                              draggable={false}
                            />
                            <div className="pdf-ocr-page-layout">
                              {result.lines.map((line, index) => (
                                <FittingOcrTranslatedLine
                                  key={`p${page}-l${index}-${line.bbox.y0}-${line.bbox.x0}`}
                                  text={line.translated}
                                  title={line.text}
                                  bbox={line.bbox}
                                  layoutW={layoutW}
                                  layoutH={layoutH}
                                  align={line.align ?? "left"}
                                  words={line.words}
                                  fontHeightRatio={line.fontHeightRatio}
                                  fontGroupId={line.fontGroupId}
                                />
                              ))}
                            </div>
                          </>
                        ) : preview && !busy && phase === "done" ? (
                          <img
                            className="pdf-ocr-page-bg"
                            src={preview}
                            alt={`Vista prèvia pàgina ${page}`}
                            draggable={false}
                            style={{ opacity: 0.35 }}
                          />
                        ) : (
                          <p
                            className="empty-state"
                            style={{
                              padding: "1.5rem",
                              position: "relative",
                            }}
                          >
                            {page === 1 ? "Preparant layout…" : `Pàgina ${page}`}
                          </p>
                        )}
                      </div>
                    );
                  })
                : !hasAnyText ? (
                    <div
                      className="pdf-ocr-paper pdf-ocr-paper--translation pdf-ocr-paper--plain-view"
                      data-translate-page={1}
                      lang={metaSource ?? undefined}
                      dir={dir}
                    >
                      <p
                        className="empty-state"
                        style={{ padding: "1.5rem", position: "relative" }}
                      >
                        Aquest document no té text traduït.
                      </p>
                    </div>
                  ) : usePages ? (
                    pageIndexes.map((page) => {
                      const entry = pagesByNumber.get(page);
                      return (
                        <TranslationPageBlock
                          key={page}
                          page={page}
                          text={entry?.text ?? ""}
                          segments={entry?.segments}
                          showLetterhead={showLetterhead}
                          lang={metaSource ?? undefined}
                          dir={dir}
                        />
                      );
                    })
                  ) : (
                    <TranslationPageBlock
                      page={1}
                      text={textFallback}
                      showLetterhead={showLetterhead}
                      lang={metaSource ?? undefined}
                      dir={dir}
                    />
                  )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
