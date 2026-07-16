import { buildHeaders, storedFileUrl } from "@/api/client";
import type { LayoutPage } from "@/api/types";
import type { TranslatedPageResult } from "@/utils/ocrTranslateHelpers";

/** Map backend layout page fields onto the client overlay shape (URL still relative). */
export function mapLayoutPage(page: LayoutPage): TranslatedPageResult {
  return {
    width: page.width,
    height: page.height,
    backgroundUrl: storedFileUrl(page.background_url),
    lines: page.lines.map((line) => ({
      text: line.text,
      translated: line.translated,
      bbox: line.bbox,
      align: line.align ?? "left",
      fontHeightRatio: line.fontHeightRatio,
      fontGroupId: line.fontGroupId,
    words: line.words ?? undefined,
    })),
    plainParagraphs: page.plain_paragraphs ?? [],
  };
}

/**
 * Fetch a storage-relative file with API auth and return a blob object URL.
 * Caller must revoke the URL when done.
 */
export async function fetchStoredFileObjectUrl(
  relativePath: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(storedFileUrl(relativePath), {
    headers: buildHeaders({ Accept: "*/*" }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`No s'ha pogut carregar el fitxer (HTTP ${res.status}).`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Resolve layout pages into overlay results with authenticated blob backgrounds.
 */
export async function resolveLayoutPageResults(
  pages: LayoutPage[],
  signal?: AbortSignal,
): Promise<Record<number, TranslatedPageResult>> {
  const results: Record<number, TranslatedPageResult> = {};
  for (const page of pages) {
    signal?.throwIfAborted();
    const mapped = mapLayoutPage(page);
    const backgroundUrl = await fetchStoredFileObjectUrl(
      page.background_url,
      signal,
    );
    results[page.page] = { ...mapped, backgroundUrl };
  }
  return results;
}

export function revokeTranslatedPageBackgrounds(
  results: Record<number, TranslatedPageResult>,
) {
  for (const page of Object.values(results)) {
    if (page.backgroundUrl.startsWith("blob:")) {
      URL.revokeObjectURL(page.backgroundUrl);
    }
  }
}

/** Trigger a download of the burn-in layout PDF via `/files/by-path`. */
export async function downloadLayoutPdf(
  relativePath: string,
  filename = "layout.pdf",
  signal?: AbortSignal,
): Promise<void> {
  const objectUrl = await fetchStoredFileObjectUrl(relativePath, signal);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
