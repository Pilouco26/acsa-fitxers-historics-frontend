import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDocuments } from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import { PdfPreview } from "@/components/PdfPreview";
import { StatusBadge } from "@/components/StatusBadge";
import type { DocumentOut } from "@/api/types";

export function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<DocumentOut | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["documents", "ok", debouncedSearch],
    queryFn: () =>
      listDocuments({ status: "ok", q: debouncedSearch || undefined, limit: 200 }),
  });

  const items = data?.items ?? [];

  return (
    <div className="page-fill">
      <PageHeader
        title="Documents"
        description="Documents aprovats a l'arxiu. Seleccioneu un fitxer per previsualitzar el PDF."
      />

      <div className="split-view">
        <div className="card card-panel">
          <div className="toolbar-row">
            <input
              type="search"
              placeholder="Cerca per nom o empresa…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => refetch()}>
              Actualitzar
            </button>
          </div>

          {isLoading ? (
            <p className="empty-state">Carregant…</p>
          ) : items.length === 0 ? (
            <p className="empty-state">No hi ha documents aprovats.</p>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Empresa</th>
                    <th>Data</th>
                    <th>Estat</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((doc) => (
                    <tr
                      key={doc.id}
                      className={selected?.id === doc.id ? "selected" : ""}
                      onClick={() => setSelected(doc)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{doc.proposed_name ?? doc.original_name ?? "—"}</td>
                      <td>{doc.company ?? "—"}</td>
                      <td>{doc.final_date ?? "—"}</td>
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

        <div className="card card-panel">
          {selected ? (
            <>
              <h3 className="card-title" style={{ marginBottom: "0.75rem" }}>
                {selected.proposed_name ?? selected.original_name}
              </h3>
              {selected.summary && (
                <p
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--color-text-secondary)",
                    margin: "0 0 0.75rem",
                  }}
                >
                  {selected.summary}
                </p>
              )}
              <PdfPreview
                documentId={selected.id}
                title={selected.proposed_name ?? selected.original_name ?? "PDF"}
              />
            </>
          ) : (
            <p className="empty-state">
              Seleccioneu un document per veure la vista prèvia
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
