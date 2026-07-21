import { useLayoutEffect, useRef, useState } from "react";
import {
  buildHeaders,
  pictureFileUrl,
  storedFileUrl,
  throwIfNotOk,
  videoFileUrl,
} from "@/api/client";
import type { MediaKind } from "@/api/types";

const activeReleases = new Map<string, () => void>();

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function mediaPreviewKey(
  kind: MediaKind,
  id?: number | null,
  filePath?: string | null,
): string {
  if (id != null) return `${kind}:${id}`;
  if (filePath) return `path:${filePath}`;
  return "empty";
}

/** Force-close any in-flight preview fetch / media element for a picture or video. */
export async function releaseMediaPreview(
  kind: MediaKind,
  id: number,
): Promise<void> {
  await releasePreviewKey(mediaPreviewKey(kind, id));
}

/** Force-close any in-flight preview fetch / media element for a storage path. */
export async function releaseMediaFilePathPreview(
  filePath: string,
): Promise<void> {
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

function clearMediaElement(
  img: HTMLImageElement | null,
  video: HTMLVideoElement | null,
): void {
  if (img) {
    img.removeAttribute("src");
  }
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

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
 * Image/video preview via authenticated blob fetch (Bearer token).
 */
export function MediaPreview({
  kind,
  id,
  filePath,
  title = "Vista prèvia",
  className,
  thumb = false,
}: MediaPreviewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
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

  const cacheKey = mediaPreviewKey(kind, id, filePath);

  useLayoutEffect(() => {
    let active = true;
    const ac = new AbortController();
    let urlToRevoke: string | null = null;

    const release = () => {
      active = false;
      ac.abort();
      clearMediaElement(imgRef.current, videoRef.current);
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
      .then(async (res) => {
        await throwIfNotOk(res);
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
      activeReleases.delete(cacheKey);
      release();
    };
  }, [cacheKey, sourceUrl]);

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
        <img
          ref={imgRef}
          src={objectUrl}
          alt={title}
          className="media-preview-media"
        />
      )}
      {!loading && objectUrl && kind === "video" && (
        <video
          ref={videoRef}
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
