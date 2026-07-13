import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { compareFile, ApiError } from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import { PdfPreview } from "@/components/PdfPreview";
import { FilePdfPreview } from "@/components/FilePdfPreview";
import type { CompareResponse } from "@/api/types";

const VERDICT_LABELS: Record<string, string> = {
  duplicate: "Duplicat",
  similar: "Semblant",
  none: "Cap coincidència",
};

function formatTrust(trust: number | null | undefined): string {
  if (trust == null) return "—";
  return `${Math.round(trust * 100)}%`;
}

function verdictInCatalan(verdict: string): string {
  return VERDICT_LABELS[verdict.toLowerCase()] ?? verdict;
}

function CompareResult({ result }: { result: CompareResponse }) {
  const verdictLabel = verdictInCatalan(result.verdict);

  return (
    <div className="card">
      <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>Veredicte</h3>

      <div className="compare-stats">
        <span>
          <strong>Resultat:</strong> {verdictLabel}
        </span>
        {result.trust != null && (
          <span>
            <strong>Confiança:</strong> {formatTrust(result.trust)}
          </span>
        )}
        <span>
          <strong>Candidats:</strong> {result.candidates_scanned}
        </span>
        <span>
          <strong>Bytes comparats:</strong> {result.bytes_compared}
        </span>
        <span>
          <strong>Text comparat:</strong> {result.text_compared}
        </span>
      </div>

      {result.best_match && (
        <div style={{ marginTop: "1rem" }}>
          <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.875rem" }}>
            Millor coincidència
          </h4>
          <table className="data-table">
            <tbody>
              <tr>
                <th>Camí</th>
                <td>{result.best_match.relative_path ?? "—"}</td>
              </tr>
              <tr>
                <th>Document ID</th>
                <td>{result.best_match.document_id ?? "—"}</td>
              </tr>
              <tr>
                <th>Confiança</th>
                <td>{formatTrust(result.best_match.trust)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {result.alternatives.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.875rem" }}>
            Alternatives ({result.alternatives.length})
          </h4>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Camí</th>
                  <th>Document ID</th>
                  <th>Confiança</th>
                </tr>
              </thead>
              <tbody>
                {result.alternatives.map((alt, i) => (
                  <tr key={i}>
                    <td>{alt.relative_path ?? "—"}</td>
                    <td>{alt.document_id ?? "—"}</td>
                    <td>{formatTrust(alt.trust)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function ComparadorPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compareMutation = useMutation({
    mutationFn: compareFile,
    onSuccess: (data) => {
      setResult(data);
      setError(null);
    },
    onError: (err) => {
      setResult(null);
      setError(err instanceof ApiError ? err.message : "Error en comparar");
    },
  });

  const handleFile = useCallback(
    (file: File | null) => {
      if (!file) return;

      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setError("Només es permeten fitxers PDF");
        setResult(null);
        setFile(null);
        return;
      }

      setFileName(file.name);
      setFile(file);
      setResult(null);
      setError(null);
      compareMutation.mutate(file);
      if (inputRef.current) inputRef.current.value = "";
    },
    [compareMutation],
  );

  const handleFileList = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return;
      handleFile(fileList[0]);
    },
    [handleFile],
  );

  return (
    <>
      <PageHeader
        title="Comparador"
        description="Pugeu un PDF per comprovar si ja existeix a la base de dades."
      />

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <h3 className="card-title">Comparar PDF</h3>
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
            handleFileList(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
        >
          <p>
            <strong>Feu clic</strong> o arrossegueu un PDF aquí
          </p>
          <p style={{ marginTop: "0.5rem", fontSize: "0.8125rem" }}>
            La comparació comença automàticament
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          hidden
          onChange={(e) => handleFileList(e.target.files)}
        />

        {compareMutation.isPending && (
          <div className="alert alert-info" style={{ marginTop: "1rem" }}>
            Comparant{fileName ? ` «${fileName}»` : ""}…
          </div>
        )}
      </div>

      {result && (
        <>
          {result.verdict.toLowerCase() === "duplicate" ? (
            <div className="card" style={{ marginTop: "1rem" }}>
              <h3 className="card-title">Duplicat</h3>
              <p style={{ margin: "0 0 1rem" }}>
                El fitxer pujat coincideix amb un document existent. A sota teniu la vista prèvia
                del fitxer pujat i la millor coincidència.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                  alignItems: "start",
                }}
              >
                <div className="card" style={{ margin: 0 }}>
                  <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.875rem" }}>Fitxer pujat</h4>
                  {file ? (
                    <FilePdfPreview file={file} title={file.name} />
                  ) : (
                    <p className="empty-state">No hi ha fitxer per previsualitzar.</p>
                  )}
                </div>

                <div className="card" style={{ margin: 0 }}>
                  <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.875rem" }}>
                    Millor coincidència
                  </h4>
                  {result.best_match?.document_id != null ? (
                    <PdfPreview
                      documentId={result.best_match.document_id}
                      title={result.best_match.relative_path ?? "Document"}
                    />
                  ) : (
                    <p className="empty-state">No hi ha document associat per previsualitzar.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="alert alert-success" style={{ marginTop: "1rem" }}>
              Aquest fitxer <strong>no està duplicat</strong>.
            </div>
          )}

          <CompareResult result={result} />
        </>
      )}
    </>
  );
}
