import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listDocuments, updateDocument, ApiError } from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import type { DocumentOut } from "@/api/types";

export function RevisioPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<DocumentOut | null>(null);
  const [editName, setEditName] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["documents", "revisio", debouncedSearch],
    queryFn: () =>
      listDocuments({ status: "revisio", q: debouncedSearch || undefined, limit: 200 }),
  });

  const approveMutation = useMutation({
    mutationFn: () =>
      updateDocument(selected!.id, {
        proposed_name: editName,
        summary: editSummary,
        status: "ok",
        approve: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setSelected(null);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Error en aprovar");
    },
  });

  function selectDoc(doc: DocumentOut) {
    setSelected(doc);
    setEditName(doc.proposed_name ?? "");
    setEditSummary(doc.summary ?? "");
  }

  const items = data?.items ?? [];

  return (
    <div className="page-fill">
      <PageHeader
        title="Revisió"
        description="Documents pendents de revisió · cerca per nom o carpeta"
      />

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card card-panel">
        <div className="toolbar-row">
          <div className="field" style={{ margin: 0, flex: "1 1 200px" }}>
            <label htmlFor="revisio-search">Cerca</label>
            <input
              id="revisio-search"
              type="search"
              placeholder="Nom proposat, empresa…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => refetch()}>
            Actualitzar
          </button>
        </div>

        {isLoading ? (
          <p className="empty-state">Carregant…</p>
        ) : items.length === 0 ? (
          <p className="empty-state">No hi ha documents pendents de revisió.</p>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nom proposat</th>
                  <th>Empresa</th>
                  <th>Tipus</th>
                  <th>Data</th>
                  <th>Conf.</th>
                  <th>Estat</th>
                </tr>
              </thead>
              <tbody>
                {items.map((doc) => (
                  <tr
                    key={doc.id}
                    className={selected?.id === doc.id ? "selected" : ""}
                    onClick={() => selectDoc(doc)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>{doc.proposed_name ?? doc.original_name ?? "—"}</td>
                    <td>{doc.company ?? "—"}</td>
                    <td>{doc.doc_type_ca ?? doc.doc_type ?? "—"}</td>
                    <td>{doc.final_date ?? "—"}</td>
                    <td>{doc.overall_conf ?? "—"}</td>
                    <td>
                      <StatusBadge status={doc.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="card">
          <h3 className="card-title">Editar document </h3>

          <div className="field">
            <label htmlFor="edit-name">Nom proposat</label>
            <input
              id="edit-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="edit-summary">Resum</label>
            <textarea
              id="edit-summary"
              rows={4}
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
  );
}
