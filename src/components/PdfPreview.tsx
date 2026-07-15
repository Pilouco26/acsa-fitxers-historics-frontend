import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildHeaders, documentFileUrl, storedFileUrl } from "@/api/client";
import { PdfOcrTranslateWorkspace } from "@/components/PdfOcrTranslateWorkspace";
import type { TranslateLanguageCode } from "@/constants/translateLanguages";

const activeReleases = new Map<string, () => void>();

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function previewKey(documentId?: number | null, filePath?: string | null): string {
  if (filePath) return `path:${filePath}`;
  if (documentId != null) return `doc:${documentId}`;
  return "empty";
}

/** Force-close any in-flight preview fetch / iframe for a document id. */
export async function releaseDocumentPreview(documentId: number): Promise<void> {
  await releasePreviewKey(`doc:${documentId}`);
}

/** Force-close any in-flight preview fetch / iframe for a storage path. */
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

/**
 * PDF file preview. Page OCR translation is handled by `PdfOcrTranslateWorkspace`
 * (client-side), distinct from backend `translated_text` (`BackendDocumentTranslatePanel`).
 */
export function PdfPreview({
  documentId,
  filePath,
  title,
  rotation = 0,
  documentLanguage,
  defaultOcrTargetLanguage,
  pageTranslateOpen: pageTranslateOpenProp,
  onPageTranslateOpenChange,
  showPageTranslateButton = true,
}: {
  documentId?: number | null;
  /** Storage-relative path (e.g. document `duplicate_path`). */
  filePath?: string | null;
  title: string;
  rotation?: number;
  /** Document metadata `language` (e.g. "fr") used as Origen for page translate. */
  documentLanguage?: string | null;
  defaultOcrTargetLanguage?: TranslateLanguageCode | null;
  /** Controlled page-translate (OCR) mode. When set, parent owns open state. */
  pageTranslateOpen?: boolean;
  onPageTranslateOpenChange?: (open: boolean) => void;
  /**
   * Show the in-preview "Traduir pàgina" button.
   * Set false when the parent toolbar hosts the control (e.g. Documents page).
   */
  showPageTranslateButton?: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);

  const controlled = pageTranslateOpenProp !== undefined;
  const pageTranslateOpen = controlled ? pageTranslateOpenProp : uncontrolledOpen;

  function setPageTranslateOpen(open: boolean) {
    if (!controlled) setUncontrolledOpen(open);
    onPageTranslateOpenChange?.(open);
  }

  const sourceUrl = useMemo(() => {
    if (filePath) return storedFileUrl(filePath);
    if (documentId != null) return documentFileUrl(documentId);
    return null;
  }, [documentId, filePath]);

  const cacheKey = previewKey(documentId, filePath);

  const iframeSrc = useMemo(() => {
    if (!objectUrl) return null;
    return `${objectUrl}#toolbar=0&navpanes=0&scrollbar=0`;
  }, [objectUrl]);

  const rotationDeg = useMemo(() => {
    const normalized = ((rotation % 360) + 360) % 360;
    return normalized;
  }, [rotation]);

  useLayoutEffect(() => {
    let active = true;
    const ac = new AbortController();
    let urlToRevoke: string | null = null;

    const release = () => {
      active = false;
      ac.abort();
      const iframe = iframeRef.current;
      if (iframe) iframe.src = "about:blank";
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
        urlToRevoke = null;
      }
    };

    if (!sourceUrl) {
      setLoading(false);
      setError("No s'ha pogut determinar el fitxer a previsualitzar.");
      setObjectUrl(null);
      return () => {
        release();
      };
    }

    activeReleases.set(cacheKey, release);

    setLoading(true);
    setError(null);
    setObjectUrl(null);
    if (!controlled) setUncontrolledOpen(false);
    onPageTranslateOpenChange?.(false);

    fetch(sourceUrl, {
      headers: buildHeaders(),
      signal: ac.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => {
        if (!active) return;
        const blob = new Blob([data], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        urlToRevoke = url;
        setObjectUrl(url);
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
  }, [cacheKey, sourceUrl]); // reset page-translate when source changes

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  return (
    <div
      className={`pdf-preview-shell ${pageTranslateOpen ? "pdf-preview-shell--ocr" : ""}`}
    >
      {loading && <p className="empty-state">Carregant PDF…</p>}

      {!loading && showPageTranslateButton && (
        <div className="pdf-preview-toolbar">
          <button
            type="button"
            className={`btn btn-sm ${pageTranslateOpen ? "btn-primary" : "btn-secondary"}`}
            aria-pressed={pageTranslateOpen}
            disabled={!objectUrl}
            title="Traduir la pàgina actual (resultat al costat)"
            onClick={() => setPageTranslateOpen(!pageTranslateOpen)}
          >
            {pageTranslateOpen ? "Tancar traducció" : "Traduir pàgina"}
          </button>
        </div>
      )}

      {pageTranslateOpen ? (
        <PdfOcrTranslateWorkspace
          objectUrl={objectUrl}
          open={pageTranslateOpen}
          documentLanguage={documentLanguage}
          defaultTargetLanguage={defaultOcrTargetLanguage}
        />
      ) : (
        <div
          className="pdf-preview-frame"
          aria-busy={loading}
          aria-label={title}
          hidden={loading}
        >
          {iframeSrc && (
            <div
              style={{
                width: "100%",
                height: "100%",
                transform: `rotate(${rotationDeg}deg)`,
                transformOrigin: "center center",
              }}
            >
              <iframe
                ref={iframeRef}
                title={title}
                src={iframeSrc}
                style={{ width: "100%", height: "100%", border: 0, display: "block" }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
