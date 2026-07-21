import { useState } from "react";
import { JobProgressPanel } from "@/components/JobProgressPanel";
import { PageHeader } from "@/components/PageHeader";
import {
  useClassificadorJob,
  type ClassificadorContentKind,
} from "@/contexts/ClassificadorJobContext";

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
    startAnalyze,
    cancel,
  } = useClassificadorJob();

  const [contentKind, setContentKind] =
    useState<ClassificadorContentKind>("documents");

  const isDocuments = contentKind === "documents";
  const showingActiveJob =
    busy && activeJobKind != null && activeJobKind !== contentKind;

  return (
    <>
      <PageHeader
        title="Classificador"
        description={
          isDocuments
            ? "Analitzeu i classifiqueu els PDF nous de la safata d'entrada. Quan acabi, reviseu els noms proposats a la pestanya Revisió."
            : "Analitzeu fotos i vídeos nous: escena, ubicació i metadades. Quan acabi, reviseu-los a la pestanya Revisió."
        }
      />

      <div className="field" style={{ marginBottom: "1rem" }}>
        <label>Tipus de contingut</label>
        <div
          className="segmented-control"
          role="group"
          aria-label="Tipus de contingut"
        >
          <button
            type="button"
            className={contentKind === "documents" ? "active" : undefined}
            onClick={() => setContentKind("documents")}
            disabled={busy}
          >
            Documents
          </button>
          <button
            type="button"
            className={contentKind === "media" ? "active" : undefined}
            onClick={() => setContentKind("media")}
            disabled={busy}
          >
            Fotos / vídeos
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
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

      {showingActiveJob && (
        <div className="alert alert-info" role="status">
          Hi ha una anàlisi de{" "}
          {activeJobKind === "media" ? "mitjans" : "documents"} en curs. Espereu
          que acabi o cancel·leu-la abans de canviar de tipus.
        </div>
      )}

      <div className="card">
        <p style={{ margin: "0 0 1rem", color: "var(--color-text-secondary)" }}>
          {isDocuments
            ? "Prem el botó per analitzar i classificar els PDF nous. L'OCR i Gemini poden trigar uns minuts."
            : "Prem el botó per analitzar les fotos i vídeos nous (escena i ubicació). Pot trigar uns minuts."}
        </p>

        <div className="btn-row" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => startAnalyze(contentKind)}
          >
            {isDocuments ? "Processar documents" : "Processar mitjans"}
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

        {isDocuments && isAssigning && (
          <div className="job-status" style={{ marginTop: "1rem" }}>
            <strong>Estat:</strong> Assignant documents…
          </div>
        )}

        {!isDocuments && isRouting && (
          <div className="job-status" style={{ marginTop: "1rem" }}>
            <strong>Estat:</strong> Calculant carpetes de destinació…
          </div>
        )}

        {job?.status === "completed" &&
          !isAssigning &&
          !isRouting &&
          activeJobKind === contentKind && (
            <div className="alert alert-success" style={{ marginTop: "1rem" }}>
              {isDocuments
                ? "Anàlisi i assignació completades. Reviseu els documents a la pestanya Revisió."
                : "Anàlisi i assignació de carpetes completades. Reviseu-los a la pestanya Revisió."}
            </div>
          )}
      </div>
    </>
  );
}
