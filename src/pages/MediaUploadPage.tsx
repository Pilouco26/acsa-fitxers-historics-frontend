import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ApiError,
  cancelJob,
  deletePicture,
  deleteVideo,
  startMediaAnalyzeJob,
  uploadMediaBatch,
} from "@/api/client";
import { JobProgressPanel } from "@/components/JobProgressPanel";
import { MediaPreview } from "@/components/MediaPreview";
import { PageHeader } from "@/components/PageHeader";
import { useJobPolling, isJobTerminal } from "@/hooks/useJobPolling";
import type { JobOut, MediaOwnerType, MediaUploadOut } from "@/api/types";

const MEDIA_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm"]);

const UPLOAD_STEPS = [
  "Prepareu fotos (.jpg, .png, .webp) o vídeos (.mp4, .mov, .webm).",
  "Trieu FAMILIA o EMPRESA i arrossegueu els fitxers aquí.",
  "Premiu Analitzar per processar l'escena i la ubicació; després reviseu-los.",
] as const;

function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function isMediaFile(file: File): boolean {
  const ext = fileExt(file.name);
  return IMAGE_EXT.has(ext) || VIDEO_EXT.has(ext);
}

export function MediaUploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const navigatedForJobRef = useRef<string | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const [ownerType, setOwnerType] = useState<MediaOwnerType>("EMPRESA");
  const [uploaded, setUploaded] = useState<MediaUploadOut[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobOut | null>(null);

  useJobPolling(jobId, 2000, setJob);

  const busy = Boolean(jobId) && (!job || !isJobTerminal(job.status));

  useEffect(() => {
    if (!jobId || job?.status !== "completed") return;
    if (navigatedForJobRef.current === jobId) return;
    navigatedForJobRef.current = jobId;
    navigate("/media/review");
  }, [jobId, job?.status, navigate]);

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => uploadMediaBatch(files, ownerType),
    onSuccess: (data) => {
      setUploaded((prev) => [...data.files, ...prev]);
      setError(null);
      if (inputRef.current) inputRef.current.value = "";
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Error de pujada");
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: () => {
      const picture_ids = uploaded
        .filter((f) => f.media_kind === "picture")
        .map((f) => f.id);
      const video_ids = uploaded
        .filter((f) => f.media_kind === "video")
        .map((f) => f.id);
      return startMediaAnalyzeJob({
        source: "media",
        require_review: true,
        dry_run: false,
        ...(picture_ids.length ? { picture_ids } : {}),
        ...(video_ids.length ? { video_ids } : {}),
      });
    },
    onSuccess: (data) => {
      navigatedForJobRef.current = null;
      setJobId(data.job_id);
      setJob(null);
      setError(null);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setError(
          "Ja hi ha una anàlisi en curs. Espereu que acabi o cancel·leu-la.",
        );
        return;
      }
      setError(err instanceof ApiError ? err.message : "Error en l'anàlisi");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (file: MediaUploadOut) =>
      file.media_kind === "video"
        ? deleteVideo(file.id)
        : deletePicture(file.id),
    onSuccess: (_data, file) => {
      setUploaded((prev) =>
        prev.filter(
          (f) => !(f.id === file.id && f.media_kind === file.media_kind),
        ),
      );
      setError(null);
    },
    onError: (err) => {
      setError(
        err instanceof ApiError ? err.message : "Error en eliminar el fitxer",
      );
    },
  });

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return;

      const files = Array.from(fileList);
      const media = files.filter(isMediaFile);
      const rejected = files.filter((f) => !isMediaFile(f));

      if (!media.length) {
        setError(
          "Només es permeten imatges (.jpg, .png, .webp) i vídeos (.mp4, .mov, .webm)",
        );
        if (inputRef.current) inputRef.current.value = "";
        return;
      }

      if (rejected.length > 0) {
        setError(
          `S'han ignorat ${rejected.length} fitxer(s) no admesos: ${rejected.map((f) => f.name).join(", ")}`,
        );
      } else {
        setError(null);
      }

      uploadMutation.mutate(media);
    },
    [uploadMutation],
  );

  const analyzeBusy = busy || analyzeMutation.isPending;
  const canAnalyze = uploaded.length > 0 && !analyzeBusy;
  const deletingId = deleteMutation.isPending
    ? deleteMutation.variables
    : null;

  async function handleCancel() {
    if (!jobId) return;
    try {
      await cancelJob(jobId);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Error en cancel·lar el treball",
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Pujar mitjans"
        description="Pugeu fotos i vídeos, analitzeu què passa i on, i reviseu-los abans d'aprovar-los al catàleg."
      />

      {error && <div className="alert alert-error">{error}</div>}

      <div className="scan-layout">
        <div className="card">
          <h3 className="card-title">Com pujar mitjans</h3>
          <ol className="scan-steps">
            {UPLOAD_STEPS.map((step, index) => (
              <li key={step}>
                <span className="scan-step-num">{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <p className="scan-hint">
            Imatges: <strong>JPG, PNG, WebP</strong> · Vídeos:{" "}
            <strong>MP4, MOV, WebM</strong>
          </p>
        </div>

        <div className="card">
          <h3 className="card-title">Pujar fotos i vídeos</h3>

          <div className="field" style={{ marginBottom: "1rem" }}>
            <label>Tipus de propietari</label>
            <div className="segmented-control" role="group" aria-label="Tipus">
              <button
                type="button"
                className={ownerType === "EMPRESA" ? "active" : undefined}
                onClick={() => setOwnerType("EMPRESA")}
                disabled={uploadMutation.isPending || analyzeBusy}
              >
                EMPRESA
              </button>
              <button
                type="button"
                className={ownerType === "FAMILIA" ? "active" : undefined}
                onClick={() => setOwnerType("FAMILIA")}
                disabled={uploadMutation.isPending || analyzeBusy}
              >
                FAMILIA
              </button>
            </div>
          </div>

          <div
            className={`drop-zone${dragOver ? " drag-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
          >
            <p>
              <strong>Feu clic</strong> o arrossegueu fotos i vídeos aquí
            </p>
            <p style={{ marginTop: "0.5rem", fontSize: "0.8125rem" }}>
              Es permeten diversos fitxers · Tipus actual: {ownerType}
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={MEDIA_ACCEPT}
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />

          {uploadMutation.isPending && (
            <div className="alert alert-info" style={{ marginTop: "1rem" }}>
              Pujant fitxers…
            </div>
          )}
        </div>
      </div>

      {uploaded.length > 0 && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <h3 className="card-title">
            Fitxers pujats ({uploaded.length})
          </h3>
          <div className="media-upload-list">
            {uploaded.map((f) => {
              const isDeleting =
                deletingId?.id === f.id &&
                deletingId?.media_kind === f.media_kind;
              return (
                <div
                  key={`${f.media_kind}-${f.id}`}
                  className="media-upload-row"
                >
                  <button
                    type="button"
                    className="media-upload-thumb"
                    disabled={analyzeBusy || isDeleting}
                    onClick={() => deleteMutation.mutate(f)}
                    aria-label={`Eliminar ${f.filename}`}
                    title="Eliminar"
                  >
                    {f.media_kind === "picture" ? (
                      <MediaPreview
                        kind="picture"
                        id={f.id}
                        filePath={f.relative_path}
                        title={f.filename}
                        thumb
                      />
                    ) : (
                      <div
                        className="media-preview-shell media-preview-shell--thumb"
                        aria-hidden
                      >
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          Vídeo
                        </span>
                      </div>
                    )}
                    <span className="media-upload-thumb-remove" aria-hidden>
                      ×
                    </span>
                  </button>
                  <div className="media-upload-meta">
                    <strong>{f.filename}</strong>
                    <span>
                      {f.media_kind === "picture" ? "Imatge" : "Vídeo"} · id{" "}
                      {f.id} · {f.type}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="btn-row" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canAnalyze}
              onClick={() => analyzeMutation.mutate()}
            >
              Analitzar
            </button>
          </div>
        </div>
      )}

      {(analyzeMutation.isPending || jobId) && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <h3 className="card-title">Progrés de l&apos;anàlisi</h3>
          {analyzeMutation.isPending && !job ? (
            <div className="job-status">
              <strong>Estat:</strong> En execució
            </div>
          ) : (
            <JobProgressPanel
              job={job}
              onCancel={jobId && busy ? handleCancel : undefined}
            />
          )}
          {job?.status === "completed" && (
            <div className="alert alert-success" style={{ marginTop: "1rem" }}>
              Anàlisi completada. Redirigint a revisió…
            </div>
          )}
          {job?.status === "failed" && (
            <div className="alert alert-error" style={{ marginTop: "1rem" }}>
              {job.error ?? "L'anàlisi ha fallat."}
            </div>
          )}
        </div>
      )}
    </>
  );
}
