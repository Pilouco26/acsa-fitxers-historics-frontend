import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { uploadBatch, ApiError, getSettings } from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import type { UploadOut } from "@/api/types";

const SCAN_STEPS = [
  "Obriu Epson Scan o l'aplicació Escanejar del Windows (menú Inici).",
  "Col·loqueu el document a l'escàner i escanegeu-lo.",
  "Deseu el resultat com a PDF al vostre ordinador.",
  "Arrossegueu el PDF aquí o feu clic per seleccionar-lo.",
] as const;

export function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploaded, setUploaded] = useState<UploadOut[]>([]);
  const [error, setError] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const mutation = useMutation({
    mutationFn: (files: File[]) => uploadBatch(files),
    onSuccess: (data) => {
      setUploaded((prev) => [...data.files, ...prev]);
      setError(null);
      if (inputRef.current) inputRef.current.value = "";
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Error de pujada");
    },
  });

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return;
      const pdfs = Array.from(fileList).filter((f) =>
        f.name.toLowerCase().endsWith(".pdf"),
      );
      if (!pdfs.length) {
        setError("Només es permeten fitxers PDF");
        return;
      }
      mutation.mutate(pdfs);
    },
    [mutation],
  );

  const entradaFolder = settingsQuery.data?.input_folder;

  return (
    <>
      <PageHeader
        title="Escanejar i pujar documents"
        description="Escanegeu amb Epson Scan (o l'escàner del Windows) i pugeu els PDF a la safata d'entrada (_PENDENTS). No cal instal·lar cap programari addicional d'ACSA."
      />

      {error && <div className="alert alert-error">{error}</div>}

      <div className="scan-layout">
        <div className="card">
          <h3 className="card-title">Com escanejar</h3>
          <ol className="scan-steps">
            {SCAN_STEPS.map((step, index) => (
              <li key={step}>
                <span className="scan-step-num">{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <p className="scan-hint">
            Si no teniu Epson Scan, cerqueu <strong>Escanejar</strong> al menú
            Inici del Windows. Assegureu-vos que el format de sortida és{" "}
            <strong>PDF</strong>.
          </p>
          {entradaFolder && (
            <p className="scan-status">Destí al servidor: {entradaFolder}</p>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Pujar PDF escanejat</h3>
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
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
          >
            <p>
              <strong>Feu clic</strong> o arrossegueu PDFs escanejats aquí
            </p>
            <p style={{ marginTop: "0.5rem", fontSize: "0.8125rem" }}>
              Màxim 50 MB per fitxer · Es permeten diversos fitxers
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />

          {mutation.isPending && (
            <div className="alert alert-info" style={{ marginTop: "1rem" }}>
              Pujant fitxers…
            </div>
          )}
        </div>
      </div>

      {uploaded.length > 0 && (
        <div className="card">
          <h3 className="card-title">PDFs pujats ({uploaded.length})</h3>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Ruta relativa</th>
                </tr>
              </thead>
              <tbody>
                {uploaded.map((f) => (
                  <tr key={f.relative_path}>
                    <td>{f.filename}</td>
                    <td style={{ color: "var(--color-text-secondary)" }}>
                      {f.relative_path}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
