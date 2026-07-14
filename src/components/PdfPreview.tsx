import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildHeaders, documentFileUrl, storedFileUrl } from "@/api/client";

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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const sourceUrl = useMemo(() => {
    if (filePath) return storedFileUrl(filePath);
    if (documentId != null) return documentFileUrl(documentId);
    return null;
  }, [documentId, filePath]);

  const cacheKey = previewKey(documentId, filePath);

  const iframeSrc = useMemo(() => {
    if (!objectUrl) return null;
    // Hide built-in PDF viewer UI when supported by browser/plugin.
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
  }, [cacheKey, sourceUrl]);

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  return (
    <>
      {loading && <p className="empty-state">Carregant PDF…</p>}
      <div className="pdf-preview-frame" aria-busy={loading} aria-label={title} hidden={loading}>
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
    </>
  );
}
