import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { buildHeaders, documentFileUrl, storedFileUrl, throwIfNotOk } from "@/api/client";
import { openPdfDocument, renderPdfPageOntoCanvas } from "@/utils/pdfDocument";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;
const ZOOM_DEFAULT = 1;

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
 */
export function PdfCanvasViewer({
  data,
  title,
  rotation = 0,
  loading: externalLoading = false,
  error: externalError = null,
}: PdfCanvasViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const renderGenRef = useRef(0);

  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
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
    setZoom(ZOOM_DEFAULT);
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
        // CSS size follows zoom; backing store already includes DPR.
        canvas.style.width = `${Math.ceil(canvas.width / dpr)}px`;
        canvas.style.height = `${Math.ceil(canvas.height / dpr)}px`;
        setRendering(false);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (gen !== renderGenRef.current) return;
        setError("No s'ha pogut renderitzar la pàgina del PDF.");
        setRendering(false);
      });

    return () => {
      ac.abort();
    };
  }, [page, pageCount, zoom, rotationDeg, data]);

  if (displayError) {
    return <div className="alert alert-error">{displayError}</div>;
  }

  const showLoading = busy && pageCount < 1;

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
              onClick={() => setPage((p) => Math.max(1, p - 1))}
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
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
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
              onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
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
              onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
              aria-label="Augmentar zoom"
            >
              +
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || zoom === ZOOM_DEFAULT}
              onClick={() => setZoom(ZOOM_DEFAULT)}
            >
              Restablir
            </button>
          </div>
        </div>
      )}

      <div
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
