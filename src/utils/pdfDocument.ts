import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let workerConfigured = false;

export function ensurePdfWorker(): void {
  if (workerConfigured) return;
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  workerConfigured = true;
}

const PDF_LOAD_OPTS = {
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
} as const;

/** Open a PDF from a blob URL or ArrayBuffer. Caller must call pdf.cleanup(). */
export async function openPdfDocument(
  source: string | ArrayBuffer,
  signal?: AbortSignal,
): Promise<PDFDocumentProxy> {
  ensurePdfWorker();
  signal?.throwIfAborted();

  const loadingTask = getDocument(
    typeof source === "string"
      ? { url: source, ...PDF_LOAD_OPTS }
      : { data: new Uint8Array(source), ...PDF_LOAD_OPTS },
  );

  const abort = () => {
    void loadingTask.destroy();
  };
  signal?.addEventListener("abort", abort, { once: true });

  try {
    return await loadingTask.promise;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

/** Render one 1-based page onto an existing canvas. */
export async function renderPdfPageOntoCanvas(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  options?: { scale?: number; rotation?: number; signal?: AbortSignal },
): Promise<void> {
  options?.signal?.throwIfAborted();
  const page = await pdf.getPage(pageNumber);
  options?.signal?.throwIfAborted();
  const scale = options?.scale ?? 2;
  const rotation = ((options?.rotation ?? 0) % 360 + 360) % 360;
  const viewport = page.getViewport({ scale, rotation });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  // pdf.js v6: pass `canvas` only (not canvasContext). Cancel any in-flight
  // render on this canvas via the returned task when the signal aborts.
  const renderTask = page.render({ canvas, viewport });
  const onAbort = () => {
    void renderTask.cancel();
  };
  options?.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    await renderTask.promise;
    options?.signal?.throwIfAborted();
  } finally {
    options?.signal?.removeEventListener("abort", onAbort);
  }
}

/** True when a render was intentionally cancelled (superseded / aborted). */
export function isPdfRenderCancelled(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name: unknown }).name) : "";
  return (
    name === "AbortError" ||
    name === "RenderingCancelledException" ||
    name === "AbortException"
  );
}

/** Render one 1-based page to a canvas (high DPI for OCR). */
export async function renderPdfPageToCanvas(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  options?: { scale?: number; rotation?: number; signal?: AbortSignal },
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  await renderPdfPageOntoCanvas(pdf, pageNumber, canvas, options);
  return canvas;
}
