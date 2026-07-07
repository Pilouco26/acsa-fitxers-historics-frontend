import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { applyRenames, revertRenames, ApiError } from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import type { ApplyResponse, RevertResponse } from "@/api/types";

function SummaryCard({
  title,
  summary,
}: {
  title: string;
  summary: Record<string, number>;
}) {
  return (
    <div className="card">
      <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>{title}</h3>
      <div style={{ fontSize: "0.875rem" }}>
        {Object.entries(summary).map(([k, v]) => (
          <span key={k} style={{ marginRight: "1.25rem" }}>
            <strong>{k}:</strong> {v}
          </span>
        ))}
      </div>
    </div>
  );
}

export function EdicionsPage() {
  const [dryRun, setDryRun] = useState(true);
  const [folder, setFolder] = useState("archive");
  const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null);
  const [revertResult, setRevertResult] = useState<RevertResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyMutation = useMutation({
    mutationFn: () =>
      applyRenames({
        dry_run: dryRun,
        folder: folder || null,
      }),
    onSuccess: (data) => {
      setApplyResult(data);
      setRevertResult(null);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Error en aplicar canvis");
    },
  });

  const revertMutation = useMutation({
    mutationFn: () => revertRenames(),
    onSuccess: (data) => {
      setRevertResult(data);
      setApplyResult(null);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Error en revertir canvis");
    },
  });

  const busy = applyMutation.isPending || revertMutation.isPending;

  return (
    <>
      <PageHeader
        title="Edicions"
        description="Aplicar i revertir canvis de nom aprovats a l'arxiu."
      />

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <p style={{ margin: "0 0 1rem", color: "var(--color-text-secondary)" }}>
          Aplica els noms proposats aprovats als fitxers de l'arxiu, o reverteix
          l'última operació d'aplicació.
        </p>

        <div className="field">
          <label htmlFor="folder">Carpeta</label>
          <select
            id="folder"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
          >
            <option value="archive">archive</option>
            <option value="inbox">inbox (_PENDENTS)</option>
          </select>
        </div>

        <div className="checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
            />
            Simulació (dry run) — només mostra què es canviaria
          </label>
        </div>

        <div className="btn-row" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => applyMutation.mutate()}
          >
            {dryRun ? "Simular aplicació" : "Aplicar canvis"}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => {
              if (
                !window.confirm(
                  "Segur que voleu revertir l'última aplicació de canvis de nom?",
                )
              ) {
                return;
              }
              revertMutation.mutate();
            }}
          >
            Revertir última aplicació
          </button>
        </div>
      </div>

      {applyResult && (
        <SummaryCard
          title={dryRun ? "Resultat de la simulació" : "Canvis aplicats"}
          summary={applyResult.summary}
        />
      )}

      {revertResult && (
        <SummaryCard title="Canvis revertits" summary={revertResult.summary} />
      )}
    </>
  );
}
