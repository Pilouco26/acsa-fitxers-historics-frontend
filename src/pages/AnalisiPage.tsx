import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  cancelJob,
  listFolders,
  startAnalyzeJob,
  ApiError,
} from "@/api/client";
import { JobProgressPanel } from "@/components/JobProgressPanel";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useJobPolling } from "@/hooks/useJobPolling";
import type { JobOut } from "@/api/types";

export function AnalisiPage() {
  const { apiMode } = useAuth();
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [source, setSource] = useState("inbox");
  const [dest, setDest] = useState("archive");
  const [folder, setFolder] = useState("");
  const [limit, setLimit] = useState("");
  const [folderLimit, setFolderLimit] = useState("");
  const [folderStart, setFolderStart] = useState("");
  const [folderEnd, setFolderEnd] = useState("");
  const [folderFrom, setFolderFrom] = useState("");
  const [folderTo, setFolderTo] = useState("");
  const [force, setForce] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [requireReview, setRequireReview] = useState(true);
  const [runAssign, setRunAssign] = useState(false);

  useJobPolling(jobId, 2000, setJob);

  const { data: folders } = useQuery({
    queryKey: ["folders", "archive", apiMode ?? "ALL"],
    queryFn: () =>
      listFolders({
        root: "archive",
        ...(apiMode ? { mode: apiMode } : {}),
      }),
  });

  const analyzeMutation = useMutation({
    mutationFn: () =>
      startAnalyzeJob({
        source,
        dest,
        folder: folder || null,
        limit: limit ? Number(limit) : null,
        folder_limit: folderLimit ? Number(folderLimit) : null,
        folder_start: folderStart ? Number(folderStart) : null,
        folder_end: folderEnd ? Number(folderEnd) : null,
        folder_from: folderFrom || null,
        folder_to: folderTo || null,
        force,
        dry_run: dryRun,
        require_review: requireReview,
        run_assign: runAssign,
        ...(apiMode ? { mode: apiMode } : {}),
      }),
    onSuccess: (data) => {
      setJobId(data.job_id);
      setJob(null);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Error en iniciar l'anàlisi");
    },
  });

  const busy =
    analyzeMutation.isPending ||
    job?.status === "pending" ||
    job?.status === "running";

  return (
    <>
      <PageHeader
        title="Anàlisi"
        description="Anàlisi per lots amb filtres de carpeta. Per a processament habitual, useu el Classificador."
      />

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="field-grid">
          <div className="field">
            <label htmlFor="source">Origen</label>
            <select id="source" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="inbox">inbox (_PENDENTS)</option>
              <option value="archive">archive</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="dest">Destí</label>
            <select id="dest" value={dest} onChange={(e) => setDest(e.target.value)}>
              <option value="archive">archive</option>
              <option value="inbox">inbox (_PENDENTS)</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="folder">Carpeta específica</label>
          <select
            id="folder"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
          >
            <option value="">— Totes —</option>
            {folders?.items.map((f) => (
              <option key={f.relative_path} value={f.relative_path}>
                {f.name} ({f.index})
              </option>
            ))}
          </select>
        </div>

        <div className="field-grid">
          <div className="field">
            <label htmlFor="limit">Límit de fitxers</label>
            <input
              id="limit"
              type="number"
              min={1}
              placeholder="Sense límit"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="folder-limit">Límit de carpetes</label>
            <input
              id="folder-limit"
              type="number"
              min={1}
              placeholder="Sense límit"
              value={folderLimit}
              onChange={(e) => setFolderLimit(e.target.value)}
            />
          </div>
        </div>

        <div className="field-grid">
          <div className="field">
            <label htmlFor="folder-start">Carpeta inici (índex)</label>
            <input
              id="folder-start"
              type="number"
              min={1}
              placeholder="—"
              value={folderStart}
              onChange={(e) => setFolderStart(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="folder-end">Carpeta fi (índex)</label>
            <input
              id="folder-end"
              type="number"
              min={1}
              placeholder="—"
              value={folderEnd}
              onChange={(e) => setFolderEnd(e.target.value)}
            />
          </div>
        </div>

        <div className="field-grid">
          <div className="field">
            <label htmlFor="folder-from">Carpeta des de (nom)</label>
            <input
              id="folder-from"
              placeholder="p.ex. ACME"
              value={folderFrom}
              onChange={(e) => setFolderFrom(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="folder-to">Carpeta fins a (nom)</label>
            <input
              id="folder-to"
              placeholder="p.ex. ZZZ"
              value={folderTo}
              onChange={(e) => setFolderTo(e.target.value)}
            />
          </div>
        </div>

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
            Simulació (dry run)
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={requireReview}
              onChange={(e) => setRequireReview(e.target.checked)}
            />
            Requerir revisió
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={runAssign}
              onChange={(e) => setRunAssign(e.target.checked)}
            />
            Assignar automàticament després
          </label>
        </div>

        <div className="btn-row" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => analyzeMutation.mutate()}
          >
            Iniciar anàlisi
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
            Anàlisi completada.
            {requireReview && " Reviseu els documents a la pestanya Revisió."}
          </div>
        )}
      </div>
    </>
  );
}
