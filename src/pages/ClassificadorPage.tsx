import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { cancelJob, startAnalyzeJob, ApiError } from "@/api/client";
import { JobProgressPanel } from "@/components/JobProgressPanel";
import { PageHeader } from "@/components/PageHeader";
import { useJobPolling } from "@/hooks/useJobPolling";
import type { JobOut } from "@/api/types";

export function ClassificadorPage() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  useJobPolling(jobId, 2000, setJob);

  const analyzeMutation = useMutation({
    mutationFn: () =>
      startAnalyzeJob({
        source: "inbox",
        require_review: true,
        force: false,
        dry_run: false,
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
        title="Classificador"
        description="Analitzeu i classifiqueu els PDF nous de la safata d'entrada. Quan acabi, reviseu els noms proposats a la pestanya Revisió."
      />

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <p style={{ margin: "0 0 1rem", color: "var(--color-text-secondary)" }}>
          Prem el botó per analitzar i classificar els PDF nous. L'OCR i Gemini
          poden trigar uns minuts.
        </p>

        <div className="btn-row" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => analyzeMutation.mutate()}
          >
            Processar documents
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
            Anàlisi completada. Reviseu els documents a la pestanya Revisió.
          </div>
        )}
      </div>
    </>
  );
}
