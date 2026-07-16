import { useLayoutEffect, useState } from "react";
import {
  buildHeaders,
  pictureFileUrl,
  storedFileUrl,
  videoFileUrl,
} from "@/api/client";
import type { MediaKind } from "@/api/types";

type MediaPreviewProps = {
  kind: MediaKind;
  id?: number | null;
  /** Storage-relative path fallback (e.g. right after upload). */
  filePath?: string | null;
  title?: string;
  className?: string;
  /** Compact thumbnail mode for lists/grids. */
  thumb?: boolean;
};

/**
 * Image/video preview via authenticated blob fetch (supports X-API-Key).
 */
export function MediaPreview({
  kind,
  id,
  filePath,
  title = "Vista prèvia",
  className,
  thumb = false,
}: MediaPreviewProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const sourceUrl =
    id != null
      ? kind === "picture"
        ? pictureFileUrl(id)
        : videoFileUrl(id)
      : filePath
        ? storedFileUrl(filePath)
        : null;

  useLayoutEffect(() => {
    let active = true;
    const ac = new AbortController();
    let urlToRevoke: string | null = null;

    if (!sourceUrl) {
      setLoading(false);
      setError("No s'ha pogut determinar el fitxer a previsualitzar.");
      setObjectUrl(null);
      return;
    }

    setLoading(true);
    setError(null);
    setObjectUrl(null);

    fetch(sourceUrl, {
      headers: buildHeaders(),
      signal: ac.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (!active) return;
        const url = URL.createObjectURL(blob);
        urlToRevoke = url;
        setObjectUrl(url);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!active) return;
        setError("No s'ha pogut carregar la vista prèvia.");
        setLoading(false);
      });

    return () => {
      active = false;
      ac.abort();
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [sourceUrl]);

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  const shellClass = [
    "media-preview-shell",
    thumb && "media-preview-shell--thumb",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass} aria-busy={loading} aria-label={title}>
      {loading && <p className="empty-state">Carregant…</p>}
      {!loading && objectUrl && kind === "picture" && (
        <img src={objectUrl} alt={title} className="media-preview-media" />
      )}
      {!loading && objectUrl && kind === "video" && (
        <video
          src={objectUrl}
          controls={!thumb}
          muted={thumb}
          playsInline
          className="media-preview-media"
          preload="metadata"
        />
      )}
    </div>
  );
}
