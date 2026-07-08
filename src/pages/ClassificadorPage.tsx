import { JobProgressPanel } from "@/components/JobProgressPanel";
import { PageHeader } from "@/components/PageHeader";
import { useClassificadorJob } from "@/contexts/ClassificadorJobContext";

export function ClassificadorPage() {
  const { job, jobId, error, busy, isStarting, isAssigning, startAnalyze, cancel } =
    useClassificadorJob();

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
            onClick={startAnalyze}
          >
            Processar documents
          </button>
        </div>

        {isStarting && !job ? (
          <div className="job-status">
            <strong>Estat:</strong> En execució
          </div>
        ) : (
          <JobProgressPanel
            job={job}
            onCancel={jobId ? cancel : undefined}
          />
        )}

        {isAssigning && (
          <div className="job-status" style={{ marginTop: "1rem" }}>
            <strong>Estat:</strong> Assignant documents…
          </div>
        )}

        {job?.status === "completed" && !isAssigning && (
          <div className="alert alert-success" style={{ marginTop: "1rem" }}>
            Anàlisi i assignació completades. Reviseu els documents a la pestanya Revisió.
          </div>
        )}
      </div>
    </>
  );
}
