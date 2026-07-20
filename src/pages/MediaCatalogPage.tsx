import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  buildHeaders,
  listPictures,
  listVideos,
  pictureFileUrl,
  throwIfNotOk,
  videoFileUrl,
} from "@/api/client";
import { MediaPreview } from "@/components/MediaPreview";
import { PageHeader } from "@/components/PageHeader";
import { DOCUMENT_STATUS_OK } from "@/constants/globals";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { MediaKind, MediaOwnerType, PictureOut, VideoOut } from "@/api/types";

type CatalogItem = (PictureOut | VideoOut) & { kind: MediaKind };

function displayName(item: CatalogItem): string {
  return item.proposed_name ?? item.original_name ?? item.name ?? "—";
}

export function MediaCatalogPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | MediaOwnerType>("");
  const debouncedSearch = useDebouncedValue(search);

  const [lightbox, setLightbox] = useState<CatalogItem | null>(null);

  const filters = {
    status: DOCUMENT_STATUS_OK,
    q: debouncedSearch || undefined,
    type: typeFilter || undefined,
    limit: 50,
  };

  const picturesQuery = useQuery({
    queryKey: ["pictures", DOCUMENT_STATUS_OK, debouncedSearch, typeFilter],
    queryFn: () => listPictures(filters),
  });

  const videosQuery = useQuery({
    queryKey: ["videos", DOCUMENT_STATUS_OK, debouncedSearch, typeFilter],
    queryFn: () => listVideos(filters),
  });

  const items: CatalogItem[] = useMemo(() => {
    const pictures = (picturesQuery.data?.items ?? []).map((p) => ({
      ...p,
      kind: "picture" as const,
    }));
    const videos = (videosQuery.data?.items ?? []).map((v) => ({
      ...v,
      kind: "video" as const,
    }));
    return [...pictures, ...videos].sort((a, b) => {
      const da = a.date ?? "";
      const db = b.date ?? "";
      if (da !== db) return db.localeCompare(da);
      return displayName(a).localeCompare(displayName(b));
    });
  }, [picturesQuery.data?.items, videosQuery.data?.items]);

  const isLoading = picturesQuery.isLoading || videosQuery.isLoading;
  const total =
    (picturesQuery.data?.total ?? 0) + (videosQuery.data?.total ?? 0);

  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  async function downloadItem(item: CatalogItem) {
    const url =
      item.kind === "picture"
        ? pictureFileUrl(item.id)
        : videoFileUrl(item.id);
    const res = await fetch(url, { headers: buildHeaders() });
    try {
      await throwIfNotOk(res);
    } catch {
      return;
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = displayName(item);
    a.click();
    URL.revokeObjectURL(objectUrl);
  }

  return (
    <>
      <PageHeader
        title="Catàleg de mitjans"
        description="Fotos i vídeos aprovats. Filtreu per tipus o cerqueu, i obriu a pantalla completa."
      />

      <div className="card">
        <div className="toolbar-row">
          <input
            type="search"
            placeholder="Cerca per nom, resum o lloc…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as "" | MediaOwnerType)
            }
            aria-label="Filtrar per tipus"
          >
            <option value="">Tots els tipus</option>
            <option value="EMPRESA">EMPRESA</option>
            <option value="FAMILIA">FAMILIA</option>
          </select>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              picturesQuery.refetch();
              videosQuery.refetch();
            }}
          >
            Actualitzar
          </button>
        </div>

        {isLoading && <p className="empty-state">Carregant…</p>}

        {!isLoading && items.length === 0 && (
          <p className="empty-state">
            No hi ha mitjans aprovats
            {typeFilter || debouncedSearch ? " amb aquests filtres" : ""}.
          </p>
        )}

        {!isLoading && items.length > 0 && (
          <>
            <p
              style={{
                margin: "0 0 1rem",
                fontSize: "0.8125rem",
                color: "var(--color-text-secondary)",
              }}
            >
              Mostrant {items.length}
              {total > items.length ? ` de ${total}` : ""} fitxers
            </p>
            <div className="media-catalog-grid">
              {items.map((item) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  className="media-catalog-card"
                  onClick={() => setLightbox(item)}
                >
                  {item.kind === "picture" ? (
                    <MediaPreview
                      kind="picture"
                      id={item.id}
                      title={displayName(item)}
                      thumb
                    />
                  ) : (
                    <div
                      className="media-preview-shell media-preview-shell--thumb"
                      style={{ width: "100%", height: "auto", aspectRatio: "1" }}
                    >
                      <span
                        style={{
                          fontSize: "0.8125rem",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        ▶ Vídeo
                      </span>
                    </div>
                  )}
                  <div className="media-catalog-card-meta">
                    <strong title={displayName(item)}>{displayName(item)}</strong>
                    <span>
                      <span className="media-type-badge">{item.type}</span>
                      {item.date ? ` · ${item.date}` : ""}
                    </span>
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
              ))}
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
                onClick={() => downloadItem(lightbox)}
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
              {displayName(lightbox)}
              {lightbox.location_guess ? ` · ${lightbox.location_guess}` : ""}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
