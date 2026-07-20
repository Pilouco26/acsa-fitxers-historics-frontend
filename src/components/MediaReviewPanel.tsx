import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  listPictures,
  listVideos,
  startMediaAnalyzeJob,
  updatePicture,
  updateVideo,
} from "@/api/client";
import { MediaPreview } from "@/components/MediaPreview";
import { StatusBadge } from "@/components/StatusBadge";
import { DOCUMENT_STATUS_REVISIO } from "@/constants/globals";
import type { MediaOwnerType, PictureOut, VideoOut } from "@/api/types";

type MediaTab = "picture" | "video";
type MediaItem = PictureOut | VideoOut;

type SelectedMedia = {
  kind: MediaTab;
  item: MediaItem;
};

function displayName(item: MediaItem): string {
  return item.proposed_name ?? item.original_name ?? item.name ?? "—";
}

function shortText(value: string | null | undefined, max = 80): string {
  if (!value?.trim()) return "—";
  const t = value.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function MediaReviewPanel() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<MediaTab>("picture");
  const [selected, setSelected] = useState<SelectedMedia | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<MediaOwnerType>("EMPRESA");
  const [editDate, setEditDate] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [error, setError] = useState<string | null>(null);

  const picturesQuery = useQuery({
    queryKey: ["pictures", DOCUMENT_STATUS_REVISIO],
    queryFn: () =>
      listPictures({ status: DOCUMENT_STATUS_REVISIO, limit: 50 }),
    enabled: tab === "picture",
  });

  const videosQuery = useQuery({
    queryKey: ["videos", DOCUMENT_STATUS_REVISIO],
    queryFn: () => listVideos({ status: DOCUMENT_STATUS_REVISIO, limit: 50 }),
    enabled: tab === "video",
  });

  const items: MediaItem[] =
    tab === "picture"
      ? (picturesQuery.data?.items ?? [])
      : (videosQuery.data?.items ?? []);
  const total =
    tab === "picture"
      ? (picturesQuery.data?.total ?? 0)
      : (videosQuery.data?.total ?? 0);
  const isLoading =
    tab === "picture" ? picturesQuery.isLoading : videosQuery.isLoading;
  const isFetching =
    tab === "picture" ? picturesQuery.isFetching : videosQuery.isFetching;

  const detailVisible = Boolean(selected && detailOpen);
  const selectedItem = selected?.item ?? null;
  const selectedKind = selected?.kind ?? tab;

  function selectItem(item: MediaItem, kind: MediaTab) {
    setSelected({ kind, item });
    setEditName(item.proposed_name ?? "");
    setEditType(item.type ?? "EMPRESA");
    setEditDate(item.date ?? "");
    setEditSummary(item.summary ?? "");
    setEditLocation(item.location_guess ?? "");
    setDetailOpen(true);
    setError(null);
  }

  function selectTab(next: MediaTab) {
    if (next === tab) {
      if (next === "picture") void picturesQuery.refetch();
      else void videosQuery.refetch();
      return;
    }
    setTab(next);
  }

  useEffect(() => {
    setSelected(null);
    setDetailOpen(false);
  }, [tab]);

  function invalidateMediaQueries() {
    queryClient.invalidateQueries({ queryKey: ["pictures"] });
    queryClient.invalidateQueries({ queryKey: ["videos"] });
    queryClient.invalidateQueries({ queryKey: ["media-revisio-count"] });
  }

  const patchBody = (approve: boolean) => ({
    proposed_name: editName || null,
    type: editType,
    date: editDate || null,
    summary: editSummary || null,
    location_guess: editLocation || null,
    ...(approve ? { approve: true as const } : {}),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("No selection");
      const body = patchBody(false);
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
    mutationFn: () => {
      if (!selected) throw new Error("No selection");
      const body = patchBody(true);
      return selected.kind === "video"
        ? updateVideo(selected.item.id, body)
        : updatePicture(selected.item.id, body);
    },
    onSuccess: () => {
      invalidateMediaQueries();
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
      return startMediaAnalyzeJob({
        source: "media",
        require_review: true,
        dry_run: false,
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

  function refetch() {
    if (tab === "picture") picturesQuery.refetch();
    else videosQuery.refetch();
  }

  const splitClassName = [
    "split-view",
    !detailVisible && "split-view--auto",
    !detailVisible && "split-view--collapsed",
    detailVisible && "split-view--detail-open",
  ]
    .filter(Boolean)
    .join(" ");

  const emptyMessage =
    isLoading || (isFetching && items.length === 0)
      ? "Carregant…"
      : items.length === 0
        ? tab === "picture"
          ? "No hi ha imatges pendents de revisió."
          : "No hi ha vídeos pendents de revisió."
        : null;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      <div className={splitClassName}>
        {!detailVisible && (
          <div className="card card-panel">
            <h3 className="card-title">
              Pendents de revisió ({total})
            </h3>

            <div className="toolbar-row">
              <div
                className="segmented-control"
                role="tablist"
                aria-label="Tipus de mitjà"
                style={{ maxWidth: "16rem" }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "picture"}
                  className={tab === "picture" ? "active" : undefined}
                  onClick={() => selectTab("picture")}
                >
                  Imatges
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "video"}
                  className={tab === "video" ? "active" : undefined}
                  onClick={() => selectTab("video")}
                >
                  Vídeos
                </button>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => refetch()}
              >
                Actualitzar
              </button>
            </div>

            <div className="table-responsive">
              {emptyMessage && (
                <p className="empty-state" role="status">
                  {emptyMessage}
                </p>
              )}
              {!emptyMessage && (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Original</th>
                      <th>Proposat</th>
                      <th>Tipus</th>
                      <th>Data</th>
                      <th>Conf.</th>
                      <th>Escena / lloc</th>
                      <th>Estat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className={
                          selectedItem?.id === item.id ? "selected" : undefined
                        }
                        onClick={() => selectItem(item, tab)}
                        style={{ cursor: "pointer" }}
                      >
                        <td>{item.original_name ?? "—"}</td>
                        <td>{item.proposed_name ?? "—"}</td>
                        <td>
                          <span className="media-type-badge">{item.type}</span>
                        </td>
                        <td>{item.date ?? "—"}</td>
                        <td>{item.overall_conf ?? "—"}</td>
                        <td>
                          {shortText(item.summary, 40)}
                          {item.location_guess
                            ? ` · ${shortText(item.location_guess, 30)}`
                            : ""}
                        </td>
                        <td>
                          <StatusBadge status={item.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {detailVisible && (
          <button
            type="button"
            className="split-detail-toggle"
            onClick={() => {
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

              <div className="field">
                <label>Tipus</label>
                <div className="segmented-control" role="group">
                  <button
                    type="button"
                    className={editType === "EMPRESA" ? "active" : undefined}
                    onClick={() => setEditType("EMPRESA")}
                  >
                    EMPRESA
                  </button>
                  <button
                    type="button"
                    className={editType === "FAMILIA" ? "active" : undefined}
                    onClick={() => setEditType("FAMILIA")}
                  >
                    FAMILIA
                  </button>
                </div>
              </div>

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
                  <p style={{ margin: 0 }}>
                    {selectedItem.error?.trim() ||
                      "Aquest element ha fallat a l'anàlisi."}
                  </p>
                  <p style={{ margin: "0.5rem 0 0" }}>
                    Torneu a executar l&apos;anàlisi per aquest id.
                  </p>
                  <div className="btn-row" style={{ marginTop: "0.75rem" }}>
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
                  disabled={saveMutation.isPending || approveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                >
                  Desar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saveMutation.isPending || approveMutation.isPending}
                  onClick={() => approveMutation.mutate()}
                >
                  Aprovar
                </button>
              </div>
            </div>

            <div className="card card-panel split-detail-preview">
              <h3 className="card-title">{displayName(selectedItem)}</h3>
              <MediaPreview
                kind={selectedKind}
                id={selectedItem.id}
                title={displayName(selectedItem)}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}
