import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { buildHeaders, documentFileUrl, storedFileUrl, throwIfNotOk } from "@/api/client";
import { openPdfDocument, renderPdfPageOntoCanvas, isPdfRenderCancelled } from "@/utils/pdfDocument";

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;
const FIT_PADDING_PX = 8;

const activeReleases = new Map<string, () => void>();

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function previewKey(documentId?: number | null, filePath?: string | null): string {
  if (filePath) return `path:${filePath}`;
  if (documentId != null) return `doc:${documentId}`;
  return "empty";
}

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
}

function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

async function measureFitZoom(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  rotation: number,
  frame: HTMLElement,
): Promise<number> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1, rotation });
  const availW = Math.max(1, frame.clientWidth - FIT_PADDING_PX);
  const availH = Math.max(1, frame.clientHeight - FIT_PADDING_PX);
  if (viewport.width <= 0 || viewport.height <= 0) return 1;
  return clampZoom(Math.min(availW / viewport.width, availH / viewport.height));
}

/** Force-close any in-flight preview fetch / render for a document id. */
export async function releaseDocumentPreview(documentId: number): Promise<void> {
  await releasePreviewKey(`doc:${documentId}`);
}

/** Force-close any in-flight preview fetch / render for a storage path. */
export async function releaseFilePathPreview(filePath: string): Promise<void> {
  await releasePreviewKey(`path:${filePath}`);
}

async function releasePreviewKey(key: string): Promise<void> {
  const release = activeReleases.get(key);
  if (release) {
    release();
    activeReleases.delete(key);
  }
  await nextFrame();
  await nextFrame();
}

type PdfCanvasViewerProps = {
  data: ArrayBuffer | null;
  title: string;
  rotation?: number;
  loading?: boolean;
  error?: string | null;
};

/**
 * Touch-friendly single-page PDF canvas viewer with zoom / page controls.
 * Defaults to fitting the whole page in the preview frame.
 */
export function PdfCanvasViewer({
  data,
  title,
  rotation = 0,
  loading: externalLoading = false,
  error: externalError = null,
}: PdfCanvasViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const renderGenRef = useRef(0);
  const fitGenRef = useRef(0);
  const stickToFitRef = useRef(true);
  const fitZoomRef = useRef(1);

  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [opening, setOpening] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rotationDeg = useMemo(() => normalizeRotation(rotation), [rotation]);
  const busy = externalLoading || opening || rendering;
  const displayError = externalError ?? error;

  useEffect(() => {
    let active = true;
    const ac = new AbortController();

    setPage(1);
    setPageCount(0);
    setZoom(1);
    setFitZoom(1);
    fitZoomRef.current = 1;
    stickToFitRef.current = true;
    setError(null);

    const previous = pdfRef.current;
    pdfRef.current = null;
    if (previous) {
      void previous.cleanup();
    }

    if (!data) {
      setOpening(false);
      return () => {
        active = false;
        ac.abort();
      };
    }

    setOpening(true);

    void openPdfDocument(data.slice(0), ac.signal)
      .then((pdf) => {
        if (!active) {
          void pdf.cleanup();
          return;
        }
        pdfRef.current = pdf;
        setPageCount(pdf.numPages);
        setPage(1);
        setOpening(false);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!active) return;
        setError("No s'ha pogut carregar la vista prèvia del PDF.");
        setOpening(false);
      });

    return () => {
      active = false;
      ac.abort();
      const pdf = pdfRef.current;
      pdfRef.current = null;
      if (pdf) void pdf.cleanup();
    };
  }, [data]);

  // Fit whole page into the frame on open, page/rotation change, and resize.
  useLayoutEffect(() => {
    const pdf = pdfRef.current;
    const frame = frameRef.current;
    if (!pdf || !frame || pageCount < 1) return;

    let cancelled = false;
    const gen = ++fitGenRef.current;

    const runFit = () => {
      void measureFitZoom(pdf, page, rotationDeg, frame).then((nextFit) => {
        if (cancelled || gen !== fitGenRef.current) return;
        const prevFit = fitZoomRef.current;
        fitZoomRef.current = nextFit;
        if (Math.abs(nextFit - prevFit) >= 0.01) {
          setFitZoom(nextFit);
        }
        if (stickToFitRef.current) {
          setZoom((z) => (Math.abs(z - nextFit) < 0.01 ? z : nextFit));
        }
      });
    };

    runFit();

    const ro = new ResizeObserver(() => {
      runFit();
    });
    ro.observe(frame);

    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [page, pageCount, rotationDeg, data]);

  useLayoutEffect(() => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas || pageCount < 1) return;

    const gen = ++renderGenRef.current;
    const ac = new AbortController();
    setRendering(true);
    setError(null);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = zoom * dpr;

    void renderPdfPageOntoCanvas(pdf, page, canvas, {
      scale,
      rotation: rotationDeg,
      signal: ac.signal,
    })
      .then(() => {
        if (gen !== renderGenRef.current) return;
        canvas.style.width = `${Math.ceil(canvas.width / dpr)}px`;
        canvas.style.height = `${Math.ceil(canvas.height / dpr)}px`;
        setRendering(false);
      })
      .catch((err) => {
        if (isPdfRenderCancelled(err)) return;
        if (gen !== renderGenRef.current) return;
        setError("No s'ha pogut renderitzar la pàgina del PDF.");
        setRendering(false);
      });

    return () => {
      ac.abort();
    };
  }, [page, pageCount, zoom, rotationDeg, data]);

  const bumpZoom = (delta: number) => {
    stickToFitRef.current = false;
    setZoom((z) => clampZoom(z + delta));
  };

  const resetToFit = () => {
    stickToFitRef.current = true;
    setZoom(fitZoomRef.current);
  };

  if (displayError) {
    return <div className="alert alert-error">{displayError}</div>;
  }

  const showLoading = busy && pageCount < 1;
  const atFit = Math.abs(zoom - fitZoom) < 0.005;

  return (
    <div className="pdf-preview-shell">
      {showLoading && <p className="empty-state">Carregant PDF…</p>}

      {pageCount > 0 && (
        <div className="pdf-preview-toolbar" role="toolbar" aria-label={title}>
          <div className="pdf-preview-toolbar-group pdf-preview-workspace-pager">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || page <= 1}
              onClick={() => {
                stickToFitRef.current = true;
                setPage((p) => Math.max(1, p - 1));
              }}
              aria-label="Pàgina anterior"
            >
              ‹
            </button>
            <span className="pdf-preview-toolbar-label">
              {page} / {pageCount}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || page >= pageCount}
              onClick={() => {
                stickToFitRef.current = true;
                setPage((p) => Math.min(pageCount, p + 1));
              }}
              aria-label="Pàgina següent"
            >
              ›
            </button>
          </div>

          <div className="pdf-preview-toolbar-group pdf-preview-workspace-zoom">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || zoom <= ZOOM_MIN}
              onClick={() => bumpZoom(-ZOOM_STEP)}
              aria-label="Reduir zoom"
            >
              −
            </button>
            <span className="pdf-preview-toolbar-label">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || zoom >= ZOOM_MAX}
              onClick={() => bumpZoom(ZOOM_STEP)}
              aria-label="Augmentar zoom"
            >
              +
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || atFit}
              onClick={resetToFit}
            >
              Ajustar
            </button>
          </div>
        </div>
      )}

      <div
        ref={frameRef}
        className="pdf-preview-frame"
        aria-busy={busy}
        aria-label={title}
        hidden={showLoading}
      >
        <canvas ref={canvasRef} className="pdf-preview-canvas" />
      </div>
    </div>
  );
}

/**
 * PDF file preview (no client-side translation overlays).
 */
export function PdfPreview({
  documentId,
  filePath,
  title,
  rotation = 0,
}: {
  documentId?: number | null;
  /** Storage-relative path (e.g. document `duplicate_path`). */
  filePath?: string | null;
  title: string;
  rotation?: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ArrayBuffer | null>(null);

  const sourceUrl = useMemo(() => {
    if (filePath) return storedFileUrl(filePath);
    if (documentId != null) return documentFileUrl(documentId);
    return null;
  }, [documentId, filePath]);

  const cacheKey = previewKey(documentId, filePath);

  useLayoutEffect(() => {
    let active = true;
    const ac = new AbortController();

    const release = () => {
      active = false;
      ac.abort();
    };

    if (!sourceUrl) {
      setLoading(false);
      setError("No s'ha pogut determinar el fitxer a previsualitzar.");
      setData(null);
      return () => {
        release();
      };
    }

    activeReleases.set(cacheKey, release);

    setLoading(true);
    setError(null);
    setData(null);

    fetch(sourceUrl, {
      headers: buildHeaders(),
      signal: ac.signal,
    })
      .then(async (res) => {
        await throwIfNotOk(res);
        return res.arrayBuffer();
      })
      .then((buffer) => {
        if (!active) return;
        setData(buffer);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!active) return;
        setError("No s'ha pogut carregar la vista prèvia del PDF.");
        setLoading(false);
      });

    return () => {
      activeReleases.delete(cacheKey);
      release();
    };
  }, [cacheKey, sourceUrl]);

  return (
    <PdfCanvasViewer
      data={data}
      title={title}
      rotation={rotation}
      loading={loading}
      error={error}
    />
  );
}
