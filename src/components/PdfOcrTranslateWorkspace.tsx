import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  downloadTranslatorModel,
  getTranslatorAvailability,
  isBrowserTranslatorSupported,
  translateTextInBrowser,
} from "@/utils/browserTranslate";
import { openPdfDocument, renderPdfPageToCanvas } from "@/utils/pdfDocument";
import { FittingOcrTranslatedLine } from "@/components/FittingOcrTranslatedLine";
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

/**
 * Client-side OCR + browser translate for the current PDF preview page.
 * Separate from backend document translation (`BackendDocumentTranslatePanel`).
 */
export function PdfOcrTranslateWorkspace({
  objectUrl,
  open,
  documentLanguage,
  defaultTargetLanguage,
}: {
  objectUrl: string | null;
  open: boolean;
  /** Classified / metadata language of the source document (e.g. "fr"). */
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
  const [pageSize, setPageSize] = useState({ width: 1, height: 1 });
  const [pageResults, setPageResults] = useState<
    Record<number, TranslatedPageResult>
  >({});
  const [zoom, setZoom] = useState(1);

  const abortRef = useRef<AbortController | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const panesRef = useRef<HTMLDivElement | null>(null);

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
    setZoom(1);
  }, [open, objectUrl, documentLanguage, defaultTargetLanguage]);

  useEffect(() => {
    if (!open || !objectUrl) return;

    let cancelled = false;
    const ac = new AbortController();

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

  useLayoutEffect(() => {
    if (!open || !pdfRef.current) return;

    let cancelled = false;
    const ac = new AbortController();
    const pdf = pdfRef.current;

    (async () => {
      try {
        const canvas = await renderPdfPageToCanvas(pdf, pageNumber, {
          scale: 1.35,
          signal: ac.signal,
        });
        if (cancelled) return;
        setPageSize({ width: canvas.width, height: canvas.height });
        const host = previewRef.current;
        if (host) {
          const ctx = host.getContext("2d");
          if (ctx) {
            host.width = canvas.width;
            host.height = canvas.height;
            ctx.clearRect(0, 0, host.width, host.height);
            ctx.drawImage(canvas, 0, 0);
          }
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [open, objectUrl, pageNumber, pageCount]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      const pdf = pdfRef.current;
      pdfRef.current = null;
      if (pdf) void pdf.cleanup();
    };
  }, []);

  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    const pdf = pdfRef.current;
    pdfRef.current = null;
    if (pdf) void pdf.cleanup();
  }, [open]);

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
        setZoom(1);
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

  const currentResult = pageResults[pageNumber] ?? null;

  const aspectRatio = useMemo(() => {
    const size = currentResult
      ? { width: currentResult.width, height: currentResult.height }
      : pageSize;
    return size.width / Math.max(size.height, 1);
  }, [currentResult, pageSize]);

  async function runOcrAndTranslateAll() {
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
    if (packSourceLanguage === targetLanguage) {
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
        `Preparant la traducció (${packSourceLanguage} → ${targetLanguage})…`,
      );
      setProgress(0);
      const availability = await getTranslatorAvailability(
        packSourceLanguage,
        targetLanguage,
      );
      if (availability === "unavailable") {
        throw new Error(
          `El parell ${packSourceLanguage} → ${targetLanguage} no està disponible al navegador.`,
        );
      }
      if (availability !== "available") {
        await downloadTranslatorModel({
          sourceLanguage: packSourceLanguage,
          targetLanguage,
          onDownloadProgress: (ratio) => setProgress(ratio),
        });
      }

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
        setPageSize({ width: canvas.width, height: canvas.height });

        setPhase("ocr");
        setStatusMessage(`Pàgina ${page}/${totalPages}: llegint text…`);
        const pageResult = await ocrAndTranslateCanvas({
          canvas,
          sourceLanguage: packSourceLanguage,
          targetLanguage,
          signal: ac.signal,
          onOcrProgress: (ratio) =>
            setProgress((page - 1 + ratio * 0.45) / totalPages),
          translate: async (text) => {
            setPhase("translating");
            setStatusMessage(`Pàgina ${page}/${totalPages}: traduint…`);
            return translateTextInBrowser({
              text,
              sourceLanguage: packSourceLanguage,
              targetLanguage,
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

      setPageNumber(1);
      setStatusMessage(null);
      setPhase("done");
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

  if (!open) return null;

  const busy = busyPhase(phase);
  const layoutH = Math.max(currentResult?.height ?? pageSize.height, 1);
  const layoutW = Math.max(currentResult?.width ?? pageSize.width, 1);

  return (
    <div className="pdf-ocr-workspace">
      <div className="pdf-ocr-workspace-toolbar">
        <div className="pdf-ocr-workspace-pager">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy || pageNumber <= 1}
            onClick={() => {
              setZoom(1);
              setPageNumber((n) => Math.max(1, n - 1));
            }}
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
            onClick={() => {
              setZoom(1);
              setPageNumber((n) => n + 1);
            }}
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
            disabled={busy || zoom === 1}
            onClick={() => setZoom(1)}
          >
            100%
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
          {busy
            ? "Traduint…"
            : pageCount > 1
              ? `Traduir tot (${pageCount})`
              : "Traduir"}
        </button>
      </div>

      {!supported && (
        <div className="alert alert-error">
          La traducció de pàgina no està disponible en aquest navegador. Useu
          Google Chrome d&apos;escriptori.
        </div>
      )}

      {statusMessage && (
        <p className="empty-state pdf-ocr-workspace-status">
          {statusMessage}
          {busy ? ` ${Math.round(progress * 100)}%` : ""}
        </p>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="pdf-ocr-workspace-panes" ref={panesRef}>
        <section className="pdf-ocr-workspace-pane" aria-label="Pàgina original">
          <h4 className="pdf-ocr-workspace-pane-title">Original</h4>
          <div className="pdf-ocr-doc-stage">
            <div
              className="pdf-ocr-paper pdf-ocr-paper--original"
              style={{ zoom }}
            >
              <canvas ref={previewRef} />
            </div>
          </div>
        </section>

        <section className="pdf-ocr-workspace-pane" aria-label="Text traduït">
          <h4 className="pdf-ocr-workspace-pane-title">
            Traducció ({packSourceLanguage} → {targetLanguage})
          </h4>
          <div className="pdf-ocr-doc-stage">
            <div
              className={`pdf-ocr-paper pdf-ocr-paper--translation${
                currentResult ? " pdf-ocr-paper--on-scan" : ""
              }`}
              style={{ aspectRatio: String(aspectRatio), zoom }}
              lang={targetLanguage}
              dir={targetLanguage === "ar" ? "rtl" : "ltr"}
            >
              {currentResult && (
                <img
                  className="pdf-ocr-page-bg"
                  src={currentResult.backgroundUrl}
                  alt=""
                  draggable={false}
                />
              )}

              {currentResult && currentResult.lines.length > 0 ? (
                <div className="pdf-ocr-page-layout">
                  {currentResult.lines.map((line, index) => (
                    <FittingOcrTranslatedLine
                      key={`${index}-${line.bbox.y0}-${line.bbox.x0}`}
                      text={line.translated}
                      title={line.text}
                      bbox={line.bbox}
                      layoutW={layoutW}
                      layoutH={layoutH}
                    />
                  ))}
                </div>
              ) : currentResult && currentResult.plainParagraphs.length > 0 ? (
                <div className="pdf-ocr-page-plain pdf-ocr-page-plain--on-scan">
                  {currentResult.plainParagraphs.map((para, index) => (
                    <p key={`${index}-${para.slice(0, 32)}`}>{para}</p>
                  ))}
                </div>
              ) : (
                <p
                  className="empty-state"
                  style={{ padding: "1.5rem", position: "relative" }}
                >
                  {busy
                    ? "Generant traducció de tot el document…"
                    : "Premeu «Traduir» per traduir totes les pàgines sobre el fons original."}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
