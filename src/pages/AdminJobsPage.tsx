import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, cancelJob, listAdminJobs } from "@/api/client";
import type { JobStatus } from "@/api/types";
import { PageHeader } from "@/components/PageHeader";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Tots" },
  { value: "running", label: "En execució" },
  { value: "pending", label: "Pendents" },
  { value: "completed", label: "Completats" },
  { value: "failed", label: "Fallits" },
  { value: "cancelled", label: "Cancel·lats" },
];

function jobStatusClass(status: JobStatus): string {
  if (status === "completed") return "badge-ok";
  if (status === "failed") return "badge-error";
  if (status === "running" || status === "pending") return "badge-revisio";
  return "badge-pending";
}

function formatTs(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("ca-ES");
}

export function AdminJobsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const jobsQuery = useQuery({
    queryKey: ["admin-jobs", status],
    queryFn: () =>
      listAdminJobs({
        status: status || undefined,
        limit: 50,
      }),
    refetchInterval: 5000,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelJob(id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["admin-jobs"] });
    },
    onError: (err) => {
      setActionError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Error en cancel·lar",
      );
    },
  });

  const errorMessage = (() => {
    const err = jobsQuery.error;
    if (!err) return null;
    if (err instanceof ApiError && err.status === 404) {
      return "L'API de treballs d'administració encara no està disponible al backend.";
    }
    return err instanceof Error ? err.message : "Error en carregar els treballs";
  })();

  const items = jobsQuery.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Treballs"
        description="Cua i historial de jobs del sistema (anàlisi, classificador, etc.)."
      />

      {(errorMessage || actionError) && (
        <div className="alert alert-error">{actionError ?? errorMessage}</div>
      )}

      <div className="card admin-ops-toolbar">
        <div className="field-grid admin-ops-filters">
          <div className="field">
            <label htmlFor="admin-job-status">Estat</label>
            <select
              id="admin-job-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={() => jobsQuery.refetch()}
            disabled={jobsQuery.isFetching}
          >
            Actualitzar
          </button>
        </div>
      </div>

      <div className="card table-list-body">
        {jobsQuery.isLoading && (
          <p className="empty-state">Carregant treballs…</p>
        )}
        {!jobsQuery.isLoading && !items.length && !errorMessage && (
          <p className="empty-state">No hi ha treballs per a aquest filtre.</p>
        )}
        {items.length > 0 && (
          <table className="data-table data-table--list">
            <thead>
              <tr>
                <th>Tipus</th>
                <th>Estat</th>
                <th>Progrés</th>
                <th>Inici</th>
                <th>Accions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((job) => {
                const progress = job.progress;
                const progressLabel = progress
                  ? `${progress.processed}/${progress.total}${
                      progress.message ? ` · ${progress.message}` : ""
                    }`
                  : "—";
                const canCancel =
                  job.status === "pending" || job.status === "running";
                return (
                  <tr key={job.id}>
                    <td>
                      <div className="table-list-primary">{job.type}</div>
                      <div className="table-list-secondary">{job.id}</div>
                      {job.error ? (
                        <div className="table-list-secondary admin-job-error">
                          {job.error}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span className={`badge ${jobStatusClass(job.status)}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="table-list-secondary">{progressLabel}</td>
                    <td className="table-list-secondary">
                      {formatTs(job.started_at)}
                    </td>
                    <td>
                      <div className="btn-row admin-service-actions">
                        {job.worker_service_id ? (
                          <Link
                            className="btn btn-sm"
                            to={`/admin/logs?source=${encodeURIComponent(job.worker_service_id)}&job_id=${encodeURIComponent(job.id)}`}
                          >
                            Logs
                          </Link>
                        ) : (
                          <Link
                            className="btn btn-sm"
                            to={`/admin/logs?job_id=${encodeURIComponent(job.id)}`}
                          >
                            Logs
                          </Link>
                        )}
                        {canCancel ? (
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={
                              cancelMutation.isPending &&
                              cancelMutation.variables === job.id
                            }
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Cancel·lar el treball ${job.id}?`,
                                )
                              ) {
                                cancelMutation.mutate(job.id);
                              }
                            }}
                          >
                            Cancel·lar
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
