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
  const scale = options?.scale ?? 2;
  const rotation = ((options?.rotation ?? 0) % 360 + 360) % 360;
  const viewport = page.getViewport({ scale, rotation });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No s'ha pogut crear el canvas per renderitzar la pàgina.");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  options?.signal?.throwIfAborted();
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
