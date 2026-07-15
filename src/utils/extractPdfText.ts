import { getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import { ensurePdfWorker } from "@/utils/pdfDocument";

/** Extract plain text from a PDF blob URL or ArrayBuffer via pdf.js. */
export async function extractPdfText(
  source: string | ArrayBuffer,
  signal?: AbortSignal,
): Promise<string> {
  ensurePdfWorker();
  signal?.throwIfAborted();

  const loadingTask = getDocument(
    typeof source === "string"
      ? {
          url: source,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
        }
      : {
          data: new Uint8Array(source),
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
        },
  );

  const abort = () => {
    void loadingTask.destroy();
  };
  signal?.addEventListener("abort", abort, { once: true });

  try {
    const pdf: PDFDocumentProxy = await loadingTask.promise;
    const parts: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      signal?.throwIfAborted();
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (pageText) parts.push(pageText);
    }

    await pdf.cleanup();
    return parts.join("\n\n").trim();
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
