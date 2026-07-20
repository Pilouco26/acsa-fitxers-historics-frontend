import { useCallback, useRef, useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { uploadBatch, ApiError } from "@/api/client";

import { PageHeader } from "@/components/PageHeader";

import type { UploadOut } from "@/api/types";



const UPLOAD_STEPS = [

  "Prepareu els documents en format PDF al vostre ordinador.",

  "Arrossegueu el PDF aquí o feu clic per seleccionar-lo.",

  "Confirmeu que els fitxers es pugen a la safata d'entrada (_PENDENTS).",

] as const;

const PDF_MIME_TYPES = new Set([
  "application/pdf",
  "application/x-pdf",
]);

function isPdfFile(file: File): boolean {
  if (!file.name.toLowerCase().endsWith(".pdf")) return false;
  const mime = file.type.toLowerCase();
  return !mime || PDF_MIME_TYPES.has(mime);
}

export function UploadPage() {

  const inputRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);

  const [uploaded, setUploaded] = useState<UploadOut[]>([]);

  const [error, setError] = useState<string | null>(null);



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

      const files = Array.from(fileList);
      const pdfs = files.filter(isPdfFile);
      const rejected = files.filter((f) => !isPdfFile(f));

      if (!pdfs.length) {
        setError("Només es permeten fitxers PDF");
        if (inputRef.current) inputRef.current.value = "";
        return;
      }

      if (rejected.length > 0) {
        setError(
          `S'han ignorat ${rejected.length} fitxer(s) no PDF: ${rejected.map((f) => f.name).join(", ")}`,
        );
      } else {
        setError(null);
      }

      mutation.mutate(pdfs);
    },
    [mutation],
  );

  return (

    <>

      <PageHeader

        title="Pujar documents"

        description="Pugeu els PDF a la safata d'entrada."

      />

      <div className="btn-row" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
        <Link to="/media" className="btn btn-secondary">
          Pujar fotos i vídeos
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}



      <div className="scan-layout">

        <div className="card">

          <h3 className="card-title">Com pujar documents</h3>

          <ol className="scan-steps">

            {UPLOAD_STEPS.map((step, index) => (

              <li key={step}>

                <span className="scan-step-num">{index + 1}</span>

                {step}

              </li>

            ))}

          </ol>

          <p className="scan-hint">

            Assegureu-vos que el format dels fitxers és <strong>PDF</strong>.

          </p>


        </div>



        <div className="card">

          <h3 className="card-title">Pujar PDF</h3>

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

              <strong>Feu clic</strong> o arrossegueu PDFs aquí

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


