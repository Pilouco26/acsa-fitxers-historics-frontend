import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { buildHeaders, documentFileUrl, storedFileUrl, throwIfNotOk } from "@/api/client";
import { openPdfDocument, renderPdfPageOntoCanvas, isPdfRenderCancelled } from "@/utils/pdfDocument";

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 6;
/** Multiplicative step so zoom feels even at small fit scales (phones). */
const ZOOM_FACTOR = 1.25;
/** Min/max as a ratio of the current fit-to-frame zoom. */
const ZOOM_FIT_RATIO_MIN = 0.5;
const ZOOM_FIT_RATIO_MAX = 8;
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

function clampZoom(value: number, fitZoom = 1): number {
  const lo = Math.max(ZOOM_MIN, fitZoom * ZOOM_FIT_RATIO_MIN);
  const hi = Math.min(ZOOM_MAX, Math.max(lo, fitZoom * ZOOM_FIT_RATIO_MAX));
  return Math.min(hi, Math.max(lo, Math.round(value * 1000) / 1000));
}

function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

function touchDistance(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function touchMidpoint(a: Touch, b: Touch): { x: number; y: number } {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
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
  const raw = Math.min(availW / viewport.width, availH / viewport.height);
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(raw * 1000) / 1000));
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
 * Zoom: toolbar, Ctrl/Cmd+wheel, and pinch on touch screens.
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
  const zoomRef = useRef(1);
  const zoomAnchorRef = useRef<{
    previousZoom: number;
    nextZoom: number;
    localX: number;
    localY: number;
    contentX: number;
    contentY: number;
  } | null>(null);
  const pinchRef = useRef<{
    startDist: number;
    startZoom: number;
    liveScale: number;
    midX: number;
    midY: number;
  } | null>(null);
  const pinchRafRef = useRef<number | null>(null);

  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [opening, setOpening] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rotationDeg = useMemo(() => normalizeRotation(rotation), [rotation]);
  const loadingDoc = externalLoading || opening;
  const busy = loadingDoc || rendering;
  const displayError = externalError ?? error;
  const zoomPercent = Math.round((zoom / Math.max(fitZoom, 0.001)) * 100);
  const atFit = Math.abs(zoom - fitZoom) < 0.005;
  const minZoom = clampZoom(fitZoom * ZOOM_FIT_RATIO_MIN, fitZoom);
  const maxZoom = clampZoom(fitZoom * ZOOM_FIT_RATIO_MAX, fitZoom);

  const applyZoom = (
    nextZoom: number,
    clientX?: number,
    clientY?: number,
  ) => {
    const frame = frameRef.current;
    const clamped = clampZoom(nextZoom, fitZoomRef.current);
    const previous = zoomRef.current;
    if (Math.abs(clamped - previous) < 0.001) return;

    stickToFitRef.current = Math.abs(clamped - fitZoomRef.current) < 0.005;

    if (frame) {
      const rect = frame.getBoundingClientRect();
      const localX =
        clientX != null && clientX >= rect.left && clientX <= rect.right
          ? clientX - rect.left
          : rect.width / 2;
      const localY =
        clientY != null && clientY >= rect.top && clientY <= rect.bottom
          ? clientY - rect.top
          : rect.height / 2;
      zoomAnchorRef.current = {
        previousZoom: previous,
        nextZoom: clamped,
        localX,
        localY,
        contentX: (frame.scrollLeft + localX) / Math.max(previous, 0.001),
        contentY: (frame.scrollTop + localY) / Math.max(previous, 0.001),
      };
    }

    zoomRef.current = clamped;
    setZoom(clamped);
  };

  const bumpZoom = (direction: 1 | -1) => {
    const factor = direction > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    applyZoom(zoomRef.current * factor);
  };

  const resetToFit = () => {
    stickToFitRef.current = true;
    zoomAnchorRef.current = null;
    zoomRef.current = fitZoomRef.current;
    setZoom(fitZoomRef.current);
  };

  useEffect(() => {
    let active = true;
    const ac = new AbortController();

    setPage(1);
    setPageCount(0);
    setZoom(1);
    setFitZoom(1);
    zoomRef.current = 1;
    fitZoomRef.current = 1;
    stickToFitRef.current = true;
    zoomAnchorRef.current = null;
    pinchRef.current = null;
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
          zoomRef.current = nextFit;
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
    const frame = frameRef.current;
    if (!pdf || !canvas || pageCount < 1) return;

    const gen = ++renderGenRef.current;
    const ac = new AbortController();
    setRendering(true);
    setError(null);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = zoom * dpr;
    const anchor = zoomAnchorRef.current;

    void renderPdfPageOntoCanvas(pdf, page, canvas, {
      scale,
      rotation: rotationDeg,
      signal: ac.signal,
    })
      .then(() => {
        if (gen !== renderGenRef.current) return;
        canvas.style.width = `${Math.ceil(canvas.width / dpr)}px`;
        canvas.style.height = `${Math.ceil(canvas.height / dpr)}px`;

        if (frame && anchor && Math.abs(anchor.nextZoom - zoom) < 0.001) {
          frame.scrollLeft = Math.max(
            0,
            anchor.contentX * zoom - anchor.localX,
          );
          frame.scrollTop = Math.max(
            0,
            anchor.contentY * zoom - anchor.localY,
          );
          zoomAnchorRef.current = null;
        }

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

  // Ctrl/Cmd + wheel zoom (desktop / trackpad pinch often emits this).
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || pageCount < 1) return;

    let wheelRaf: number | null = null;
    let pending: { factor: number; x: number; y: number } | null = null;

    const flush = () => {
      wheelRaf = null;
      if (!pending) return;
      const { factor, x, y } = pending;
      pending = null;
      applyZoom(zoomRef.current * factor, x, y);
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1 / ZOOM_FACTOR : ZOOM_FACTOR;
      pending = {
        factor: (pending?.factor ?? 1) * factor,
        x: e.clientX,
        y: e.clientY,
      };
      if (wheelRaf == null) wheelRaf = requestAnimationFrame(flush);
    };

    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      if (wheelRaf != null) cancelAnimationFrame(wheelRaf);
      frame.removeEventListener("wheel", onWheel);
    };
  }, [pageCount]);

  // Pinch-to-zoom: live CSS scale while pinching, commit pdf.js zoom on release.
  useEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas || pageCount < 1) return;

    const clearPinchVisual = () => {
      canvas.style.transform = "";
      canvas.style.transformOrigin = "";
      frame.removeAttribute("data-pinching");
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) {
        pinchRef.current = null;
        return;
      }
      frame.setAttribute("data-pinching", "true");
      pinchRef.current = {
        startDist: touchDistance(e.touches[0], e.touches[1]),
        startZoom: zoomRef.current,
        liveScale: 1,
        midX: 0,
        midY: 0,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      const pinch = pinchRef.current;
      if (!pinch || e.touches.length !== 2 || pinch.startDist <= 0) return;
      e.preventDefault();
      const dist = touchDistance(e.touches[0], e.touches[1]);
      const mid = touchMidpoint(e.touches[0], e.touches[1]);
      const rect = frame.getBoundingClientRect();
      const liveScale = dist / pinch.startDist;
      pinch.liveScale = liveScale;
      pinch.midX = mid.x;
      pinch.midY = mid.y;

      if (pinchRafRef.current != null) cancelAnimationFrame(pinchRafRef.current);
      pinchRafRef.current = requestAnimationFrame(() => {
        canvas.style.transformOrigin = `${mid.x - rect.left + frame.scrollLeft}px ${mid.y - rect.top + frame.scrollTop}px`;
        canvas.style.transform = `scale(${liveScale})`;
      });
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length >= 2) return;
      const pinch = pinchRef.current;
      pinchRef.current = null;
      if (pinchRafRef.current != null) {
        cancelAnimationFrame(pinchRafRef.current);
        pinchRafRef.current = null;
      }
      clearPinchVisual();
      if (!pinch || Math.abs(pinch.liveScale - 1) < 0.02) return;
      applyZoom(pinch.startZoom * pinch.liveScale, pinch.midX, pinch.midY);
    };

    frame.addEventListener("touchstart", onTouchStart, { passive: true });
    frame.addEventListener("touchmove", onTouchMove, { passive: false });
    frame.addEventListener("touchend", onTouchEnd, { passive: true });
    frame.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      if (pinchRafRef.current != null) cancelAnimationFrame(pinchRafRef.current);
      frame.removeEventListener("touchstart", onTouchStart);
      frame.removeEventListener("touchmove", onTouchMove);
      frame.removeEventListener("touchend", onTouchEnd);
      frame.removeEventListener("touchcancel", onTouchEnd);
      clearPinchVisual();
    };
  }, [pageCount]);

  if (displayError) {
    return <div className="alert alert-error">{displayError}</div>;
  }

  const showLoading = loadingDoc && pageCount < 1;

  return (
    <div className="pdf-preview-shell">
      {showLoading && <p className="empty-state">Carregant PDF…</p>}

      {pageCount > 0 && (
        <div className="pdf-preview-toolbar" role="toolbar" aria-label={title}>
          <div className="pdf-preview-toolbar-group pdf-preview-workspace-pager">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={loadingDoc || page <= 1}
              onClick={() => {
                stickToFitRef.current = true;
                zoomAnchorRef.current = null;
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
              disabled={loadingDoc || page >= pageCount}
              onClick={() => {
                stickToFitRef.current = true;
                zoomAnchorRef.current = null;
                setPage((p) => Math.min(pageCount, p + 1));
              }}
              aria-label="Pàgina següent"
            >
              ›
            </button>
          </div>

          <div
            className="pdf-preview-toolbar-group pdf-preview-workspace-zoom"
            role="group"
            aria-label="Zoom"
          >
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={zoom <= minZoom + 0.001}
              onClick={() => bumpZoom(-1)}
              aria-label="Reduir zoom"
              title="Reduir zoom"
            >
              −
            </button>
            <span className="pdf-preview-toolbar-label" aria-live="polite">
              {zoomPercent}%
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={zoom >= maxZoom - 0.001}
              onClick={() => bumpZoom(1)}
              aria-label="Augmentar zoom"
              title="Augmentar zoom"
            >
              +
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={atFit}
              onClick={resetToFit}
              title="Ajustar a la finestra"
            >
              Ajustar
            </button>
          </div>
        </div>
      )}

      <div
        ref={frameRef}
        className="pdf-preview-frame"
        data-zoomed={atFit ? undefined : "true"}
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
