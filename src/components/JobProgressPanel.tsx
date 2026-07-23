import { useEffect, useMemo, useRef } from "react";
import type { JobOut } from "@/api/types";

interface JobProgressPanelProps {
  job: JobOut | null;
  onCancel?: () => void;
}

const documentStatusCountLabels: Record<string, string> = {
  ok: "Aprovats",
  revisio: "En revisió",
  repeated: "Repetits",
  error: "Errors",
  pendent: "Pendents",
  pending: "Pendents",
};

const jobMessageLabels: Record<string, string> = {
  "analyzing documents": "Analitzant documents",
  "processing documents": "Processant documents",
  "assigning documents": "Assignant documents",
  "classifying documents": "Classificant documents",
  "job started": "Feina iniciada",
  "job iniciat": "Feina iniciada",
  "media analyze": "Anàlisi de mitjans",
  "media-analyze": "Anàlisi de mitjans",
  "analyzing media": "Analitzant mitjans",
  "processing media": "Processant mitjans",
};

function translateDocumentStatus(status: string): string {
  return documentStatusCountLabels[status] ?? status;
}

function translateJobMessage(message: string): string {
  const key = message.trim().toLowerCase();
  return jobMessageLabels[key] ?? message;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `~${Math.ceil(seconds)} s`;
  const mins = Math.ceil(seconds / 60);
  if (mins < 60) return `~${mins} min`;
  const hours = Math.ceil(mins / 60);
  return `~${hours} h`;
}

export function JobProgressPanel({ job, onCancel }: JobProgressPanelProps) {
  // Client-side ETA fallback (used only when backend doesn't provide eta_seconds).
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    // Reset when switching jobs.
    startedAtRef.current = null;
  }, [job?.id]);

  useEffect(() => {
    // Start the timer once we see the job active.
    if (!job) return;
    if (startedAtRef.current) return;
    if (job.status === "pending" || job.status === "running") {
      startedAtRef.current = Date.now();
    }
  }, [job?.id, job?.status]);

  const etaSeconds = useMemo(() => {
    if (!job) return null;
    const backendEta = job.eta_seconds;
    if (typeof backendEta === "number" && Number.isFinite(backendEta) && backendEta >= 0) {
      return backendEta;
    }

    const { progress } = job;
    if (progress.total <= 0) return null;
    if (progress.processed <= 0) return null;
    if (progress.processed >= progress.total) return 0;

    const startedAt = startedAtRef.current;
    if (!startedAt) return null;

    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    if (elapsedSeconds < 5) return null; // avoid noisy early estimates

    const rate = progress.processed / elapsedSeconds;
    if (!Number.isFinite(rate) || rate <= 0) return null;

    return Math.ceil((progress.total - progress.processed) / rate);
  }, [job?.eta_seconds, job?.progress.processed, job?.progress.total]);

  if (!job) return null;

  const { progress, status, error } = job;
  const pct =
    progress.total > 0
      ? Math.round((progress.processed / progress.total) * 100)
      : 0;

  const statusLabels: Record<string, string> = {
    pending: "En cua",
    running: "En execució",
    completed: "Completat",
    failed: "Error",
    cancelled: "Cancel·lat",
  };

  return (
    <div className="job-status">
      <div>
        <strong>Estat:</strong> {statusLabels[status] ?? status}
      </div>
      {progress.total > 0 && (
        <>
          <div style={{ marginTop: "0.5rem" }}>
            {progress.processed} / {progress.total} fitxers
            {progress.current_file && (
              <span style={{ color: "var(--color-text-secondary)" }}>
                {" "}
                — {progress.current_file}
              </span>
            )}
          </div>
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: `${pct}%` }}
            />
          </div>
        </>
      )}
      {(status === "pending" || status === "running") &&
        typeof etaSeconds === "number" &&
        Number.isFinite(etaSeconds) && (
          <div style={{ marginTop: "0.5rem", color: "var(--color-text-secondary)" }}>
            Temps estimat restant: {formatDuration(etaSeconds)}
          </div>
        )}
      {progress.message && status !== "completed" && (
        <div style={{ marginTop: "0.5rem" }}>
          {translateJobMessage(progress.message)}
        </div>
      )}
      {Object.keys(progress.status_counts).length > 0 && (
        <div style={{ marginTop: "0.5rem", fontSize: "0.8125rem" }}>
          {Object.entries(progress.status_counts).map(([k, v]) => (
            <span key={k} style={{ marginRight: "1rem" }}>
              {translateDocumentStatus(k)}: {v}
            </span>
          ))}
        </div>
      )}
      {error && (
        <div className="alert alert-error" style={{ marginTop: "0.75rem" }}>
          {error}
        </div>
      )}
      {onCancel && (status === "pending" || status === "running") && (
        <div className="btn-row">
          <button type="button" className="btn btn-danger btn-sm" onClick={onCancel}>
            Cancel·lar
          </button>
        </div>
      )}
    </div>
  );
}
