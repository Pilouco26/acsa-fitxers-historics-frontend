import { JobProgressPanel } from "@/components/JobProgressPanel";
import { PageHeader } from "@/components/PageHeader";
import {
  useClassificadorJob,
  type ClassificadorContentKind,
} from "@/contexts/ClassificadorJobContext";

function successMessage(kinds: ClassificadorContentKind[]): string {
  const hasDocuments = kinds.includes("documents");
  const hasMedia = kinds.includes("media");
  if (hasDocuments && hasMedia) {
    return "Anàlisi de documents i mitjans completada. Reviseu els resultats a la pestanya Revisió.";
  }
  if (hasMedia) {
    return "Anàlisi i assignació de carpetes completades. Reviseu-los a la pestanya Revisió.";
  }
  return "Anàlisi i assignació completades. Reviseu els documents a la pestanya Revisió.";
}

export function ClassificadorPage() {
  const {
    job,
    jobId,
    error,
    authError,
    busy,
    isStarting,
    isAssigning,
    isRouting,
    contentKind: activeJobKind,
    completedKinds,
    startAnalyze,
    cancel,
  } = useClassificadorJob();

  const showSuccess = !busy && completedKinds.length > 0;
  const emptyInbox =
    error === "No hi ha documents ni mitjans nous per processar.";

  return (
    <>
      <PageHeader
        title="Classificador"
        description="Analitzeu i classifiqueu els PDF i els mitjans nous de la safata d'entrada. Quan acabi, reviseu els resultats a la pestanya Revisió."
      />

      {error && (
        <div
          className={emptyInbox ? "alert alert-info" : "alert alert-error"}
          role={emptyInbox ? "status" : "alert"}
        >
          {authError ? (
            <>
              <strong>Sessió no autoritzada</strong>
              <p style={{ margin: "0.5rem 0 0" }}>
                La vostra sessió ha caducat o no és vàlida. Torneu a iniciar
                sessió.
              </p>
            </>
          ) : (
            error
          )}
        </div>
      )}

      <div className="card">
        <p style={{ margin: "0 0 1rem", color: "var(--color-text-secondary)" }}>
          Prem el botó per analitzar els PDF i els mitjans nous. Es processaran
          només els tipus que hi hagi pendents. L'OCR i Gemini poden trigar uns
          minuts.
        </p>

        <div className="btn-row" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => startAnalyze()}
          >
            Processar safata d'entrada
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

        {activeJobKind === "documents" && isAssigning && (
          <div className="job-status" style={{ marginTop: "1rem" }}>
            <strong>Estat:</strong> Assignant documents…
          </div>
        )}

        {activeJobKind === "media" && isRouting && (
          <div className="job-status" style={{ marginTop: "1rem" }}>
            <strong>Estat:</strong> Calculant carpetes de destinació…
          </div>
        )}

        {showSuccess && (
          <div className="alert alert-success" style={{ marginTop: "1rem" }}>
            {successMessage(completedKinds)}
          </div>
        )}
      </div>
    </>
  );
}
