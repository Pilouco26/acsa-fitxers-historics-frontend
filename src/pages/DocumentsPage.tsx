import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listDocuments, updateDocument } from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import { PdfPreview } from "@/components/PdfPreview";
import { TablePagination } from "@/components/TablePagination";
import type { DocumentOrderBy, DocumentOut } from "@/api/types";

const MIN_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 25;

function sortIndicator(active: boolean, dir: "asc" | "desc") {
  if (!active) return "↕";
  return dir === "asc" ? "↑" : "↓";
}

export function DocumentsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterNom, setFilterNom] = useState("");
  const [filterCarpeta, setFilterCarpeta] = useState("");
  const [debouncedFilterNom, setDebouncedFilterNom] = useState("");
  const [debouncedFilterCarpeta, setDebouncedFilterCarpeta] = useState("");
  const [orderBy, setOrderBy] = useState<DocumentOrderBy | null>(null);
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(MIN_PAGE_SIZE);
  const [selected, setSelected] = useState<DocumentOut | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [editName, setEditName] = useState("");
  const listCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedFilterNom(filterNom), 300);
    return () => window.clearTimeout(t);
  }, [filterNom]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedFilterCarpeta(filterCarpeta), 300);
    return () => window.clearTimeout(t);
  }, [filterCarpeta]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, debouncedFilterNom, debouncedFilterCarpeta, orderBy, orderDir]);

  const detailVisible = Boolean(selected && detailOpen);

  useEffect(() => {
    // Keep rows-per-page responsive without introducing scrollbars.
    // The list panel unmounts in preview mode, so we must re-attach when it returns.
    if (detailVisible) return;

    const el = listCardRef.current;
    if (!el) return;

    const compute = () => {
      const height = el.getBoundingClientRect().height;

      // Rough constants (px) tuned for this UI:
      // - toolbar row + spacing
      // - table header row
      // - pagination block + spacing
      // - card paddings
      const fixed = 56 + 44 + 56 + 48;
      const rowHeight = 36;

      const next = Math.max(
        MIN_PAGE_SIZE,
        Math.min(MAX_PAGE_SIZE, Math.floor((height - fixed) / rowHeight)),
      );

      setPageSize((prev) => (prev === next ? prev : next));
    };

    const raf = window.requestAnimationFrame(() => compute());
    const ro = new ResizeObserver(() => compute());
    ro.observe(el);

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [detailVisible]);

  useEffect(() => {
    setPage(0);
  }, [pageSize]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: [
      "documents",
      "ok",
      debouncedSearch,
      debouncedFilterNom,
      debouncedFilterCarpeta,
      orderBy,
      orderDir,
      page,
      pageSize,
    ],
    queryFn: () =>
      listDocuments({
        status: "ok",
        q: debouncedSearch || undefined,
        proposed_name: debouncedFilterNom || undefined,
        company_folder: debouncedFilterCarpeta || undefined,
        order_by: orderBy ?? undefined,
        order: orderBy ? orderDir : undefined,
        limit: pageSize,
        offset: page * pageSize,
      }),
  });

  const updateNameMutation = useMutation({
    mutationFn: ({ id, proposed_name }: { id: number; proposed_name: string }) =>
      updateDocument(id, { proposed_name }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setSelected((prev) => (prev?.id === updated.id ? updated : prev));
      setEditName(updated.proposed_name ?? updated.original_name ?? "");
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [total, page, pageSize]);

  const showDetailToggle = items.length > 0;
  const splitClassName = [
    "split-view",
    !detailVisible && "split-view--auto",
    detailVisible && "split-view--detail-open",
    showDetailToggle && !detailVisible && "split-view--collapsed",
  ]
    .filter(Boolean)
    .join(" ");

  const emptyRows = Math.max(0, pageSize - items.length);

  function selectDoc(doc: DocumentOut) {
    setSelected(doc);
    setEditName(doc.proposed_name ?? doc.original_name ?? "");
    setDetailOpen(true);
  }

  function toggleDetailPanel() {
    if (!selected) return;
    setDetailOpen((open) => !open);
  }

  useEffect(() => {
    setPreviewRotation(0);
  }, [selected?.id]);

  function rotatePreview() {
    setPreviewRotation((deg) => (deg + 90) % 360);
  }

  function toggleSort(field: DocumentOrderBy) {
    if (orderBy === field) {
      setOrderDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setOrderBy(field);
    setOrderDir("asc");
  }

  function saveName() {
    if (!selected) return;

    const current = selected.proposed_name ?? selected.original_name ?? "";
    if (editName === current) return;

    updateNameMutation.mutate({ id: selected.id, proposed_name: editName });
  }

  return (
    <div className="page-fill">
      <PageHeader
        title="Documents"
        description="Documents aprovats a l'arxiu. Cliqui un fitxer per previsualitzar el PDF."
      />

      <div className={splitClassName}>
        {!detailVisible && (
          <div ref={listCardRef} className="card card-panel">
            <div className="toolbar-row">
              <input
                type="search"
                placeholder="Cerca per nom o carpeta…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => refetch()}>
                Actualitzar
              </button>
            </div>

            <details className="table-filters-advanced">
              <summary>Filtres</summary>
              <div className="field-grid" style={{ marginTop: "0.75rem" }}>
                <div className="field">
                  <label htmlFor="filter-nom">Filtrar per nom</label>
                  <input
                    id="filter-nom"
                    type="search"
                    placeholder="Nom del document"
                    value={filterNom}
                    onChange={(e) => setFilterNom(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="filter-carpeta">Filtrar per carpeta</label>
                  <input
                    id="filter-carpeta"
                    type="search"
                    placeholder="Carpeta d'empresa"
                    value={filterCarpeta}
                    onChange={(e) => setFilterCarpeta(e.target.value)}
                  />
                </div>
              </div>
            </details>

            {isLoading ? (
              <p className="empty-state">Carregant…</p>
            ) : items.length === 0 ? (
              <p className="empty-state">No hi ha documents aprovats.</p>
            ) : (
              <div className="table-responsive table-responsive--no-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>
                        <button
                          type="button"
                          className="table-sort-btn"
                          onClick={() => toggleSort("proposed_name")}
                        >
                          Nom {sortIndicator(orderBy === "proposed_name", orderDir)}
                        </button>
                      </th>
                      <th>
                        <button
                          type="button"
                          className="table-sort-btn"
                          onClick={() => toggleSort("company_folder")}
                        >
                          Carpeta {sortIndicator(orderBy === "company_folder", orderDir)}
                        </button>
                      </th>
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
                        <td>{doc.company_folder ?? "—"}</td>
                      </tr>
                    ))}
                    {emptyRows > 0 &&
                      Array.from({ length: emptyRows }).map((_, idx) => (
                        <tr key={`empty-${idx}`} className="data-table-row--empty" aria-hidden="true">
                          <td>&nbsp;</td>
                          <td>&nbsp;</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            {!isLoading && total > 0 && (
              <TablePagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
              />
            )}
          </div>
        )}

        {detailVisible && (
          <button
            type="button"
            className="split-detail-toggle"
            onClick={toggleDetailPanel}
            disabled={!selected}
            aria-expanded={detailVisible}
            aria-label={detailVisible ? "Tancar panell" : "Obrir panell"}
          >
            {detailVisible ? "◀" : "▶"}
          </button>
        )}

        {detailVisible && selected && (
          <>
            <div className="card card-panel split-detail-edit">
              <h3 className="card-title">Editar document</h3>

              <div className="field">
                <label htmlFor="doc-name">Nom</label>
                <input
                  id="doc-name"
                  value={editName}
                  disabled={updateNameMutation.isPending}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    }
                  }}
                />
              </div>

              <div className="field">
                <label>Carpeta</label>
                <p className="split-detail-summary">{selected.company_folder || "—"}</p>
              </div>
              <div className="field">
                <label>Resum</label>
                <p className="split-detail-summary">
                  {selected.summary || "—"}
                </p>
              </div>
            </div>

            <div className="card card-panel split-detail-preview">
              <div className="toolbar-row" style={{ marginBottom: 0 }}>
                <h3 className="card-title" style={{ marginBottom: 0, flex: "1 1 auto" }}>
                  Vista prèvia
                </h3>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={rotatePreview}
                  title="Rotar 90°"
                >
                  Rotar
                </button>
              </div>
              <PdfPreview
                documentId={selected.id}
                title={editName || selected.original_name || "PDF"}
                rotation={previewRotation}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
