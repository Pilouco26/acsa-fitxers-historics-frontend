import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  buildHeaders,
  deletePicture,
  deleteVideo,
  listFolders,
  listPictures,
  listVideos,
  movePicture,
  moveVideo,
  pictureFileUrl,
  throwIfNotOk,
  updatePicture,
  updateVideo,
  videoFileUrl,
} from "@/api/client";
import { FilterAutocompleteInput } from "@/components/FilterAutocompleteInput";
import { MediaPreview } from "@/components/MediaPreview";
import { HubBackButton } from "@/components/HubBackButton";
import { FOLDER_ROOT_MEDIA } from "@/constants/folders";
import { DOCUMENT_STATUS_OK } from "@/constants/globals";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { MediaKind, PictureOut, VideoOut } from "@/api/types";
import { buildArchiveFolderSuggestions } from "@/utils/folderSuggestions";
import { buildZipStoreBlob } from "@/utils/zipStore";
import { useAuth } from "@/contexts/AuthContext";

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

function mediaFolder(item: PictureOut | VideoOut): string {
  return (item.folder ?? item.company_folder ?? "").trim();
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
  /** Leave catalog and return to Classificats / folder pick. */
  onBackToHub: () => void;
  hubBackLabel?: string;
};

/** Approved photos and/or videos catalog. */
export function MediaCatalogPanel({
  kind = "all",
  folder = null,
  onBackToHub,
  hubBackLabel = "Tornar a Classificats",
}: MediaCatalogPanelProps) {
  const queryClient = useQueryClient();
  const { apiMode } = useAuth();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [density, setDensity] = useState<CatalogDensity>("large");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [isDownloading, setIsDownloading] = useState(false);

  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editFolder, setEditFolder] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [lightbox, setLightbox] = useState<CatalogItem | null>(null);

  const folderFilter = folder?.trim() || undefined;
  const detailVisible = Boolean(selected && detailOpen);

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

  const mediaFoldersQuery = useQuery({
    queryKey: ["folders", FOLDER_ROOT_MEDIA, apiMode ?? "ALL"],
    queryFn: () =>
      listFolders({
        root: FOLDER_ROOT_MEDIA,
        ...(apiMode ? { mode: apiMode } : {}),
      }),
    staleTime: 5 * 60 * 1000,
  });

  const existingFolderSuggestions = useMemo(
    () => mediaFoldersQuery.data?.items.map((f) => f.name) ?? [],
    [mediaFoldersQuery.data?.items],
  );

  const folderSuggestions = useMemo(
    () =>
      buildArchiveFolderSuggestions({
        archiveFolderNames: existingFolderSuggestions,
        currentFolder: editFolder,
      }),
    [existingFolderSuggestions, editFolder],
  );

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
    if (!selected) return;
    const fresh = items.find(
      (item) => item.kind === selected.kind && item.id === selected.id,
    );
    if (fresh) setSelected(fresh);
  }, [items, selected?.kind, selected?.id]);

  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  function openDetail(item: CatalogItem) {
    setSelected(item);
    setEditName(displayName(item) === "—" ? "" : displayName(item));
    setEditFolder(mediaFolder(item));
    setEditSummary(item.summary ?? "");
    setDetailOpen(true);
    setLightbox(null);
  }

  function closeDetail() {
    setDetailOpen(false);
    setSelected(null);
  }

  function invalidateMedia() {
    queryClient.invalidateQueries({ queryKey: ["pictures"] });
    queryClient.invalidateQueries({ queryKey: ["videos"] });
    queryClient.invalidateQueries({ queryKey: ["folders", FOLDER_ROOT_MEDIA] });
  }

  const updateMutation = useMutation({
    mutationFn: async (body: {
      proposed_name?: string | null;
      summary?: string | null;
    }) => {
      if (!selected) throw new Error("No selection");
      return selected.kind === "picture"
        ? updatePicture(selected.id, body)
        : updateVideo(selected.id, body);
    },
    onSuccess: (updated) => {
      invalidateMedia();
      setSelected((prev) =>
        prev ? { ...updated, kind: prev.kind } : prev,
      );
      setEditName(
        updated.proposed_name ?? updated.original_name ?? updated.name ?? "",
      );
      setEditSummary(updated.summary ?? "");
    },
  });

  const moveMutation = useMutation({
    mutationFn: async (destFolder: string) => {
      if (!selected) throw new Error("No selection");
      const body = {
        dest_folder: destFolder,
        dest_name: null as string | null,
        dry_run: false,
      };
      return selected.kind === "picture"
        ? movePicture(selected.id, body)
        : moveVideo(selected.id, body);
    },
    onSuccess: (_result, destFolder) => {
      invalidateMedia();
      setSelected((prev) =>
        prev
          ? { ...prev, folder: destFolder, company_folder: destFolder }
          : prev,
      );
      setEditFolder(destFolder);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No selection");
      if (selected.kind === "picture") await deletePicture(selected.id);
      else await deleteVideo(selected.id);
    },
    onSuccess: () => {
      invalidateMedia();
      closeDetail();
    },
  });

  const isSaving =
    updateMutation.isPending ||
    moveMutation.isPending ||
    deleteMutation.isPending;

  function saveName() {
    if (!selected) return;
    const current = displayName(selected) === "—" ? "" : displayName(selected);
    if (editName === current) return;
    updateMutation.mutate({ proposed_name: editName });
  }

  function saveSummary() {
    if (!selected) return;
    const current = selected.summary ?? "";
    if (editSummary === current) return;
    updateMutation.mutate({ summary: editSummary });
  }

  function saveFolder(nextFolder?: string) {
    if (!selected) return;
    const destFolder = (nextFolder ?? editFolder).trim();
    if (!destFolder) return;
    const current = mediaFolder(selected);
    if (destFolder === current) return;

    if (existingFolderSuggestions.length > 0) {
      const destKey = destFolder.toLocaleLowerCase("ca");
      const isExisting = existingFolderSuggestions.some(
        (name) => name.toLocaleLowerCase("ca") === destKey,
      );
      if (!isExisting) {
        const ok = window.confirm(
          `Aquesta carpeta no existeix a la llista.\n\nVoleu crear-la i moure el fitxer a: "${destFolder}"?`,
        );
        if (!ok) {
          setEditFolder(current);
          return;
        }
      }
    }

    moveMutation.mutate(destFolder);
  }

  function handleDelete() {
    if (!selected) return;
    const label = displayName(selected);
    const ok = window.confirm(
      `Segur que voleu eliminar "${label}"? Aquesta acció no es pot desfer des d'aquí.`,
    );
    if (!ok) return;
    deleteMutation.mutate();
  }

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

  async function fetchItemBlob(item: CatalogItem): Promise<Blob> {
    const url =
      item.kind === "picture"
        ? pictureFileUrl(item.id)
        : videoFileUrl(item.id);
    const res = await fetch(url, {
      headers: buildHeaders({ Accept: "*/*" }),
    });
    await throwIfNotOk(res);
    return res.blob();
  }

  function triggerBlobDownload(blob: Blob, filename: string) {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
  }

  async function downloadItem(item: CatalogItem) {
    const blob = await fetchItemBlob(item);
    triggerBlobDownload(
      blob,
      sanitizeFilename(displayName(item)) || "fitxer",
    );
  }

  function uniqueZipEntryName(baseName: string, used: Set<string>): string {
    let name = sanitizeFilename(baseName) || "fitxer";
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let n = 2;
    while (used.has(`${stem} (${n})${ext}`)) n += 1;
    name = `${stem} (${n})${ext}`;
    used.add(name);
    return name;
  }

  async function downloadSelected() {
    if (selectedItems.length === 0 || isDownloading) return;
    setIsDownloading(true);
    try {
      if (selectedItems.length === 1) {
        await downloadItem(selectedItems[0]!);
        toast.success("Fitxer descarregat");
        return;
      }

      const usedNames = new Set<string>();
      const entries: { name: string; data: Uint8Array }[] = [];
      let failed = 0;

      for (const item of selectedItems) {
        try {
          const blob = await fetchItemBlob(item);
          const data = new Uint8Array(await blob.arrayBuffer());
          entries.push({
            name: uniqueZipEntryName(displayName(item), usedNames),
            data,
          });
        } catch {
          failed += 1;
        }
      }

      if (entries.length === 0) {
        toast.error("No s'han pogut descarregar els fitxers.");
        return;
      }

      const zipBlob = buildZipStoreBlob(entries);
      triggerBlobDownload(zipBlob, "mitjans.zip");

      if (failed === 0) {
        toast.success(`${entries.length} fitxers descarregats (ZIP)`);
      } else {
        toast.error(
          `S'han descarregat ${entries.length} de ${selectedItems.length} fitxers (ZIP).`,
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "No s'han pogut descarregar els fitxers.",
      );
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

  const splitClassName = [
    "split-view",
    !detailVisible && "split-view--auto",
    !detailVisible && "split-view--collapsed",
    detailVisible && "split-view--detail-open",
  ]
    .filter(Boolean)
    .join(" ");

  const editTitle =
    selected?.kind === "video" ? "Editar vídeo" : "Editar foto";

  return (
    <>
      <div className={splitClassName}>
        {!detailVisible && (
          <div className="panel-with-back">
            <HubBackButton onClick={onBackToHub} label={hubBackLabel} />
            <div className="card card-panel">
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
                        allVisibleSelected
                          ? clearSelection()
                          : selectAllVisible()
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
                    const isChecked = selectedKeys.has(key);
                    return (
                      <div
                        key={key}
                        className={[
                          "media-catalog-card",
                          `media-catalog-card--${density}`,
                          isChecked ? "is-selected" : "",
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
                            checked={isChecked}
                            onChange={() => toggleSelected(key)}
                            aria-label={`Seleccionar ${displayName(item)}`}
                          />
                        </label>
                        <button
                          type="button"
                          className="media-catalog-card-open"
                          onClick={() => openDetail(item)}
                        >
                          {density !== "list" && (
                            <div className="media-catalog-card-media">
                              <MediaPreview
                                kind={item.kind}
                                id={item.id}
                                filePath={item.relative_path}
                                title={displayName(item)}
                                thumb
                              />
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
          </div>
        )}

        {detailVisible && (
          <HubBackButton
            onClick={closeDetail}
            label="Tornar a la llista"
          />
        )}

        {detailVisible && selected && (
          <>
            <div className="card card-panel split-detail-edit">
              <h3 className="card-title">{editTitle}</h3>

              <div className="field">
                <label htmlFor="media-catalog-name">Nom</label>
                <input
                  id="media-catalog-name"
                  value={editName}
                  disabled={isSaving}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
              </div>

              <FilterAutocompleteInput
                id="media-catalog-folder"
                label="Carpeta"
                placeholder="Carpeta de mitjans"
                value={editFolder}
                suggestions={folderSuggestions}
                onChange={setEditFolder}
                disabled={isSaving}
                onCommitValue={(value) => saveFolder(value)}
                maxSuggestions={0}
              />

              <div className="field">
                <label htmlFor="media-catalog-summary">Resum</label>
                <textarea
                  id="media-catalog-summary"
                  rows={6}
                  value={editSummary}
                  disabled={isSaving}
                  onChange={(e) => setEditSummary(e.target.value)}
                  onBlur={saveSummary}
                />
              </div>

              <div
                className="toolbar-row"
                style={{ justifyContent: "flex-end", marginTop: "0.75rem" }}
              >
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={isSaving}
                  onClick={handleDelete}
                >
                  {deleteMutation.isPending ? "Eliminant…" : "Eliminar"}
                </button>
              </div>
            </div>

            <div className="card card-panel split-detail-preview">
              <div
                className="toolbar-row toolbar-row--detail-actions"
                style={{ marginBottom: 0 }}
              >
                <h3
                  className="card-title"
                  style={{ marginBottom: 0, flex: "1 1 auto" }}
                >
                  Vista prèvia
                </h3>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  title="Descarregar"
                  aria-label="Descarregar"
                  disabled={isDownloading || isSaving}
                  onClick={() => {
                    void (async () => {
                      try {
                        await downloadItem(selected);
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
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  title="Mida completa"
                  onClick={() => setLightbox(selected)}
                >
                  Mida completa
                </button>
              </div>
              <MediaPreview
                kind={selected.kind}
                id={selected.id}
                filePath={selected.relative_path}
                title={displayName(selected)}
              />
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
              filePath={lightbox.relative_path}
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
