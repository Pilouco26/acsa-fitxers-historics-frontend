import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ApiError,
  deletePicture,
  deleteVideo,
  guessMediaRoute,
  listFolders,
  listPictures,
  listVideos,
  routeMedia,
  startMediaAnalyzeJob,
  updatePicture,
  updateVideo,
} from "@/api/client";
import { FilterAutocompleteInput } from "@/components/FilterAutocompleteInput";
import {
  MediaPreview,
  releaseMediaPreview,
} from "@/components/MediaPreview";
import { AppDialog } from "@/components/AppDialog";
import { PanelEmptyActions, PanelSkeletonList } from "@/components/PanelStatus";
import { TablePagination } from "@/components/TablePagination";
import {
  FOLDER_ROOT_ARCHIVE,
  FOLDER_ROOT_MEDIA,
} from "@/constants/folders";
import {
  DOCUMENT_LIST_PAGE_SIZE,
  DOCUMENT_STATUS_REVISIO,
} from "@/constants/globals";
import { useAuth } from "@/contexts/AuthContext";
import type { MediaKind, PictureOut, VideoOut } from "@/api/types";
import { buildArchiveFolderSuggestions } from "@/utils/folderSuggestions";
import {
  applyListPanelFit,
  clearListPanelFit,
  fitListPanelLayout,
  measureListPanelChrome,
} from "@/utils/listPanelLayout";
import { onRowKeyActivate } from "@/utils/rowActivation";

const MEDIA_QUARANTINE_FOLDER = "_PENDENTS";
const MEDIA_LIST_LIMIT = 200;

type MediaItem = (PictureOut | VideoOut) & { kind: MediaKind };

type SelectedMedia = {
  kind: MediaKind;
  item: PictureOut | VideoOut;
};

type EditSnapshot = {
  name: string;
  folder: string;
  suggestedFolder: string;
  date: string;
  summary: string;
  location: string;
};

function displayName(item: PictureOut | VideoOut): string {
  return item.proposed_name ?? item.original_name ?? item.name ?? "—";
}

function shortText(value: string | null | undefined, max = 80): string {
  if (!value?.trim()) return "—";
  const t = value.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function kindLabel(kind: MediaKind): string {
  return kind === "video" ? "Vídeo" : "Foto";
}

function mediaFolder(item: PictureOut | VideoOut): string {
  return (item.folder ?? item.company_folder ?? "").trim();
}

function foldersMatch(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("ca") === b.trim().toLocaleLowerCase("ca");
}

export function MediaReviewPanel() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const pageActive = location.pathname === "/revisio";
  const wasPageActiveRef = useRef(pageActive);
  const { apiMode, isAdmin } = useAuth();
  const [selected, setSelected] = useState<SelectedMedia | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const selectedKeyRef = useRef<string | null>(null);
  const listCardRef = useRef<HTMLDivElement>(null);
  const tableAreaRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DOCUMENT_LIST_PAGE_SIZE);

  const [editName, setEditName] = useState("");
  const [editFolder, setEditFolder] = useState("");
  const [suggestedFolder, setSuggestedFolder] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingNewFolder, setPendingNewFolder] = useState<string | null>(null);
  const [pendingDiscard, setPendingDiscard] = useState(false);

  const picturesQuery = useQuery({
    queryKey: ["pictures", DOCUMENT_STATUS_REVISIO],
    queryFn: () =>
      listPictures({ status: DOCUMENT_STATUS_REVISIO, limit: MEDIA_LIST_LIMIT }),
  });

  const videosQuery = useQuery({
    queryKey: ["videos", DOCUMENT_STATUS_REVISIO],
    queryFn: () =>
      listVideos({ status: DOCUMENT_STATUS_REVISIO, limit: MEDIA_LIST_LIMIT }),
  });

  useEffect(() => {
    const becameActive = pageActive && !wasPageActiveRef.current;
    wasPageActiveRef.current = pageActive;
    if (!becameActive) return;
    void picturesQuery.refetch();
    void videosQuery.refetch();
  }, [pageActive, picturesQuery.refetch, videosQuery.refetch]);

  const archiveFoldersQuery = useQuery({
    queryKey: ["folders", FOLDER_ROOT_ARCHIVE, apiMode ?? "ALL"],
    queryFn: () =>
      listFolders({
        root: FOLDER_ROOT_ARCHIVE,
        ...(apiMode ? { mode: apiMode } : {}),
      }),
    staleTime: 5 * 60 * 1000,
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

  const folderSuggestions = useMemo(
    () =>
      buildArchiveFolderSuggestions({
        archiveFolderNames: [
          ...(archiveFoldersQuery.data?.items.map((f) => f.name) ?? []),
          ...(mediaFoldersQuery.data?.items.map((f) => f.name) ?? []),
        ].filter((name) => name !== MEDIA_QUARANTINE_FOLDER),
        currentFolder: editFolder,
      }),
    [
      archiveFoldersQuery.data?.items,
      mediaFoldersQuery.data?.items,
      editFolder,
    ],
  );

  const items: MediaItem[] = useMemo(() => {
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

  const total =
    (picturesQuery.data?.total ?? 0) + (videosQuery.data?.total ?? 0);
  const isLoading = picturesQuery.isLoading || videosQuery.isLoading;
  const isFetching = picturesQuery.isFetching || videosQuery.isFetching;
  const listError =
    picturesQuery.isError || videosQuery.isError
      ? picturesQuery.error instanceof ApiError
        ? picturesQuery.error.message
        : videosQuery.error instanceof ApiError
          ? videosQuery.error.message
          : "Error en carregar els mitjans pendents de revisió."
      : null;

  const pageItems = useMemo(
    () => items.slice(page * pageSize, page * pageSize + pageSize),
    [items, page, pageSize],
  );
  const emptyRows = Math.max(0, pageSize - pageItems.length);
  const detailVisible = Boolean(selected && detailOpen);
  const selectedItem = selected?.item ?? null;
  const selectedKind = selected?.kind ?? "picture";

  useEffect(() => {
    if (detailVisible) return;

    const cardEl = listCardRef.current;
    const tableEl = tableAreaRef.current;
    if (!cardEl || !tableEl) return;

    const compute = () => {
      window.requestAnimationFrame(() => {
        const available =
          cardEl.getBoundingClientRect().height -
          measureListPanelChrome(cardEl, tableEl);
        const fit = fitListPanelLayout(available);
        applyListPanelFit(tableEl, fit);
        setPageSize((prev) => (prev === fit.pageSize ? prev : fit.pageSize));
      });
    };

    const raf = window.requestAnimationFrame(() => compute());
    const ro = new ResizeObserver(() => compute());
    ro.observe(cardEl);

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      clearListPanelFit(tableEl);
    };
  }, [detailVisible, isLoading, isFetching]);

  useEffect(() => {
    if (items.length <= 0) return;
    const maxPage = Math.max(0, Math.ceil(items.length / pageSize) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [items.length, page, pageSize]);

  function restoreDetail(sel: SelectedMedia, edits: EditSnapshot) {
    selectedKeyRef.current = `${sel.kind}:${sel.item.id}`;
    setSelected(sel);
    setEditName(edits.name);
    setEditFolder(edits.folder);
    setSuggestedFolder(edits.suggestedFolder);
    setEditDate(edits.date);
    setEditSummary(edits.summary);
    setEditLocation(edits.location);
    setDetailOpen(true);
  }

  function selectItem(item: MediaItem) {
    const key = `${item.kind}:${item.id}`;
    selectedKeyRef.current = key;
    setSelected({ kind: item.kind, item });
    setEditName(item.proposed_name ?? "");
    const current = mediaFolder(item);
    const initialFolder = current === MEDIA_QUARANTINE_FOLDER ? "" : current;
    setEditFolder(initialFolder);
    setSuggestedFolder("");
    setEditDate(item.date ?? "");
    setEditSummary(item.summary ?? "");
    setEditLocation(item.location_guess ?? "");
    setDetailOpen(true);
    setError(null);

    if (!initialFolder) {
      void guessMediaRoute(item.id, item.kind)
        .then((guess) => {
          if (selectedKeyRef.current !== key) return;
          const folder = guess.dest_folder?.trim();
          if (!folder || folder === MEDIA_QUARANTINE_FOLDER) return;
          setSuggestedFolder(folder);
          setEditFolder((prev) => (prev.trim() ? prev : folder));
        })
        .catch(() => {
          /* optional prefill */
        });
    }
  }

  function invalidateMediaQueries() {
    queryClient.invalidateQueries({ queryKey: ["pictures"] });
    queryClient.invalidateQueries({ queryKey: ["videos"] });
    queryClient.invalidateQueries({ queryKey: ["revisio-count"] });
    queryClient.invalidateQueries({ queryKey: ["folders", FOLDER_ROOT_MEDIA] });
  }

  const patchBody = () => ({
    proposed_name: editName || null,
    date: editDate || null,
    summary: editSummary || null,
    location_guess: editLocation || null,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("No selection");
      const body = patchBody();
      return selected.kind === "video"
        ? updateVideo(selected.item.id, body)
        : updatePicture(selected.item.id, body);
    },
    onSuccess: (updated) => {
      invalidateMediaQueries();
      setSelected((prev) =>
        prev ? { kind: prev.kind, item: updated } : null,
      );
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Error en desar");
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({
      sel,
      body,
      destFolder,
      useGuess,
    }: {
      sel: SelectedMedia;
      body: ReturnType<typeof patchBody>;
      destFolder?: string;
      useGuess: boolean;
    }) => {
      if (sel.kind === "video") {
        await updateVideo(sel.item.id, body);
      } else {
        await updatePicture(sel.item.id, body);
      }

      if (useGuess) {
        await guessMediaRoute(sel.item.id, sel.kind);
        await routeMedia(sel.item.id, sel.kind, { dry_run: false });
        return;
      }

      await routeMedia(sel.item.id, sel.kind, {
        dest_folder: destFolder,
        dry_run: false,
      });
    },
    onSuccess: () => {
      invalidateMediaQueries();
      selectedKeyRef.current = null;
      setSelected(null);
      setDetailOpen(false);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Error en aprovar");
    },
  });

  const retryMutation = useMutation({
    mutationFn: (sel: SelectedMedia) => {
      if (isAdmin && !apiMode) {
        return Promise.reject(
          new ApiError(
            400,
            "Trieu Personal o Empresa al selector de mode abans d'analitzar.",
          ),
        );
      }
      return startMediaAnalyzeJob({
        source: "media",
        require_review: true,
        dry_run: false,
        ...(apiMode ? { mode: apiMode } : {}),
        ...(sel.kind === "video"
          ? { video_ids: [sel.item.id] }
          : { picture_ids: [sel.item.id] }),
      });
    },
    onSuccess: () => {
      setError(null);
      invalidateMediaQueries();
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? err.message
          : "Error en tornar a analitzar",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (sel: SelectedMedia) =>
      sel.kind === "video"
        ? deleteVideo(sel.item.id)
        : deletePicture(sel.item.id),
    onSuccess: () => {
      invalidateMediaQueries();
      selectedKeyRef.current = null;
      setSelected(null);
      setDetailOpen(false);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Error en descartar");
    },
  });

  async function forceCloseMediaPreview(sel: SelectedMedia): Promise<void> {
    // Abort fetch, clear img/video src, and revoke blob URL before React unmounts.
    await releaseMediaPreview(sel.kind, sel.item.id);

    flushSync(() => {
      setDetailOpen(false);
      setSelected(null);
    });

    // Catch any preview still registered after unmount (useLayoutEffect cleanup).
    await releaseMediaPreview(sel.kind, sel.item.id);
  }

  async function runApprove(useGuess: boolean, destFolder: string) {
    if (!selected) return;

    const sel = selected;
    const edits: EditSnapshot = {
      name: editName,
      folder: editFolder,
      suggestedFolder,
      date: editDate,
      summary: editSummary,
      location: editLocation,
    };
    const body = patchBody();
    setError(null);
    setPendingNewFolder(null);

    try {
      await forceCloseMediaPreview(sel);
      await approveMutation.mutateAsync({
        sel,
        body,
        destFolder: useGuess ? undefined : destFolder,
        useGuess,
      });
    } catch (err) {
      restoreDetail(sel, edits);
      if (!(err instanceof ApiError)) {
        setError("Error en aprovar");
      }
    }
  }

  async function handleApprove() {
    if (!selected) return;

    const destFolder = editFolder.trim();
    if (destFolder === MEDIA_QUARANTINE_FOLDER) {
      setError("Trieu una carpeta definitiva; no es pot aprovar a _PENDENTS.");
      return;
    }

    const useGuess =
      !destFolder ||
      (suggestedFolder !== "" && foldersMatch(destFolder, suggestedFolder));

    if (!useGuess && folderSuggestions.length > 0) {
      const destKey = destFolder.toLocaleLowerCase("ca");
      const isExistingFolder = folderSuggestions.some(
        (folder) => folder.toLocaleLowerCase("ca") === destKey,
      );
      if (!isExistingFolder) {
        setPendingNewFolder(destFolder);
        return;
      }
    }

    await runApprove(useGuess, destFolder);
  }

  async function handleDiscard() {
    if (!selected) return;
    setPendingDiscard(true);
  }

  async function confirmDiscard() {
    if (!selected) return;
    const sel = selected;
    const edits: EditSnapshot = {
      name: editName,
      folder: editFolder,
      suggestedFolder,
      date: editDate,
      summary: editSummary,
      location: editLocation,
    };

    setPendingDiscard(false);
    setError(null);
    try {
      await forceCloseMediaPreview(sel);
      await deleteMutation.mutateAsync(sel);
    } catch (err) {
      restoreDetail(sel, edits);
      if (!(err instanceof ApiError)) {
        setError("Error en descartar");
      }
    }
  }

  function refetch() {
    picturesQuery.refetch();
    videosQuery.refetch();
  }

  const splitClassName = [
    "split-view",
    !detailVisible && "split-view--auto",
    !detailVisible && "split-view--collapsed",
    detailVisible && "split-view--detail-open",
  ]
    .filter(Boolean)
    .join(" ");

  const isLoadingEmpty =
    isLoading || (isFetching && items.length === 0 && !listError);
  const isEmpty = !isLoadingEmpty && !listError && items.length === 0;
  const isTruncated = !isEmpty && items.length < total;
  const willUseGuess =
    !editFolder.trim() ||
    (suggestedFolder !== "" &&
      foldersMatch(editFolder.trim(), suggestedFolder));
  const guessHint = willUseGuess
    ? suggestedFolder
      ? `En aprovar se suggereix i mou a «${suggestedFolder}» (carpeta calculada).`
      : "En aprovar es calcularà la carpeta de destinació automàticament."
    : `En aprovar es mourà explícitament a «${editFolder.trim()}».`;

  return (
    <>
      {(error || listError) && (
        <div className="alert alert-error">{error ?? listError}</div>
      )}

      <div className={splitClassName}>
        {!detailVisible && (
          <div ref={listCardRef} className="card card-panel">
            <h3 className="card-title">
              Pendents de revisió
            </h3>

            {isLoadingEmpty ? (
              <PanelSkeletonList rows={pageSize} />
            ) : listError ? (
              <PanelEmptyActions
                title="No s'han pogut carregar els mitjans."
                role="alert"
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => refetch()}
                >
                  Tornar-ho a provar
                </button>
              </PanelEmptyActions>
            ) : isEmpty ? (
              <PanelEmptyActions title="No hi ha fotos ni vídeos pendents de revisió.">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate("/documents")}
                >
                  Continuar a classificats
                </button>
              </PanelEmptyActions>
            ) : (
              <>
                {isTruncated && (
                  <p className="scan-hint" role="status">
                    Mostrant els primers {items.length} de {total} pendents.
                  </p>
                )}

                <div
                  ref={tableAreaRef}
                  className="table-responsive table-responsive--no-scroll table-list-body"
                >
                  <table
                    className="data-table data-table--list"
                    style={{ "--page-size": pageSize } as CSSProperties}
                  >
                    <thead>
                      <tr>
                        <th>Tipus</th>
                        <th>Original</th>
                        <th>Proposat</th>
                        <th>Data</th>
                        <th>Conf.</th>
                        <th>Escena / lloc</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((item) => (
                        <tr
                          key={`${item.kind}-${item.id}`}
                          className={
                            selected?.kind === item.kind &&
                            selectedItem?.id === item.id
                              ? "selected"
                              : undefined
                          }
                          tabIndex={0}
                          onClick={() => selectItem(item)}
                          onKeyDown={(e) =>
                            onRowKeyActivate(e, () => selectItem(item))
                          }
                        >
                          <td>{kindLabel(item.kind)}</td>
                          <td>{item.original_name ?? "—"}</td>
                          <td>{item.proposed_name ?? "—"}</td>
                          <td>{item.date ?? "—"}</td>
                          <td>{item.overall_conf ?? "—"}</td>
                          <td>
                            {shortText(item.summary, 40)}
                            {item.location_guess
                              ? ` · ${shortText(item.location_guess, 30)}`
                              : ""}
                          </td>
                        </tr>
                      ))}
                      {emptyRows > 0 &&
                        Array.from({ length: emptyRows }).map((_, idx) => (
                          <tr
                            key={`empty-${idx}`}
                            className="data-table-row--empty"
                            aria-hidden="true"
                          >
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {!isLoading && !isFetching && (
                  <TablePagination
                    page={page}
                    pageSize={pageSize}
                    total={items.length}
                    onPageChange={setPage}
                  />
                )}
              </>
            )}
          </div>
        )}

        {detailVisible && (
          <button
            type="button"
            className="split-detail-toggle"
            onClick={() => {
              selectedKeyRef.current = null;
              setDetailOpen(false);
              setSelected(null);
            }}
            aria-expanded={detailVisible}
            aria-label="Tancar panell"
          >
            ◀
          </button>
        )}

        {detailVisible && selectedItem && selected && (
          <>
            <div className="card card-panel split-detail-edit">
              <h3 className="card-title">Editar mitjà</h3>

              <div className="field">
                <label>Tipus</label>
                <p className="split-detail-summary">
                  {kindLabel(selected.kind)}
                </p>
              </div>

              <div className="field">
                <label>Original</label>
                <p className="split-detail-summary">
                  {selectedItem.original_name ?? "—"}
                </p>
              </div>

              <div className="field">
                <label htmlFor="media-name">Nom proposat</label>
                <input
                  id="media-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              <FilterAutocompleteInput
                id="media-folder"
                label="Carpeta"
                placeholder="Carpeta de destinació"
                value={editFolder}
                suggestions={folderSuggestions}
                onChange={setEditFolder}
                disabled={
                  saveMutation.isPending ||
                  approveMutation.isPending ||
                  deleteMutation.isPending
                }
                maxSuggestions={0}
              />

              <p className="scan-hint" role="note">
                {guessHint}
              </p>

              <div className="field">
                <label htmlFor="media-date">Data</label>
                <input
                  id="media-date"
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="media-summary">Què passa (resum)</label>
                <textarea
                  id="media-summary"
                  rows={4}
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="media-location">On (ubicació)</label>
                <input
                  id="media-location"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                />
              </div>

              {selectedItem.overall_conf && (
                <p className="scan-hint">
                  Confiança: <strong>{selectedItem.overall_conf}</strong>
                </p>
              )}

              {selectedItem.status === "error" && (
                <div className="alert alert-error">
                  <p className="m-0">
                    {selectedItem.error?.trim() ||
                      "Aquest element ha fallat a l'anàlisi."}
                  </p>
                  <p className="mt-2 m-0">
                    Torneu a executar l&apos;anàlisi per aquest id.
                  </p>
                  <div className="btn-row btn-row--followup">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={retryMutation.isPending}
                      onClick={() => retryMutation.mutate(selected)}
                    >
                      Tornar a analitzar
                    </button>
                  </div>
                </div>
              )}

              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={
                    saveMutation.isPending ||
                    approveMutation.isPending ||
                    deleteMutation.isPending
                  }
                  onClick={() => saveMutation.mutate()}
                >
                  Desar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    saveMutation.isPending ||
                    approveMutation.isPending ||
                    deleteMutation.isPending
                  }
                  onClick={() => void handleApprove()}
                >
                  Aprovar
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={
                    saveMutation.isPending ||
                    approveMutation.isPending ||
                    deleteMutation.isPending
                  }
                  onClick={() => void handleDiscard()}
                  title="Descartar mitjà"
                >
                  {deleteMutation.isPending ? "Descartant…" : "Descartar"}
                </button>
              </div>
            </div>

            <div className="card card-panel split-detail-preview">
              <h3 className="card-title">{displayName(selectedItem)}</h3>
              <MediaPreview
                kind={selectedKind}
                id={selectedItem.id}
                filePath={selectedItem.relative_path}
                title={displayName(selectedItem)}
              />
            </div>
          </>
        )}
      </div>

      <AppDialog
        open={pendingNewFolder != null}
        title="Crear carpeta nova?"
        onClose={() => setPendingNewFolder(null)}
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPendingNewFolder(null)}
            >
              Cancel·lar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (pendingNewFolder) {
                  void runApprove(false, pendingNewFolder);
                }
              }}
            >
              Crear i moure
            </button>
          </>
        }
      >
        <p>
          Aquesta carpeta no existeix a la llista. Voleu crear-la i moure el
          mitjà a «{pendingNewFolder}»?
        </p>
      </AppDialog>

      <AppDialog
        open={pendingDiscard}
        title="Descartar mitjà?"
        onClose={() => setPendingDiscard(false)}
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPendingDiscard(false)}
            >
              Cancel·lar
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void confirmDiscard()}
            >
              Descartar
            </button>
          </>
        }
      >
        <p>
          Segur que voleu descartar «
          {selected ? displayName(selected.item) : ""}»? S&apos;eliminarà del
          pendent de revisió.
        </p>
      </AppDialog>
    </>
  );
}
