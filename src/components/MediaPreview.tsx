import { useLayoutEffect, useRef, useState } from "react";
import {
  buildHeaders,
  pictureFileUrl,
  storedFileUrl,
  throwIfNotOk,
  videoFileUrl,
} from "@/api/client";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import type { MediaKind } from "@/api/types";

const activeReleases = new Map<string, () => void>();

/** ISO BMFF brands that indicate HEVC / Dolby Vision (Chrome often cannot decode). */
const HEVC_BRANDS = new Set([
  "hev1",
  "hvc1",
  "hevc",
  "dvh1",
  "dvhe",
  "dvav",
]);

type VideoFlashIcon = "play" | "pause";

function VideoFlashGlyph({ kind }: { kind: VideoFlashIcon }) {
  if (kind === "pause") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="media-preview-video-flash-glyph">
        <rect x="5" y="4" width="5" height="16" rx="1.5" fill="currentColor" />
        <rect x="14" y="4" width="5" height="16" rx="1.5" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="media-preview-video-flash-glyph">
      <path
        fill="currentColor"
        d="M7.5 4.8v14.4c0 .7.76 1.13 1.35.76l11.2-7.2a.9.9 0 0 0 0-1.52l-11.2-7.2a.9.9 0 0 0-1.35.76Z"
      />
    </svg>
  );
}
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

function fileExt(name: string | null | undefined): string {
  if (!name) return "";
  const base = name.replace(/\\/g, "/").split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot).toLowerCase() : "";
}

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  const end = Math.min(bytes.length, start + length);
  for (let i = start; i < end; i++) {
    out += String.fromCharCode(bytes[i]!);
  }
  return out;
}

type VideoSniff = {
  mime: string;
  hevcLikely: boolean;
  brands: string[];
};

/** Inspect container magic bytes so we can pick a Chrome-friendly MIME. */
async function sniffVideoContainer(blob: Blob): Promise<VideoSniff | null> {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (head.length < 12) return null;

  // WebM / Matroska: EBML header 1A 45 DF A3
  if (
    head[0] === 0x1a &&
    head[1] === 0x45 &&
    head[2] === 0xdf &&
    head[3] === 0xa3
  ) {
    return { mime: "video/webm", hevcLikely: false, brands: [] };
  }

  // Ogg
  if (readAscii(head, 0, 4) === "OggS") {
    return { mime: "video/ogg", hevcLikely: false, brands: [] };
  }

  // ISO BMFF (MP4 / MOV / M4V): ....ftypXXXX
  if (readAscii(head, 4, 4) !== "ftyp") return null;

  const boxSize =
    ((head[0]! << 24) | (head[1]! << 16) | (head[2]! << 8) | head[3]!) >>> 0;
  const ftypBytes = Math.min(
    Math.max(boxSize || 32, 32),
    256,
    blob.size,
  );
  const probe = new Uint8Array(await blob.slice(0, ftypBytes).arrayBuffer());

  const brands: string[] = [];
  const major = readAscii(probe, 8, 4);
  if (major.trim()) brands.push(major);
  // Compatible brands start at offset 16 (after minor_version).
  for (let off = 16; off + 4 <= probe.length; off += 4) {
    const brand = readAscii(probe, off, 4);
    if (/^[a-zA-Z0-9][\w ]{3}$/.test(brand)) brands.push(brand);
  }

  const hevcLikely = brands.some((b) => HEVC_BRANDS.has(b.trim().toLowerCase()));
  // Chromium plays ISO BMFF much more reliably as video/mp4 than video/quicktime.
  return { mime: "video/mp4", hevcLikely, brands };
}

function guessMediaMimeFromName(
  kind: MediaKind,
  ...hints: Array<string | null | undefined>
): string {
  for (const hint of hints) {
    const ext = fileExt(hint);
    if (!ext) continue;
    if (kind === "picture") {
      if (ext === ".png") return "image/png";
      if (ext === ".webp") return "image/webp";
      if (ext === ".gif") return "image/gif";
      if (ext === ".bmp") return "image/bmp";
      if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
      continue;
    }
    if (ext === ".webm") return "video/webm";
    if (ext === ".ogv" || ext === ".ogg") return "video/ogg";
    // Prefer mp4 for .mov — video/quicktime is rejected by Chrome/Edge.
    if (ext === ".mov" || ext === ".mp4" || ext === ".m4v") return "video/mp4";
  }
  return kind === "picture" ? "image/jpeg" : "video/mp4";
}

function playbackMimeFromHeader(header: string, kind: MediaKind): string | null {
  const type = header.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!type || type === "application/octet-stream" || type === "application/json") {
    return null;
  }
  if (kind === "picture") {
    return type.startsWith("image/") ? type : null;
  }
  if (type === "video/quicktime" || type === "video/x-quicktime") {
    // Map QuickTime to mp4 for Chromium playback attempts.
    return "video/mp4";
  }
  if (type.startsWith("video/") || type.startsWith("audio/")) return type;
  return null;
}

async function prepareMediaBlob(
  raw: Blob,
  kind: MediaKind,
  contentTypeHeader: string | null,
  ...nameHints: Array<string | null | undefined>
): Promise<{ blob: Blob; hevcLikely: boolean; mime: string }> {
  if (kind === "picture") {
    const mime =
      playbackMimeFromHeader(contentTypeHeader ?? "", kind) ||
      (raw.type.startsWith("image/") ? raw.type : null) ||
      guessMediaMimeFromName(kind, ...nameHints);
    const blob = raw.type === mime ? raw : new Blob([raw], { type: mime });
    return { blob, hevcLikely: false, mime };
  }

  const sniffed = await sniffVideoContainer(raw);
  const mime =
    sniffed?.mime ||
    playbackMimeFromHeader(contentTypeHeader ?? "", kind) ||
    (raw.type.startsWith("video/") || raw.type.startsWith("audio/")
      ? raw.type === "video/quicktime" || raw.type === "video/x-quicktime"
        ? "video/mp4"
        : raw.type
      : null) ||
    guessMediaMimeFromName(kind, ...nameHints);

  const blob = raw.type === mime ? raw : new Blob([raw], { type: mime });
  return { blob, hevcLikely: Boolean(sniffed?.hevcLikely), mime };
}

function videoUnsupportedMessage(hevcLikely: boolean): string {
  if (hevcLikely) {
    return "Aquest vídeo sembla HEVC/H.265 (sovint de l’iPhone). Chrome a Windows no el pot reproduir. Descarregueu-lo o torneu a exportar-lo com a MP4 (H.264).";
  }
  return "No s'ha pogut reproduir el vídeo en aquest navegador. Proveu MP4 (H.264) o WebM, o descarregueu el fitxer.";
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
  const hevcLikelyRef = useRef(false);
  const flashTimerRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("video");
  const [flashIcon, setFlashIcon] = useState<VideoFlashIcon | null>(null);
  const [flashNonce, setFlashNonce] = useState(0);

  const sourceUrl =
    id != null
      ? kind === "picture"
        ? pictureFileUrl(id)
        : // Preview must use lazy H.264 derivative; original may be mp4v/HEVC/MOV.
          videoFileUrl(id, { playback: true })
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
    hevcLikelyRef.current = false;

    const hintName =
      filePath?.replace(/\\/g, "/").split("/").pop() ||
      title ||
      (kind === "video" ? "video.mp4" : "image.jpg");
    setDownloadName(hintName);

    fetch(sourceUrl, {
      // Override default Accept: application/json so binary media is returned as a file.
      headers: buildHeaders({ Accept: "*/*" }),
      signal: ac.signal,
    })
      .then(async (res) => {
        await throwIfNotOk(res);
        const raw = await res.blob();
        // Guard against accidental JSON error bodies served as 200.
        const head = new Uint8Array(await raw.slice(0, 1).arrayBuffer());
        if (head[0] === 0x7b /* { */) {
          throw new Error("unexpected-json-body");
        }
        return prepareMediaBlob(
          raw,
          kind,
          res.headers.get("Content-Type"),
          title,
          filePath,
        );
      })
      .then(({ blob, hevcLikely }) => {
        if (!active) return;
        hevcLikelyRef.current = hevcLikely;
        if (hevcLikely && kind === "video" && !thumb) {
          // Still create a URL so the user can download, but skip broken playback.
          const url = URL.createObjectURL(blob);
          urlToRevoke = url;
          setObjectUrl(url);
          setLoading(false);
          setError(videoUnsupportedMessage(true));
          return;
        }
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
  }, [cacheKey, filePath, kind, sourceUrl, thumb, title]);

  useLayoutEffect(() => {
    return () => {
      if (flashTimerRef.current != null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  function showPlayPauseFlash(next: VideoFlashIcon) {
    setFlashIcon(next);
    setFlashNonce((n) => n + 1);
    if (flashTimerRef.current != null) {
      window.clearTimeout(flashTimerRef.current);
    }
    flashTimerRef.current = window.setTimeout(() => {
      setFlashIcon(null);
      flashTimerRef.current = null;
    }, 550);
  }

  function togglePlayFromClick() {
    const video = videoRef.current;
    if (!video || thumb) return;
    if (video.paused) {
      void video.play().then(
        () => showPlayPauseFlash("play"),
        () => {
          video.muted = true;
          void video.play().then(
            () => showPlayPauseFlash("play"),
            () => undefined,
          );
        },
      );
    } else {
      video.pause();
      showPlayPauseFlash("pause");
    }
  }

  const shellClass = [
    "media-preview-shell",
    thumb && "media-preview-shell--thumb",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (error) {
    return (
      <div className={shellClass}>
        <div className="alert alert-error alert--inset">
          <p className="m-0">{error}</p>
          {objectUrl && kind === "video" && !thumb && (
            <p className="mt-3 m-0">
              <a
                className="btn btn-secondary btn-sm"
                href={objectUrl}
                download={downloadName}
              >
                Descarregar vídeo
              </a>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass} aria-busy={loading} aria-label={title}>
      {loading && (
        <LoadingSpinner
          className="media-preview-loading"
          label={thumb ? undefined : "Carregant…"}
          statusRole={!thumb}
        />
      )}
      {!loading && objectUrl && kind === "picture" && (
        <img
          ref={imgRef}
          src={objectUrl}
          alt={title}
          className="media-preview-media"
          onError={() =>
            setError("No s'ha pogut mostrar la imatge (format no compatible).")
          }
        />
      )}
      {!loading && objectUrl && kind === "video" && (
        <div className="media-preview-video-wrap">
          <video
            ref={videoRef}
            src={objectUrl}
            controls={!thumb}
            muted={thumb}
            autoPlay={!thumb}
            playsInline
            className="media-preview-media"
            preload="metadata"
            onLoadedData={(e) => {
              const video = e.currentTarget;
              if (thumb) {
                // Show a still frame in catalog miniatures.
                const seekTo =
                  Number.isFinite(video.duration) && video.duration > 0
                    ? Math.min(0.25, video.duration * 0.05)
                    : 0.1;
                try {
                  video.currentTime = seekTo;
                } catch {
                  /* ignore seek errors on some containers */
                }
                video.pause();
                return;
              }
              const playAttempt = video.play();
              if (playAttempt) {
                playAttempt.catch(() => {
                  // Browsers often block unmuted autoplay; mute and retry.
                  video.muted = true;
                  void video.play().catch(() => {
                    setError(videoUnsupportedMessage(hevcLikelyRef.current));
                  });
                });
              }
            }}
            onError={() =>
              setError(videoUnsupportedMessage(hevcLikelyRef.current))
            }
          />
          {!thumb && (
            <>
              <button
                type="button"
                className="media-preview-video-hit"
                aria-label="Reproduir o pausar"
                onClick={togglePlayFromClick}
              />
              {flashIcon && (
                <div
                  key={flashNonce}
                  className="media-preview-video-flash"
                  aria-hidden
                >
                  <span className="media-preview-video-flash-disc">
                    <VideoFlashGlyph kind={flashIcon} />
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
