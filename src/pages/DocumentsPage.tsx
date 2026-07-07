import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDocuments } from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import { PdfPreview } from "@/components/PdfPreview";
import { TablePagination } from "@/components/TablePagination";
import type { DocumentOut } from "@/api/types";

const MIN_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 25;

export function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(MIN_PAGE_SIZE);
  const [selected, setSelected] = useState<DocumentOut | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [previewRotation, setPreviewRotation] = useState(0);
  const listCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch]);

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
    queryKey: ["documents", "ok", debouncedSearch, page, pageSize],
    queryFn: () =>
      listDocuments({
        status: "ok",
        q: debouncedSearch || undefined,
        limit: pageSize,
        offset: page * pageSize,
      }),
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
              <div className="table-responsive table-responsive--no-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Empresa</th>
                      <th>Data</th>
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
                        <td>{doc.final_date ?? "—"}</td>
                      </tr>
                    ))}
                    {emptyRows > 0 &&
                      Array.from({ length: emptyRows }).map((_, idx) => (
                        <tr key={`empty-${idx}`} className="data-table-row--empty" aria-hidden="true">
                          <td>&nbsp;</td>
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
              <h3 className="card-title">
                {selected.proposed_name ?? selected.original_name}
              </h3>
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
                title={selected.proposed_name ?? selected.original_name ?? "PDF"}
                rotation={previewRotation}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
