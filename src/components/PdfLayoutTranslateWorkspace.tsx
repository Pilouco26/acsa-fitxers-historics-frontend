import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { FittingOcrTranslatedLine } from "@/components/FittingOcrTranslatedLine";
import {
  createBrowserTranslator,
  getTranslatorAvailability,
  isBrowserTranslatorSupported,
  translateWithBrowserTranslator,
} from "@/utils/browserTranslate";
import { openPdfDocument, renderPdfPageToCanvas } from "@/utils/pdfDocument";
import {
  ocrAndTranslateCanvas,
  type TranslatedPageResult,
} from "@/utils/ocrTranslateHelpers";
import {
  TRANSLATE_LANGUAGE_OPTIONS,
  normalizeTranslateLanguage,
  resolveDefaultTranslateLanguage,
  type TranslateLanguageCode,
} from "@/constants/translateLanguages";

const CHROME_TRANSLATOR_LANGS = new Set([
  "ar",
  "de",
  "en",
  "es",
  "fr",
  "it",
  "pt",
  "zh",
]);

const CHROME_LANG_OPTIONS = TRANSLATE_LANGUAGE_OPTIONS.filter((option) =>
  CHROME_TRANSLATOR_LANGS.has(option.value),
);

/** Origen from document metadata.language when Chrome supports it. */
function resolveChromeSource(
  documentLanguage?: string | null,
): TranslateLanguageCode {
  const fromMetadata = normalizeTranslateLanguage(documentLanguage);
  if (fromMetadata && CHROME_TRANSLATOR_LANGS.has(fromMetadata)) {
    return fromMetadata;
  }
  return "fr";
}

function resolveChromeDefaultTarget(
  preferred?: TranslateLanguageCode | null,
  source?: TranslateLanguageCode | null,
): TranslateLanguageCode {
  const candidate =
    preferred && CHROME_TRANSLATOR_LANGS.has(preferred)
      ? preferred
      : resolveDefaultTranslateLanguage(source);
  if (CHROME_TRANSLATOR_LANGS.has(candidate) && candidate !== source) {
    return candidate;
  }
  if (source === "es") return "fr";
  return "es";
}

type Phase =
  | "idle"
  | "preparing-model"
  | "rendering"
  | "ocr"
  | "translating"
  | "done"
  | "error";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;
const ZOOM_DEFAULT = 1.5;

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
}

function busyPhase(phase: Phase): boolean {
  return (
    phase === "preparing-model" ||
    phase === "rendering" ||
    phase === "ocr" ||
    phase === "translating"
  );
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

function scrollStageToPage(stage: HTMLElement, page: number) {
  const el = stage.querySelector<HTMLElement>(`[data-ocr-page="${page}"]`);
  if (!el) return;
  const top =
    el.getBoundingClientRect().top -
    stage.getBoundingClientRect().top +
    stage.scrollTop;
  stage.scrollTop = Math.max(0, top);
}

/**
 * DEV workspace: recreate PDF page layout with translated text overlaid on a
 * whitened scan using OCR bboxes, inferred alignment, and line font sizes.
 * Independent of `PdfOcrTranslateWorkspace` (letter Capçalera/Cos/Peu view).
 */
export function PdfLayoutTranslateWorkspace({
  objectUrl,
  open,
  documentLanguage,
  defaultTargetLanguage,
}: {
  objectUrl: string | null;
  open: boolean;
  documentLanguage?: string | null;
  defaultTargetLanguage?: TranslateLanguageCode | null;
}) {
  const supported = isBrowserTranslatorSupported();
  const sourceFromMetadata = resolveChromeSource(documentLanguage);
  const [packSourceLanguage, setPackSourceLanguage] =
    useState<TranslateLanguageCode>(sourceFromMetadata);
  const [targetLanguage, setTargetLanguage] = useState<TranslateLanguageCode>(
    () => resolveChromeDefaultTarget(defaultTargetLanguage, sourceFromMetadata),
  );
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pagePreviews, setPagePreviews] = useState<Record<number, string>>({});
  const [pageSizes, setPageSizes] = useState<
    Record<number, { width: number; height: number }>
  >({});
  const [pageResults, setPageResults] = useState<
    Record<number, TranslatedPageResult>
  >({});
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);

  const abortRef = useRef<AbortController | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const panesRef = useRef<HTMLDivElement | null>(null);
  const originalStageRef = useRef<HTMLDivElement | null>(null);
  const translationStageRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef(false);
  const scrollToPageRef = useRef<number | null>(null);
  const pageNumberRef = useRef(pageNumber);
  const pagePreviewsRef = useRef<Record<number, string>>({});
  const autoStartedRef = useRef(false);
  // Skip one-shot pane-fit; default zoom is 150% (user can still use "Ajustar").
  const fitAppliedRef = useRef(true);
  const packSourceLanguageRef = useRef(packSourceLanguage);
  const targetLanguageRef = useRef(targetLanguage);
  const zoomRef = useRef(zoom);

  pageNumberRef.current = pageNumber;
  packSourceLanguageRef.current = packSourceLanguage;
  targetLanguageRef.current = targetLanguage;
  zoomRef.current = zoom;

  const pageIndexes = useMemo(
    () => Array.from({ length: pageCount }, (_, i) => i + 1),
    [pageCount],
  );

  function goToPage(next: number) {
    const clamped = Math.min(Math.max(1, next), Math.max(pageCount, 1));
    scrollToPageRef.current = clamped;
    setPageNumber(clamped);
  }

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const source = resolveChromeSource(documentLanguage);
    setPackSourceLanguage(source);
    setTargetLanguage(
      resolveChromeDefaultTarget(defaultTargetLanguage, source),
    );
    setPageNumber(1);
    setPhase("idle");
    setProgress(0);
    setStatusMessage(null);
    setError(null);
    setPageResults({});
    setZoom(ZOOM_DEFAULT);
    scrollToPageRef.current = 1;
    autoStartedRef.current = false;
    // Skip auto-fit so the 150% default sticks; user can still use "Ajustar".
    fitAppliedRef.current = true;
  }, [open, objectUrl, documentLanguage, defaultTargetLanguage]);

  useEffect(() => {
    if (!open || !objectUrl) return;

    let cancelled = false;
    const ac = new AbortController();

    revokePreviewUrls(pagePreviewsRef.current);
    pagePreviewsRef.current = {};
    setPagePreviews({});
    setPageSizes({});
    setPageCount(0);

    (async () => {
      try {
        const previous = pdfRef.current;
        pdfRef.current = null;
        if (previous) void previous.cleanup();

        const pdf = await openPdfDocument(objectUrl, ac.signal);
        if (cancelled) {
          void pdf.cleanup();
          return;
        }
        pdfRef.current = pdf;
        setPageCount(pdf.numPages);

        const nextPreviews: Record<number, string> = {};
        const nextSizes: Record<number, { width: number; height: number }> = {};

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
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error
            ? err.message
            : "No s'ha pogut obrir el PDF per traduir.",
        );
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [open, objectUrl]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      const pdf = pdfRef.current;
      pdfRef.current = null;
      if (pdf) void pdf.cleanup();
      revokePreviewUrls(pagePreviewsRef.current);
      pagePreviewsRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    const pdf = pdfRef.current;
    pdfRef.current = null;
    if (pdf) void pdf.cleanup();
  }, [open]);

  // Fit page to pane once (like Vista prèvia fill), then leave zoom to the user.
  useLayoutEffect(() => {
    if (!open || pageCount < 1 || fitAppliedRef.current) return;
    const stage = originalStageRef.current;
    if (!stage) return;
    const paper = stage.querySelector<HTMLElement>(".pdf-ocr-paper--original");
    if (!paper || paper.offsetHeight < 32) return;

    const availableW = Math.max(stage.clientWidth - 12, 1);
    const availableH = Math.max(stage.clientHeight - 12, 1);
    const currentZoom = Math.max(zoomRef.current, 0.01);
    const naturalW = paper.offsetWidth / currentZoom;
    const naturalH = paper.offsetHeight / currentZoom;
    if (naturalW < 8 || naturalH < 8) return;
    const fit = Math.min(availableW / naturalW, availableH / naturalH);
    const next = clampZoom(Math.min(fit * 0.98, ZOOM_MAX));
    fitAppliedRef.current = true;
    setZoom(next);
  }, [open, pageCount, pagePreviews]);

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
  }, [open, pageNumber, pagePreviews, pageResults]);

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
        fitAppliedRef.current = false;
        const stage = originalStageRef.current;
        const paper = stage?.querySelector<HTMLElement>(".pdf-ocr-paper--original");
        if (stage && paper) {
          const availableW = Math.max(stage.clientWidth - 12, 1);
          const availableH = Math.max(stage.clientHeight - 12, 1);
          const naturalW = paper.offsetWidth / Math.max(zoomRef.current, 0.01);
          const naturalH = paper.offsetHeight / Math.max(zoomRef.current, 0.01);
          const fit = Math.min(availableW / naturalW, availableH / naturalH);
          fitAppliedRef.current = true;
          setZoom(clampZoom(Math.min(fit * 0.98, ZOOM_MAX)));
        } else {
          setZoom(ZOOM_DEFAULT);
        }
        return;
      }
      const delta = e.key === "-" ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((z) => clampZoom(z + delta));
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panes = panesRef.current;
    if (!panes) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((z) => clampZoom(z + delta));
    };

    panes.addEventListener("wheel", onWheel, { passive: false });
    return () => panes.removeEventListener("wheel", onWheel);
  }, [open]);

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
      const pages = stage.querySelectorAll<HTMLElement>("[data-ocr-page]");
      if (pages.length === 0) return;

      const stageTop =
        stage.getBoundingClientRect().top + stage.clientHeight * 0.35;
      let bestPage = pageNumberRef.current;
      let bestDistance = Number.POSITIVE_INFINITY;

      pages.forEach((el) => {
        const page = Number(el.dataset.ocrPage);
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
  }, [open, pageCount]);

  async function runOcrAndTranslateAll() {
    const sourceLang = packSourceLanguageRef.current;
    const targetLang = targetLanguageRef.current;

    if (!objectUrl) {
      setError("Encara no hi ha cap PDF carregat.");
      setPhase("error");
      return;
    }
    if (!supported) {
      setError(
        "La traducció al navegador no està disponible. Obriu l'aplicació amb Google Chrome d'escriptori.",
      );
      setPhase("error");
      return;
    }
    if (sourceLang === targetLang) {
      setError("L'idioma d'origen i el de destinació han de ser diferents.");
      setPhase("error");
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      setError(null);
      setPageResults({});

      setPhase("preparing-model");
      setStatusMessage(
        `Preparant la traducció (${sourceLang} → ${targetLang})…`,
      );
      setProgress(0);
      const availability = await getTranslatorAvailability(
        sourceLang,
        targetLang,
      );
      if (availability === "unavailable") {
        throw new Error(
          `El parell ${sourceLang} → ${targetLang} no està disponible al navegador.`,
        );
      }

      const translator = await createBrowserTranslator({
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        onDownloadProgress: (ratio) => setProgress(ratio),
      });

      try {
        let pdf = pdfRef.current;
        if (!pdf) {
          pdf = await openPdfDocument(objectUrl, ac.signal);
          pdfRef.current = pdf;
          setPageCount(pdf.numPages);
        }

        const totalPages = pdf.numPages;
        if (totalPages < 1) {
          throw new Error("El document no té pàgines.");
        }

        const nextResults: Record<number, TranslatedPageResult> = {};
        let pagesWithText = 0;

        for (let page = 1; page <= totalPages; page++) {
          ac.signal.throwIfAborted();
          setPageNumber(page);
          setPhase("rendering");
          setStatusMessage(`Pàgina ${page}/${totalPages}: preparant…`);
          setProgress((page - 1) / totalPages);

          const canvas = await renderPdfPageToCanvas(pdf, page, {
            scale: 2.5,
            signal: ac.signal,
          });
          setPageSizes((prev) => ({
            ...prev,
            [page]: { width: canvas.width, height: canvas.height },
          }));

          setPhase("ocr");
          setStatusMessage(`Pàgina ${page}/${totalPages}: llegint text…`);
          const pageResult = await ocrAndTranslateCanvas({
            canvas,
            sourceLanguage: sourceLang,
            targetLanguage: targetLang,
            signal: ac.signal,
            onOcrProgress: (ratio) =>
              setProgress((page - 1 + ratio * 0.45) / totalPages),
            translate: async (text) => {
              setPhase("translating");
              setStatusMessage(`Pàgina ${page}/${totalPages}: traduint…`);
              return translateWithBrowserTranslator({
                translator,
                text,
                signal: ac.signal,
              });
            },
          });

          if (
            pageResult.lines.length > 0 ||
            pageResult.plainParagraphs.length > 0
          ) {
            pagesWithText += 1;
          }
          nextResults[page] = pageResult;
          setPageResults({ ...nextResults });
          setProgress(page / totalPages);
        }

        ac.signal.throwIfAborted();
        if (pagesWithText === 0) {
          throw new Error("No s'ha trobat text en cap pàgina del document.");
        }

        goToPage(1);
        setStatusMessage(null);
        setPhase("done");
      } finally {
        translator.destroy();
      }
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

  // Start OCR+translate as soon as DEV workspace has a PDF ready.
  useEffect(() => {
    if (!open || !supported || !objectUrl) return;
    if (pageCount < 1 || !pagePreviews[1]) return;
    if (autoStartedRef.current) return;
    if (phase !== "idle") return;
    autoStartedRef.current = true;
    void runOcrAndTranslateAll();
  }, [open, supported, objectUrl, pageCount, pagePreviews, phase]);

  if (!open) return null;

  const busy = busyPhase(phase);

  return (
    <div
      className="pdf-ocr-workspace pdf-layout-translate-workspace"
      data-layout-translate="true"
    >
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
            {pageCount ? ` / ${pageCount}` : ""}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy || !pageCount || pageNumber >= pageCount}
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
            onClick={() => setZoom((z) => clampZoom(z - 0.25))}
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
            onClick={() => setZoom((z) => clampZoom(z + 0.25))}
            title="Apropar"
          >
            +
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => {
              fitAppliedRef.current = false;
              const stage = originalStageRef.current;
              const paper = stage?.querySelector<HTMLElement>(
                ".pdf-ocr-paper--original",
              );
              if (stage && paper) {
                const availableW = Math.max(stage.clientWidth - 12, 1);
                const availableH = Math.max(stage.clientHeight - 12, 1);
                const naturalW =
                  paper.offsetWidth / Math.max(zoomRef.current, 0.01);
                const naturalH =
                  paper.offsetHeight / Math.max(zoomRef.current, 0.01);
                const fit = Math.min(availableW / naturalW, availableH / naturalH);
                fitAppliedRef.current = true;
                setZoom(clampZoom(Math.min(fit * 0.98, ZOOM_MAX)));
              } else {
                setZoom(ZOOM_DEFAULT);
              }
            }}
          >
            Ajustar
          </button>
        </div>

        <div className="pdf-ocr-workspace-langs">
          <label className="pdf-ocr-workspace-lang">
            <span>Origen</span>
            <select
              value={packSourceLanguage}
              disabled={busy || !supported}
              onChange={(e) =>
                setPackSourceLanguage(e.target.value as TranslateLanguageCode)
              }
            >
              {CHROME_LANG_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <span aria-hidden="true">→</span>
          <label className="pdf-ocr-workspace-lang">
            <span>Destí</span>
            <select
              value={targetLanguage}
              disabled={busy || !supported}
              onChange={(e) =>
                setTargetLanguage(e.target.value as TranslateLanguageCode)
              }
            >
              {CHROME_LANG_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !supported || !objectUrl || pageCount < 1}
          onClick={() => void runOcrAndTranslateAll()}
        >
          {busy ? "Traduint…" : "Traduir"}
        </button>

        {statusMessage && (
          <p className="pdf-ocr-workspace-status" aria-live="polite">
            {statusMessage}
            {busy ? ` ${Math.round(progress * 100)}%` : ""}
          </p>
        )}
      </div>

      {!supported && (
        <div className="alert alert-error">
          La traducció de pàgina no està disponible en aquest navegador. Useu
          Google Chrome d&apos;escriptori.
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="pdf-ocr-workspace-panes" ref={panesRef}>
        <section className="pdf-ocr-workspace-pane" aria-label="Document original">
          <h4 className="pdf-ocr-workspace-pane-title">Original</h4>
          <div className="pdf-ocr-doc-stage" ref={originalStageRef}>
            <div className="pdf-ocr-doc-stack" style={{ zoom }}>
              {pageIndexes.map((page) => {
                const preview = pagePreviews[page];
                const size = pageSizes[page];
                return (
                  <div
                    key={`original-${page}`}
                    className="pdf-ocr-paper pdf-ocr-paper--original"
                    data-ocr-page={page}
                    style={
                      size
                        ? undefined
                        : { minHeight: "28rem", width: "100%" }
                    }
                  >
                    {preview ? (
                      <img
                        src={preview}
                        alt={`Pàgina ${page}`}
                        draggable={false}
                      />
                    ) : (
                      <p className="empty-state" style={{ padding: "1.5rem" }}>
                        Carregant pàgina {page}…
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section
          className="pdf-ocr-workspace-pane"
          aria-label="Document traduït (layout)"
        >
          <h4 className="pdf-ocr-workspace-pane-title">
            Traducció layout ({packSourceLanguage} → {targetLanguage})
          </h4>
          <div className="pdf-ocr-doc-stage" ref={translationStageRef}>
            <div className="pdf-ocr-doc-stack" style={{ zoom }}>
              {pageIndexes.map((page) => {
                const result = pageResults[page] ?? null;
                const preview = pagePreviews[page];
                const size = pageSizes[page];
                const layoutW = result?.width ?? size?.width ?? 1;
                const layoutH = result?.height ?? size?.height ?? 1;
                const hasLines = Boolean(result && result.lines.length > 0);
                const aspectStyle =
                  size || result
                    ? {
                        width: "100%",
                        aspectRatio: `${layoutW} / ${layoutH}`,
                      }
                    : { minHeight: "28rem", width: "100%" };

                return (
                  <div
                    key={`translation-${page}`}
                    className="pdf-ocr-paper pdf-ocr-paper--translation pdf-ocr-paper--on-scan"
                    data-ocr-page={page}
                    data-layout-page={page}
                    lang={targetLanguage}
                    dir={targetLanguage === "ar" ? "rtl" : "ltr"}
                    style={aspectStyle}
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
                    ) : preview && !busy && phase === "idle" ? (
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
                        style={{ padding: "1.5rem", position: "relative" }}
                      >
                        {busy
                          ? `Generant traducció… (pàg. ${page})`
                          : page === 1
                            ? "Carregant i traduint el layout…"
                            : `Pàgina ${page}`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
