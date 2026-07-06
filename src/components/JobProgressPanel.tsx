import type { JobOut } from "@/api/types";

interface JobProgressPanelProps {
  job: JobOut | null;
  onCancel?: () => void;
}

export function JobProgressPanel({ job, onCancel }: JobProgressPanelProps) {
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
      {progress.message && (
        <div style={{ marginTop: "0.5rem" }}>{progress.message}</div>
      )}
      {Object.keys(progress.status_counts).length > 0 && (
        <div style={{ marginTop: "0.5rem", fontSize: "0.8125rem" }}>
          {Object.entries(progress.status_counts).map(([k, v]) => (
            <span key={k} style={{ marginRight: "1rem" }}>
              {k}: {v}
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
