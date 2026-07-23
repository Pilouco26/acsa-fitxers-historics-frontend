import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type TransitionEvent } from "react";
import { createPortal } from "react-dom";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { buildHeaders, documentFileUrl, storedFileUrl, throwIfNotOk } from "@/api/client";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { openPdfDocument, renderPdfPageOntoCanvas, isPdfRenderCancelled } from "@/utils/pdfDocument";

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 6;
/** Multiplicative step so zoom feels even at small fit scales (phones). */
const ZOOM_FACTOR = 1.25;
/** Min/max as a ratio of the current fit-to-frame zoom. */
const ZOOM_FIT_RATIO_MIN = 0.5;
const ZOOM_FIT_RATIO_MAX = 8;
const FIT_PADDING_PX = 16;
/** Render pages this far outside the viewport. */
const RENDER_MARGIN_PX = 900;
/** Phones, tablets, and coarse-pointer devices (matches touch CSS breakpoints). */
const TOUCH_UI_QUERY = "(max-width: 900px), (pointer: coarse)";
const TAP_MOVE_PX = 12;

type PageLayout = { width: number; height: number };

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

/** Fit page width to the frame (Chrome continuous-scroll default). */
async function measureFitWidthZoom(
  pdf: PDFDocumentProxy,
  rotation: number,
  frame: HTMLElement,
): Promise<number> {
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1, rotation });
  const availW = Math.max(1, frame.clientWidth - FIT_PADDING_PX);
  if (viewport.width <= 0) return 1;
  const raw = availW / viewport.width;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(raw * 1000) / 1000));
}

async function measurePageLayouts(
  pdf: PDFDocumentProxy,
  pageCount: number,
  zoom: number,
  rotation: number,
  signal?: AbortSignal,
): Promise<PageLayout[]> {
  const layouts: PageLayout[] = new Array(pageCount);
  const chunk = 10;
  for (let start = 0; start < pageCount; start += chunk) {
    signal?.throwIfAborted();
    const end = Math.min(pageCount, start + chunk);
    await Promise.all(
      Array.from({ length: end - start }, async (_, j) => {
        const pageNumber = start + j + 1;
        const page = await pdf.getPage(pageNumber);
        signal?.throwIfAborted();
        const viewport = page.getViewport({ scale: zoom, rotation });
        layouts[pageNumber - 1] = {
          width: Math.ceil(viewport.width),
          height: Math.ceil(viewport.height),
        };
      }),
    );
  }
  return layouts;
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

type PdfScrollPageProps = {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  layout: PageLayout;
  zoom: number;
  rotation: number;
  scrollRoot: HTMLElement | null;
};

function PdfScrollPage({
  pdf,
  pageNumber,
  layout,
  zoom,
  rotation,
  scrollRoot,
}: PdfScrollPageProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = slotRef.current;
    if (!el || !scrollRoot) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setActive(entry.isIntersecting);
      },
      {
        root: scrollRoot,
        rootMargin: `${RENDER_MARGIN_PX}px 0px`,
        threshold: 0,
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [scrollRoot]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ac = new AbortController();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    void renderPdfPageOntoCanvas(pdf, pageNumber, canvas, {
      scale: zoom * dpr,
      rotation,
      signal: ac.signal,
    })
      .then(() => {
        canvas.style.width = `${layout.width}px`;
        canvas.style.height = `${layout.height}px`;
      })
      .catch((err) => {
        if (isPdfRenderCancelled(err)) return;
      });

    return () => {
      ac.abort();
    };
  }, [active, pdf, pageNumber, zoom, rotation, layout.width, layout.height]);

  return (
    <div
      ref={slotRef}
      className="pdf-preview-page"
      data-page={pageNumber}
      style={{ width: layout.width, height: layout.height }}
    >
      {active ? <canvas ref={canvasRef} className="pdf-preview-canvas" /> : null}
    </div>
  );
}

type PdfCanvasViewerProps = {
  data: ArrayBuffer | null;
  title: string;
  rotation?: number;
  loading?: boolean;
  error?: string | null;
  /**
   * When set (and not fullscreen), Ajustar/Ampliar render into this host so they
   * can sit beside parent toolbar actions (e.g. Traduir) at matching size.
   */
  toolbarActionsHost?: HTMLElement | null;
};

/**
 * Desktop continuous-scroll PDF viewer (Chrome-like): pages stacked with gaps,
 * free scroll between pages. Zoom via Ctrl/Cmd+wheel or pinch; click for fullscreen.
 */
function PdfContinuousViewer({
  data,
  title,
  rotation = 0,
  loading: externalLoading = false,
  error: externalError = null,
  toolbarActionsHost = null,
}: PdfCanvasViewerProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const fitGenRef = useRef(0);
  const layoutGenRef = useRef(0);
  const stickToFitRef = useRef(true);
  const fitZoomRef = useRef(1);
  const zoomRef = useRef(1);
  const atFitRef = useRef(true);
  const pageRef = useRef(1);
  const fullscreenRef = useRef(false);
  const pointerTapRef = useRef<{ x: number; y: number } | null>(null);
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
  const [layouts, setLayouts] = useState<PageLayout[]>([]);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);

  const rotationDeg = useMemo(() => normalizeRotation(rotation), [rotation]);
  const loadingDoc = externalLoading || opening;
  const displayError = externalError ?? error;
  const atFit = Math.abs(zoom - fitZoom) < 0.005;
  const pdf = pdfRef.current;

  atFitRef.current = atFit;
  pageRef.current = page;
  fullscreenRef.current = fullscreen;

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

  const resetToFit = () => {
    stickToFitRef.current = true;
    zoomAnchorRef.current = null;
    zoomRef.current = fitZoomRef.current;
    setZoom(fitZoomRef.current);
  };

  const exitFullscreen = () => setFullscreen(false);

  useEffect(() => {
    setScrollRoot(frameRef.current);
  }, [pageCount, fullscreen, loadingDoc]);

  useEffect(() => {
    if (!fullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  useEffect(() => {
    let active = true;
    const ac = new AbortController();

    setPage(1);
    setPageCount(0);
    setLayouts([]);
    setZoom(1);
    setFitZoom(1);
    setFullscreen(false);
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
      .then((doc) => {
        if (!active) {
          void doc.cleanup();
          return;
        }
        pdfRef.current = doc;
        setPageCount(doc.numPages);
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
      const doc = pdfRef.current;
      pdfRef.current = null;
      if (doc) void doc.cleanup();
    };
  }, [data]);

  // Fit-to-width on open / resize / rotation.
  useLayoutEffect(() => {
    const doc = pdfRef.current;
    const frame = frameRef.current;
    if (!doc || !frame || pageCount < 1) return;

    let cancelled = false;
    const gen = ++fitGenRef.current;

    const runFit = () => {
      void measureFitWidthZoom(doc, rotationDeg, frame).then((nextFit) => {
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
    const ro = new ResizeObserver(() => runFit());
    ro.observe(frame);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [pageCount, rotationDeg, data]);

  // Layout sizes for every page at the current zoom.
  useEffect(() => {
    const doc = pdfRef.current;
    if (!doc || pageCount < 1) {
      setLayouts([]);
      return;
    }

    const ac = new AbortController();
    const gen = ++layoutGenRef.current;

    void measurePageLayouts(doc, pageCount, zoom, rotationDeg, ac.signal)
      .then((next) => {
        if (gen !== layoutGenRef.current) return;
        setLayouts(next);

        const frame = frameRef.current;
        if (!frame) return;

        const anchor = zoomAnchorRef.current;
        if (anchor && Math.abs(anchor.nextZoom - zoom) < 0.001) {
          frame.scrollTop = Math.max(0, anchor.contentY * zoom - anchor.localY);
          frame.scrollLeft = Math.max(0, anchor.contentX * zoom - anchor.localX);
          zoomAnchorRef.current = null;
        }

        // When zoomed out enough that pages fit the width, clear horizontal
        // scroll so CSS can keep the document centered in the frame.
        requestAnimationFrame(() => {
          const maxScrollX = Math.max(0, frame.scrollWidth - frame.clientWidth);
          if (maxScrollX <= 1) {
            frame.scrollLeft = 0;
          } else {
            frame.scrollLeft = Math.min(maxScrollX, Math.max(0, frame.scrollLeft));
          }
        });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      });

    return () => {
      ac.abort();
    };
  }, [pageCount, zoom, rotationDeg, data]);

  // Track which page is in view while scrolling.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || layouts.length < 1) return;

    let raf: number | null = null;

    const updatePage = () => {
      raf = null;
      const pages = frame.querySelectorAll<HTMLElement>(".pdf-preview-page");
      if (pages.length < 1) return;
      const frameRect = frame.getBoundingClientRect();
      const marker = frameRect.top + frame.clientHeight * 0.28;
      let current = 1;
      for (const el of pages) {
        const rect = el.getBoundingClientRect();
        const pageNum = Number(el.dataset.page);
        if (!Number.isFinite(pageNum)) continue;
        if (marker >= rect.top && marker < rect.bottom) {
          current = pageNum;
          break;
        }
        if (marker >= rect.bottom) current = pageNum;
      }
      setPage((p) => (p === current ? p : current));
    };

    const onScroll = () => {
      if (raf == null) raf = requestAnimationFrame(updatePage);
    };

    frame.addEventListener("scroll", onScroll, { passive: true });
    updatePage();
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      frame.removeEventListener("scroll", onScroll);
    };
  }, [layouts]);

  // Ctrl/Cmd + wheel zoom.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || pageCount < 1) return;

    let wheelRaf: number | null = null;
    let pendingZoom: { factor: number; x: number; y: number } | null = null;

    const flushZoom = () => {
      wheelRaf = null;
      if (!pendingZoom) return;
      const { factor, x, y } = pendingZoom;
      pendingZoom = null;
      applyZoom(zoomRef.current * factor, x, y);
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1 / ZOOM_FACTOR : ZOOM_FACTOR;
      pendingZoom = {
        factor: (pendingZoom?.factor ?? 1) * factor,
        x: e.clientX,
        y: e.clientY,
      };
      if (wheelRaf == null) wheelRaf = requestAnimationFrame(flushZoom);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType === "touch") return;
      pointerTapRef.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      const tap = pointerTapRef.current;
      if (!tap) return;
      if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_MOVE_PX) {
        pointerTapRef.current = null;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const tap = pointerTapRef.current;
      pointerTapRef.current = null;
      if (!tap || e.button !== 0 || e.pointerType === "touch") return;
      if (fullscreenRef.current) return;
      if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_MOVE_PX) return;
      setFullscreen(true);
    };

    const onPointerCancel = () => {
      pointerTapRef.current = null;
    };

    frame.addEventListener("wheel", onWheel, { passive: false });
    frame.addEventListener("pointerdown", onPointerDown);
    frame.addEventListener("pointermove", onPointerMove);
    frame.addEventListener("pointerup", onPointerUp);
    frame.addEventListener("pointercancel", onPointerCancel);
    return () => {
      if (wheelRaf != null) cancelAnimationFrame(wheelRaf);
      frame.removeEventListener("wheel", onWheel);
      frame.removeEventListener("pointerdown", onPointerDown);
      frame.removeEventListener("pointermove", onPointerMove);
      frame.removeEventListener("pointerup", onPointerUp);
      frame.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [pageCount]);

  // Pinch-to-zoom on the page stack (live CSS scale, commit on release).
  // Single-finger tap opens fullscreen.
  useEffect(() => {
    const frame = frameRef.current;
    const stack = stackRef.current;
    if (!frame || !stack || pageCount < 1) return;

    const clearPinchVisual = () => {
      stack.style.transform = "";
      stack.style.transformOrigin = "";
      frame.removeAttribute("data-pinching");
    };

    let tap: { x: number; y: number; id: number } | null = null;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        tap = null;
        frame.setAttribute("data-pinching", "true");
        pinchRef.current = {
          startDist: touchDistance(e.touches[0], e.touches[1]),
          startZoom: zoomRef.current,
          liveScale: 1,
          midX: 0,
          midY: 0,
        };
        return;
      }
      pinchRef.current = null;
      if (e.touches.length === 1) {
        const t = e.touches[0];
        tap = { x: t.clientX, y: t.clientY, id: t.identifier };
      } else {
        tap = null;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const pinch = pinchRef.current;
      if (pinch && e.touches.length === 2 && pinch.startDist > 0) {
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
          stack.style.transformOrigin = `${mid.x - rect.left + frame.scrollLeft}px ${mid.y - rect.top + frame.scrollTop}px`;
          stack.style.transform = `scale(${liveScale})`;
        });
        return;
      }

      if (!tap || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.identifier !== tap.id) return;
      if (Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > TAP_MOVE_PX) tap = null;
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
      if (pinch && Math.abs(pinch.liveScale - 1) >= 0.02) {
        tap = null;
        applyZoom(pinch.startZoom * pinch.liveScale, pinch.midX, pinch.midY);
        return;
      }

      const start = tap;
      tap = null;
      if (!start || fullscreenRef.current) return;
      const ended = Array.from(e.changedTouches).find((t) => t.identifier === start.id);
      if (!ended) return;
      if (Math.hypot(ended.clientX - start.x, ended.clientY - start.y) > TAP_MOVE_PX) return;
      setFullscreen(true);
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
  const shellClass = [
    "pdf-preview-shell",
    fullscreen ? "pdf-preview-shell--fullscreen" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const portalActions =
    Boolean(toolbarActionsHost) && !fullscreen && pageCount > 0;
  const zoomActions: ReactNode = pageCount > 0 && (
    <>
      {!atFit && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={resetToFit}
          title="Ajustar a l'amplada"
        >
          Ajustar
        </button>
      )}
      {fullscreen ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={exitFullscreen}
          aria-label="Sortir de pantalla completa"
          title="Sortir de pantalla completa"
        >
          Tancar
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setFullscreen(true)}
          aria-label="Pantalla completa"
          title="Pantalla completa"
        >
          Ampliar
        </button>
      )}
    </>
  );

  return (
    <div ref={shellRef} className={shellClass}>
      {showLoading && (
        <LoadingSpinner
          className="pdf-preview-loading"
          label="Carregant PDF…"
        />
      )}

      {pageCount > 0 && (
        <div className="pdf-preview-toolbar" role="toolbar" aria-label={title}>
          <span className="pdf-preview-toolbar-label pdf-preview-page-label" aria-live="polite">
            {page} / {pageCount}
          </span>
          {!portalActions && (
            <div className="pdf-preview-toolbar-group pdf-preview-toolbar-actions">
              {zoomActions}
            </div>
          )}
        </div>
      )}

      {portalActions &&
        toolbarActionsHost &&
        createPortal(zoomActions, toolbarActionsHost)}

      <div
        ref={frameRef}
        className="pdf-preview-frame pdf-preview-frame--scroll"
        data-zoomed={atFit ? undefined : "true"}
        aria-busy={loadingDoc}
        aria-label={`${title}. Desplaça't de forma contínua entre pàgines. Fes clic per ampliar.`}
        hidden={showLoading}
      >
        <div ref={stackRef} className="pdf-preview-stack">
          {pdf &&
            layouts.map((layout, index) => (
              <PdfScrollPage
                key={index + 1}
                pdf={pdf}
                pageNumber={index + 1}
                layout={layout}
                zoom={zoom}
                rotation={rotationDeg}
                scrollRoot={scrollRoot}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

const SWIPE_PAGE_PX = 56;
const PAGE_ANIM_MS = 180;
const SLIDE_FIT_PADDING_PX = 8;

type PageAnimAxis = "x" | "y";
type PageAnimDir = 1 | -1;
type PageAnimPhase = "hold" | "go";

type PageAnimState = {
  axis: PageAnimAxis;
  dir: PageAnimDir;
  phase: PageAnimPhase;
};

function pageAnimAttr(anim: PageAnimState): string {
  const label = anim.dir > 0 ? "next" : "prev";
  return `${anim.phase}-${anim.axis}-${label}`;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function copyCanvasPixels(from: HTMLCanvasElement, to: HTMLCanvasElement) {
  to.width = from.width;
  to.height = from.height;
  to.style.width = from.style.width;
  to.style.height = from.style.height;
  const ctx = to.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, to.width, to.height);
    ctx.drawImage(from, 0, 0);
  }
}

/** Fit whole page into the frame (mobile slide viewer). */
async function measureFitPageZoom(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  rotation: number,
  frame: HTMLElement,
): Promise<number> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1, rotation });
  const availW = Math.max(1, frame.clientWidth - SLIDE_FIT_PADDING_PX);
  const availH = Math.max(1, frame.clientHeight - SLIDE_FIT_PADDING_PX);
  if (viewport.width <= 0 || viewport.height <= 0) return 1;
  const raw = Math.min(availW / viewport.width, availH / viewport.height);
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(raw * 1000) / 1000));
}

/**
 * Mobile / iPad single-page slide viewer: swipe to change pages with dual-layer
 * slide, pinch zoom, tap fullscreen.
 */
function PdfSlideViewer({
  data,
  title,
  rotation = 0,
  loading: externalLoading = false,
  error: externalError = null,
  toolbarActionsHost = null,
}: PdfCanvasViewerProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outgoingCanvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const renderGenRef = useRef(0);
  const fitGenRef = useRef(0);
  const stickToFitRef = useRef(true);
  const fitZoomRef = useRef(1);
  const zoomRef = useRef(1);
  const atFitRef = useRef(true);
  const pageRef = useRef(1);
  const pageCountRef = useRef(0);
  const fullscreenRef = useRef(false);
  const pageAnimLockRef = useRef(false);
  const pendingSlideRef = useRef<{ axis: PageAnimAxis; dir: PageAnimDir } | null>(null);
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
  const swipeRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [opening, setOpening] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [pageAnim, setPageAnim] = useState<PageAnimState | null>(null);

  const rotationDeg = useMemo(() => normalizeRotation(rotation), [rotation]);
  const loadingDoc = externalLoading || opening;
  const busy = loadingDoc || rendering;
  const displayError = externalError ?? error;
  const atFit = Math.abs(zoom - fitZoom) < 0.005;

  atFitRef.current = atFit;
  pageRef.current = page;
  pageCountRef.current = pageCount;
  fullscreenRef.current = fullscreen;

  const applyZoom = (nextZoom: number, clientX?: number, clientY?: number) => {
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

  const resetToFit = () => {
    stickToFitRef.current = true;
    zoomAnchorRef.current = null;
    zoomRef.current = fitZoomRef.current;
    setZoom(fitZoomRef.current);
  };

  const goToPage = (
    next: number,
    opts?: { axis?: PageAnimAxis; dir?: PageAnimDir },
  ) => {
    const max = pageCountRef.current;
    if (max < 1) return;
    const clamped = Math.min(max, Math.max(1, next));
    if (clamped === pageRef.current) return;
    if (pageAnimLockRef.current) return;

    const dir: PageAnimDir = opts?.dir ?? (clamped > pageRef.current ? 1 : -1);
    const axis: PageAnimAxis = opts?.axis ?? "x";

    zoomAnchorRef.current = null;

    const frame = frameRef.current;
    if (frame) {
      frame.scrollTop = 0;
      frame.scrollLeft = 0;
    }

    if (prefersReducedMotion()) {
      stickToFitRef.current = true;
      setPage(clamped);
      return;
    }

    const live = canvasRef.current;
    const outgoing = outgoingCanvasRef.current;
    if (live && outgoing && live.width > 0) {
      copyCanvasPixels(live, outgoing);
    }

    pageAnimLockRef.current = true;
    pendingSlideRef.current = { axis, dir };
    stickToFitRef.current = true;
    setPageAnim({ axis, dir, phase: "hold" });
    setPage(clamped);
  };

  const finishPageSlide = () => {
    pageAnimLockRef.current = false;
    pendingSlideRef.current = null;
    setPageAnim(null);
  };

  const onSlideTransitionEnd = (e: TransitionEvent<HTMLCanvasElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== "transform") return;
    if (pageAnim?.phase !== "go") return;
    finishPageSlide();
  };

  const exitFullscreen = () => setFullscreen(false);

  useEffect(() => {
    if (!fullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  useEffect(() => {
    let active = true;
    const ac = new AbortController();

    setPage(1);
    setPageCount(0);
    setZoom(1);
    setFitZoom(1);
    setFullscreen(false);
    setPageAnim(null);
    pageAnimLockRef.current = false;
    pendingSlideRef.current = null;
    zoomRef.current = 1;
    fitZoomRef.current = 1;
    stickToFitRef.current = true;
    zoomAnchorRef.current = null;
    pinchRef.current = null;
    swipeRef.current = null;
    setError(null);

    const previous = pdfRef.current;
    pdfRef.current = null;
    if (previous) void previous.cleanup();

    if (!data) {
      setOpening(false);
      return () => {
        active = false;
        ac.abort();
      };
    }

    setOpening(true);
    void openPdfDocument(data.slice(0), ac.signal)
      .then((doc) => {
        if (!active) {
          void doc.cleanup();
          return;
        }
        pdfRef.current = doc;
        setPageCount(doc.numPages);
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
      const doc = pdfRef.current;
      pdfRef.current = null;
      if (doc) void doc.cleanup();
    };
  }, [data]);

  useLayoutEffect(() => {
    const pdf = pdfRef.current;
    const frame = frameRef.current;
    if (!pdf || !frame || pageCount < 1) return;

    let cancelled = false;
    const gen = ++fitGenRef.current;

    const runFit = () => {
      void measureFitPageZoom(pdf, page, rotationDeg, frame).then((nextFit) => {
        if (cancelled || gen !== fitGenRef.current) return;
        const prevFit = fitZoomRef.current;
        fitZoomRef.current = nextFit;
        if (Math.abs(nextFit - prevFit) >= 0.01) setFitZoom(nextFit);
        if (stickToFitRef.current) {
          zoomRef.current = nextFit;
          setZoom((z) => (Math.abs(z - nextFit) < 0.01 ? z : nextFit));
        }
      });
    };

    runFit();
    const ro = new ResizeObserver(() => runFit());
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
          frame.scrollLeft = Math.max(0, anchor.contentX * zoom - anchor.localX);
          frame.scrollTop = Math.max(0, anchor.contentY * zoom - anchor.localY);
          zoomAnchorRef.current = null;
        }

        setRendering(false);

        const pendingSlide = pendingSlideRef.current;
        if (pendingSlide) {
          pendingSlideRef.current = null;
          setPageAnim({
            axis: pendingSlide.axis,
            dir: pendingSlide.dir,
            phase: "hold",
          });
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setPageAnim({
                axis: pendingSlide.axis,
                dir: pendingSlide.dir,
                phase: "go",
              });
            });
          });
        }
      })
      .catch((err) => {
        if (isPdfRenderCancelled(err)) return;
        if (gen !== renderGenRef.current) return;
        setError("No s'ha pogut renderitzar la pàgina del PDF.");
        setRendering(false);
        if (pendingSlideRef.current || pageAnimLockRef.current) finishPageSlide();
      });

    return () => {
      ac.abort();
    };
  }, [page, pageCount, zoom, rotationDeg, data]);

  useEffect(() => {
    if (!pageAnim || pageAnim.phase !== "go") return;
    const timer = window.setTimeout(() => finishPageSlide(), PAGE_ANIM_MS + 100);
    return () => window.clearTimeout(timer);
  }, [pageAnim]);

  // Pinch + swipe pages + tap fullscreen
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
      if (e.touches.length === 2) {
        swipeRef.current = null;
        frame.setAttribute("data-pinching", "true");
        pinchRef.current = {
          startDist: touchDistance(e.touches[0], e.touches[1]),
          startZoom: zoomRef.current,
          liveScale: 1,
          midX: 0,
          midY: 0,
        };
        return;
      }
      pinchRef.current = null;
      if (e.touches.length === 1) {
        const t = e.touches[0];
        swipeRef.current = {
          id: t.identifier,
          startX: t.clientX,
          startY: t.clientY,
          moved: false,
        };
      } else {
        swipeRef.current = null;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const pinch = pinchRef.current;
      if (pinch && e.touches.length === 2 && pinch.startDist > 0) {
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
        return;
      }

      const swipe = swipeRef.current;
      if (!swipe || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.identifier !== swipe.id) return;
      if (Math.hypot(t.clientX - swipe.startX, t.clientY - swipe.startY) > TAP_MOVE_PX) {
        swipe.moved = true;
      }
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
      if (pinch && Math.abs(pinch.liveScale - 1) >= 0.02) {
        swipeRef.current = null;
        applyZoom(pinch.startZoom * pinch.liveScale, pinch.midX, pinch.midY);
        return;
      }

      const swipe = swipeRef.current;
      swipeRef.current = null;
      if (!swipe || pageAnimLockRef.current) return;

      const ended = Array.from(e.changedTouches).find((t) => t.identifier === swipe.id);
      if (!ended) return;

      const dx = ended.clientX - swipe.startX;
      const dy = ended.clientY - swipe.startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (absX >= SWIPE_PAGE_PX && absX > absY * 1.15) {
        const dir: PageAnimDir = dx < 0 ? 1 : -1;
        goToPage(pageRef.current + dir, { axis: "x", dir });
        return;
      }
      if (atFitRef.current && absY >= SWIPE_PAGE_PX && absY > absX * 1.15) {
        const dir: PageAnimDir = dy < 0 ? 1 : -1;
        goToPage(pageRef.current + dir, { axis: "y", dir });
        return;
      }

      if (!swipe.moved && !fullscreenRef.current && absX < TAP_MOVE_PX && absY < TAP_MOVE_PX) {
        setFullscreen(true);
      }
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
  const shellClass = [
    "pdf-preview-shell",
    "pdf-preview-shell--touch",
    fullscreen ? "pdf-preview-shell--fullscreen" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const portalActions =
    Boolean(toolbarActionsHost) && !fullscreen && pageCount > 0;
  const zoomActions: ReactNode = pageCount > 0 && (
    <>
      {!atFit && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={resetToFit}
          title="Ajustar a la finestra"
        >
          Ajustar
        </button>
      )}
      {fullscreen ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={exitFullscreen}
          aria-label="Sortir de pantalla completa"
          title="Sortir de pantalla completa"
        >
          Tancar
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setFullscreen(true)}
          aria-label="Pantalla completa"
          title="Pantalla completa"
        >
          Ampliar
        </button>
      )}
    </>
  );

  return (
    <div ref={shellRef} className={shellClass}>
      {showLoading && (
        <LoadingSpinner
          className="pdf-preview-loading"
          label="Carregant PDF…"
        />
      )}

      {pageCount > 0 && (
        <div className="pdf-preview-toolbar" role="toolbar" aria-label={title}>
          <span className="pdf-preview-toolbar-label pdf-preview-page-label" aria-live="polite">
            {page} / {pageCount}
          </span>
          {!portalActions && (
            <div className="pdf-preview-toolbar-group pdf-preview-toolbar-actions">
              {zoomActions}
            </div>
          )}
        </div>
      )}

      {portalActions &&
        toolbarActionsHost &&
        createPortal(zoomActions, toolbarActionsHost)}

      <div
        ref={frameRef}
        className="pdf-preview-frame pdf-preview-frame--slide"
        data-zoomed={atFit ? undefined : "true"}
        data-touch-ui="true"
        data-page-anim={pageAnim ? pageAnimAttr(pageAnim) : undefined}
        aria-busy={busy}
        aria-label={`${title}. Llisca per canviar de pàgina. Toca per ampliar.`}
        hidden={showLoading}
      >
        <canvas
          ref={outgoingCanvasRef}
          className="pdf-preview-canvas pdf-preview-canvas--outgoing"
          aria-hidden
        />
        <canvas
          ref={canvasRef}
          className="pdf-preview-canvas pdf-preview-canvas--live"
          onTransitionEnd={onSlideTransitionEnd}
        />
      </div>
    </div>
  );
}

/**
 * PDF canvas viewer: continuous scroll on desktop, slide pages on mobile/iPad.
 */
export function PdfCanvasViewer(props: PdfCanvasViewerProps) {
  const isTouchUi = useMediaQuery(TOUCH_UI_QUERY);
  if (isTouchUi) return <PdfSlideViewer {...props} />;
  return <PdfContinuousViewer {...props} />;
}

/**
 * PDF file preview (no client-side translation overlays).
 */
export function PdfPreview({
  documentId,
  filePath,
  title,
  rotation = 0,
  toolbarActionsHost = null,
}: {
  documentId?: number | null;
  /** Storage-relative path (e.g. document `duplicate_path`). */
  filePath?: string | null;
  title: string;
  rotation?: number;
  toolbarActionsHost?: HTMLElement | null;
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
      toolbarActionsHost={toolbarActionsHost}
    />
  );
}
