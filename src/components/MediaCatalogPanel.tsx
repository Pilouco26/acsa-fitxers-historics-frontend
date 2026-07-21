import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  buildHeaders,
  listPictures,
  listVideos,
  pictureFileUrl,
  throwIfNotOk,
  videoFileUrl,
} from "@/api/client";
import { MediaPreview } from "@/components/MediaPreview";
import { DOCUMENT_STATUS_OK } from "@/constants/globals";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { MediaKind, PictureOut, VideoOut } from "@/api/types";

type CatalogItem = (PictureOut | VideoOut) & { kind: MediaKind };

type CatalogDensity = "large" | "medium" | "list";

const DENSITY_OPTIONS: { id: CatalogDensity; label: string }[] = [
  { id: "large", label: "Gran" },
  { id: "medium", label: "Mitjà" },
  { id: "list", label: "Llista" },
];

function itemKey(item: Pick<CatalogItem, "kind" | "id">): string {
  return `${item.kind}-${item.id}`;
}

function displayName(item: CatalogItem): string {
  return item.proposed_name ?? item.original_name ?? item.name ?? "—";
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function kindLabel(kind: MediaKind): string {
  return kind === "video" ? "Vídeo" : "Foto";
}

export type MediaCatalogPanelProps = {
  /** Restrict to one media kind. Omit or `"all"` for both. */
  kind?: MediaKind | "all";
  /** Filter by media folder (`folder`). */
  folder?: string | null;
};

/** Approved photos and/or videos catalog. */
export function MediaCatalogPanel({
  kind = "all",
  folder = null,
}: MediaCatalogPanelProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [density, setDensity] = useState<CatalogDensity>("large");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [isDownloading, setIsDownloading] = useState(false);

  const [lightbox, setLightbox] = useState<CatalogItem | null>(null);

  const folderFilter = folder?.trim() || undefined;

  const filters = {
    status: DOCUMENT_STATUS_OK,
    q: debouncedSearch || undefined,
    folder: folderFilter,
    limit: 50,
  };

  const loadPictures = kind === "all" || kind === "picture";
  const loadVideos = kind === "all" || kind === "video";

  const picturesQuery = useQuery({
    queryKey: [
      "pictures",
      DOCUMENT_STATUS_OK,
      debouncedSearch,
      folderFilter ?? "",
    ],
    queryFn: () => listPictures(filters),
    enabled: loadPictures,
  });

  const videosQuery = useQuery({
    queryKey: [
      "videos",
      DOCUMENT_STATUS_OK,
      debouncedSearch,
      folderFilter ?? "",
    ],
    queryFn: () => listVideos(filters),
    enabled: loadVideos,
  });

  const items: CatalogItem[] = useMemo(() => {
    const pictures = loadPictures
      ? (picturesQuery.data?.items ?? []).map((p) => ({
          ...p,
          kind: "picture" as const,
        }))
      : [];
    const videos = loadVideos
      ? (videosQuery.data?.items ?? []).map((v) => ({
          ...v,
          kind: "video" as const,
        }))
      : [];
    return [...pictures, ...videos].sort((a, b) => {
      const da = a.date ?? "";
      const db = b.date ?? "";
      if (da !== db) return db.localeCompare(da);
      return displayName(a).localeCompare(displayName(b));
    });
  }, [
    loadPictures,
    loadVideos,
    picturesQuery.data?.items,
    videosQuery.data?.items,
  ]);

  const itemKeys = useMemo(
    () => new Set(items.map((item) => itemKey(item))),
    [items],
  );

  const selectedItems = useMemo(
    () => items.filter((item) => selectedKeys.has(itemKey(item))),
    [items, selectedKeys],
  );

  const allVisibleSelected =
    items.length > 0 && items.every((item) => selectedKeys.has(itemKey(item)));

  const isLoading =
    (loadPictures && picturesQuery.isLoading) ||
    (loadVideos && videosQuery.isLoading);
  const total =
    (loadPictures ? (picturesQuery.data?.total ?? 0) : 0) +
    (loadVideos ? (videosQuery.data?.total ?? 0) : 0);

  useEffect(() => {
    setSelectedKeys((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      for (const key of prev) {
        if (itemKeys.has(key)) next.add(key);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [itemKeys]);

  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  function toggleSelected(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedKeys(new Set(items.map((item) => itemKey(item))));
  }

  function clearSelection() {
    setSelectedKeys(new Set());
  }

  async function downloadItem(item: CatalogItem) {
    const url =
      item.kind === "picture"
        ? pictureFileUrl(item.id)
        : videoFileUrl(item.id);
    const res = await fetch(url, { headers: buildHeaders() });
    await throwIfNotOk(res);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = sanitizeFilename(displayName(item)) || "fitxer";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }

  async function downloadSelected() {
    if (selectedItems.length === 0 || isDownloading) return;
    setIsDownloading(true);
    let failed = 0;
    try {
      for (const item of selectedItems) {
        try {
          await downloadItem(item);
          // Brief pause so browsers accept multiple downloads from one gesture.
          await new Promise((r) => setTimeout(r, 200));
        } catch {
          failed += 1;
        }
      }
      if (failed === 0) {
        toast.success(
          selectedItems.length === 1
            ? "Fitxer descarregat"
            : `${selectedItems.length} fitxers descarregats`,
        );
      } else if (failed === selectedItems.length) {
        toast.error("No s'han pogut descarregar els fitxers.");
      } else {
        toast.error(
          `S'han descarregat ${selectedItems.length - failed} de ${selectedItems.length} fitxers.`,
        );
      }
    } finally {
      setIsDownloading(false);
    }
  }

  const emptyLabel =
    kind === "picture"
      ? "No hi ha fotos aprovades"
      : kind === "video"
        ? "No hi ha vídeos aprovats"
        : "No hi ha mitjans aprovats";

  return (
    <>
      <div className="card">
        <div className="toolbar-row">
          <input
            type="search"
            placeholder="Cerca per nom, resum o lloc…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div
            className="segmented-control"
            role="group"
            aria-label="Mida de la vista"
          >
            {DENSITY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={density === opt.id ? "active" : undefined}
                onClick={() => setDensity(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (loadPictures) picturesQuery.refetch();
              if (loadVideos) videosQuery.refetch();
            }}
          >
            Actualitzar
          </button>
        </div>

        {isLoading && <p className="empty-state">Carregant…</p>}

        {!isLoading && items.length === 0 && (
          <p className="empty-state">
            {emptyLabel}
            {folderFilter ? ` a «${folderFilter}»` : ""}
            {debouncedSearch ? " amb aquesta cerca" : ""}.
          </p>
        )}

        {!isLoading && items.length > 0 && (
          <>
            <div className="media-catalog-status-row">
              <p className="media-catalog-count">
                Mostrant {items.length}
                {total > items.length ? ` de ${total}` : ""} fitxers
                {selectedItems.length > 0
                  ? ` · ${selectedItems.length} seleccionats`
                  : ""}
              </p>
              <div className="media-catalog-selection-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    allVisibleSelected ? clearSelection() : selectAllVisible()
                  }
                >
                  {allVisibleSelected
                    ? "Deseleccionar tot"
                    : "Seleccionar tot"}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={selectedItems.length === 0 || isDownloading}
                  onClick={() => void downloadSelected()}
                >
                  {isDownloading
                    ? "Descarregant…"
                    : selectedItems.length > 0
                      ? `Descarregar (${selectedItems.length})`
                      : "Descarregar"}
                </button>
              </div>
            </div>
            <div
              className={`media-catalog-grid media-catalog-grid--${density}`}
            >
              {items.map((item) => {
                const key = itemKey(item);
                const isSelected = selectedKeys.has(key);
                return (
                  <div
                    key={key}
                    className={[
                      "media-catalog-card",
                      `media-catalog-card--${density}`,
                      isSelected ? "is-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <label
                      className="media-catalog-card-select"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(key)}
                        aria-label={`Seleccionar ${displayName(item)}`}
                      />
                    </label>
                    <button
                      type="button"
                      className="media-catalog-card-open"
                      onClick={() => setLightbox(item)}
                    >
                      {density !== "list" && (
                        <div className="media-catalog-card-media">
                          {item.kind === "picture" ? (
                            <MediaPreview
                              kind="picture"
                              id={item.id}
                              title={displayName(item)}
                              thumb
                            />
                          ) : (
                            <div className="media-catalog-video-placeholder">
                              ▶ Vídeo
                            </div>
                          )}
                        </div>
                      )}
                      <div className="media-catalog-card-meta">
                        <strong title={displayName(item)}>
                          {displayName(item)}
                        </strong>
                        <span>{kindLabel(item.kind)}</span>
                        {item.date ? <span>{item.date}</span> : null}
                        {(item.summary || item.location_guess) && (
                          <span>
                            {item.summary
                              ? item.summary.length > 60
                                ? `${item.summary.slice(0, 60)}…`
                                : item.summary
                              : ""}
                            {item.location_guess
                              ? `${item.summary ? " · " : ""}${item.location_guess}`
                              : ""}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {lightbox && (
        <div
          className="media-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={displayName(lightbox)}
          onClick={() => setLightbox(null)}
        >
          <div
            className="media-lightbox-inner"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="media-lightbox-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={isDownloading}
                onClick={() => {
                  void (async () => {
                    try {
                      await downloadItem(lightbox);
                      toast.success("Fitxer descarregat");
                    } catch (err) {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : "No s'ha pogut descarregar el fitxer.",
                      );
                    }
                  })();
                }}
              >
                Descarregar
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setLightbox(null)}
              >
                Tancar
              </button>
            </div>
            <MediaPreview
              kind={lightbox.kind}
              id={lightbox.id}
              title={displayName(lightbox)}
            />
            <p
              style={{
                margin: 0,
                color: "#fff",
                textAlign: "center",
                fontSize: "0.875rem",
              }}
            >
              {kindLabel(lightbox.kind)} · {displayName(lightbox)}
              {lightbox.location_guess ? ` · ${lightbox.location_guess}` : ""}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
