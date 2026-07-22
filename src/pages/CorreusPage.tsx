import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignEmails,
  cancelJob,
  listEmails,
  startEmailAnalyzeJob,
  updateEmail,
  ApiError,
} from "@/api/client";
import { JobProgressPanel } from "@/components/JobProgressPanel";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/contexts/AuthContext";
import { useJobPolling } from "@/hooks/useJobPolling";
import type { EmailAssignResponse, EmailOut, JobOut } from "@/api/types";

export function CorreusPage() {
  const queryClient = useQueryClient();
  const { apiMode } = useAuth();
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobOut | null>(null);
  const [assignResult, setAssignResult] = useState<EmailAssignResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<EmailOut | null>(null);
  const [editName, setEditName] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);

  const [force, setForce] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [assignDryRun, setAssignDryRun] = useState(false);

  useJobPolling(jobId, 2000, setJob);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["emails", "revisio", debouncedSearch],
    queryFn: () =>
      listEmails({ status: "revisio", q: debouncedSearch || undefined, limit: 200 }),
  });

  const analyzeMutation = useMutation({
    mutationFn: () =>
      startEmailAnalyzeJob({
        source: "emails",
        force,
        dry_run: dryRun,
        ...(apiMode ? { mode: apiMode } : {}),
      }),
    onSuccess: (result) => {
      setJobId(result.job_id);
      setJob(null);
      setAssignResult(null);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Error en iniciar l'anàlisi");
    },
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      assignEmails({
        source: "emails",
        dest: "archive",
        dry_run: assignDryRun,
        sync_db: true,
      }),
    onSuccess: (result) => {
      setAssignResult(result);
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Error en assignar correus");
    },
  });

  const approveMutation = useMutation({
    mutationFn: () =>
      updateEmail(selected!.id, {
        proposed_name: editName,
        summary: editSummary,
        status: "ok",
        approve: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      setSelected(null);
      setDetailOpen(false);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Error en aprovar");
    },
  });

  const busy =
    analyzeMutation.isPending ||
    assignMutation.isPending ||
    job?.status === "pending" ||
    job?.status === "running";

  function selectEmail(email: EmailOut) {
    setSelected(email);
    setEditName(email.proposed_name ?? "");
    setEditSummary(email.summary ?? "");
    setDetailOpen(true);
  }

  const items = data?.items ?? [];
  const detailVisible = Boolean(selected && detailOpen);
  const showDetailToggle = items.length > 0;
  const splitClassName = [
    "split-view",
    detailVisible && "split-view--detail-open",
    showDetailToggle && !detailVisible && "split-view--collapsed",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="page-fill">
      <PageHeader
        title="Correus"
        description="Anàlisi i assignació de correus .eml a l'arxiu."
      />

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <p style={{ margin: "0 0 1rem", color: "var(--color-text-secondary)" }}>
          Analitzeu els correus nous i assigneu-los a l'arxiu quan estiguin aprovats.
        </p>

        <div className="checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
            />
            Forçar reprocessament
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
            />
            Simulació d'anàlisi
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={assignDryRun}
              onChange={(e) => setAssignDryRun(e.target.checked)}
            />
            Simulació d'assignació
          </label>
        </div>

        <div className="btn-row" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => analyzeMutation.mutate()}
          >
            Analitzar correus
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => assignMutation.mutate()}
          >
            Assignar a arxiu
          </button>
        </div>

        <JobProgressPanel
          job={job}
          onCancel={
            jobId
              ? () => {
                  cancelJob(jobId).then(setJob).catch(() => {});
                }
              : undefined
          }
        />

        {job?.status === "completed" && (
          <div className="alert alert-success" style={{ marginTop: "1rem" }}>
            Anàlisi de correus completada. Reviseu-los a continuació.
          </div>
        )}
      </div>

      {assignResult && (
        <div className="card">
          <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>
            Resultat de l'assignació
          </h3>
          <div style={{ fontSize: "0.875rem" }}>
            {Object.entries(assignResult.summary).map(([k, v]) => (
              <span key={k} style={{ marginRight: "1.25rem" }}>
                <strong>{k}:</strong> {v}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={splitClassName}>
        {!detailVisible && (
          <div className="card card-panel">
            <h3 className="card-title">Correus pendents de revisió</h3>
            <div className="toolbar-row">
              <input
                type="search"
                placeholder="Cerca per assumpte o empresa…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => refetch()}
              >
                Actualitzar
              </button>
            </div>

            {isLoading ? (
              <p className="empty-state">Carregant…</p>
            ) : items.length === 0 ? (
              <p className="empty-state">No hi ha correus pendents de revisió.</p>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Assumpte</th>
                      <th>Empresa</th>
                      <th>Estat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((email) => (
                      <tr
                        key={email.id}
                        className={selected?.id === email.id ? "selected" : ""}
                        onClick={() => selectEmail(email)}
                        style={{ cursor: "pointer" }}
                      >
                        <td>{email.proposed_name ?? email.original_name ?? "—"}</td>
                        <td>{email.subject ?? "—"}</td>
                        <td>{email.company ?? "—"}</td>
                        <td>
                          <StatusBadge status={email.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {showDetailToggle && (
          <button
            type="button"
            className="split-detail-toggle"
            onClick={() => setDetailOpen((open) => !open)}
            disabled={!selected}
            aria-expanded={detailVisible}
            aria-label={detailVisible ? "Tancar panell" : "Obrir panell"}
          >
            {detailVisible ? "◀" : "▶"}
          </button>
        )}

        {detailVisible && selected && (
          <div className="card card-panel split-detail-edit">
            <h3 className="card-title">Editar correu</h3>

            <div className="field">
              <label>Assumpte</label>
              <p className="split-detail-summary">{selected.subject ?? "—"}</p>
            </div>

            <div className="field">
              <label>Remitent</label>
              <p className="split-detail-summary">
                {selected.sender_name ?? selected.sender_email ?? "—"}
              </p>
            </div>

            <div className="field">
              <label htmlFor="email-name">Nom proposat</label>
              <input
                id="email-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="email-summary">Resum</label>
              <textarea
                id="email-summary"
                rows={6}
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
              />
            </div>

            {selected.error && (
              <div className="alert alert-error">{selected.error}</div>
            )}

            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate()}
              >
                Aprovar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
