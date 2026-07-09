import { useEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  deleteDocument,
  listDocuments,
  updateDocument,
} from "@/api/client";
import { DeleteDocumentButton } from "@/components/DeleteDocumentButton";
import { PageHeader } from "@/components/PageHeader";
import { PdfPreview, releaseDocumentPreview } from "@/components/PdfPreview";
import { TablePagination } from "@/components/TablePagination";
import {
  DOCUMENT_LIST_MAX_PAGE_SIZE,
  DOCUMENT_LIST_MIN_PAGE_SIZE,
  DOCUMENT_STATUS_OK,
  DOCUMENT_STATUS_REVISIO,
  LIST_PANEL_ROW_HEIGHT_PX,
} from "@/constants/globals";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { DocumentOut } from "@/api/types";

export function RevisioPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DOCUMENT_LIST_MIN_PAGE_SIZE);

  const [selected, setSelected] = useState<DocumentOut | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [previewRotation, setPreviewRotation] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const listCardRef = useRef<HTMLDivElement>(null);
  const tableAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch]);

  const detailVisible = Boolean(selected && detailOpen);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["documents", DOCUMENT_STATUS_REVISIO, debouncedSearch, page, pageSize],
    queryFn: () =>
      listDocuments({
        status: DOCUMENT_STATUS_REVISIO,
        q: debouncedSearch || undefined,
        limit: pageSize,
        offset: page * pageSize,
      }),
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  useEffect(() => {
    // Keep rows-per-page responsive without introducing scrollbars.
    // The list panel unmounts in preview mode, so we must re-attach when it returns.
    if (detailVisible) return;

    const cardEl = listCardRef.current;
    const tableEl = tableAreaRef.current;
    if (!cardEl || !tableEl) return;

    const compute = () => {
      window.requestAnimationFrame(() => {
        const tableAreaHeight = tableEl.getBoundingClientRect().height;
        const headerHeight =
          tableEl.querySelector("thead")?.getBoundingClientRect().height ??
          LIST_PANEL_ROW_HEIGHT_PX;
        const bodyHeight = Math.max(0, tableAreaHeight - headerHeight);

        const next = Math.max(
          DOCUMENT_LIST_MIN_PAGE_SIZE,
          Math.min(
            DOCUMENT_LIST_MAX_PAGE_SIZE,
            Math.floor(bodyHeight / LIST_PANEL_ROW_HEIGHT_PX),
          ),
        );

        setPageSize((prev) => (prev === next ? prev : next));
      });
    };

    const raf = window.requestAnimationFrame(() => compute());
    const ro = new ResizeObserver(() => compute());
    ro.observe(cardEl);
    ro.observe(tableEl);

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [detailVisible, isLoading, isFetching]);

  useEffect(() => {
    if (total <= 0) return;
    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [total, page, pageSize]);

  const approveMutation = useMutation({
    mutationFn: () =>
      updateDocument(selected!.id, {
        proposed_name: editName,
        summary: editSummary,
        status: DOCUMENT_STATUS_OK,
        approve: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setSelected(null);
      setDetailOpen(false);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Error en aprovar");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Error en eliminar");
    },
  });

  function selectDoc(doc: DocumentOut) {
    setSelected(doc);
    setEditName(doc.proposed_name ?? "");
    setEditSummary(doc.summary ?? "");
    setDetailOpen(true);
    setError(null);
  }

  useEffect(() => {
    setPreviewRotation(0);
  }, [selected?.id]);

  function rotatePreview() {
    setPreviewRotation((deg) => (deg + 90) % 360);
  }

  async function forceCloseDocumentPreview(documentId: number): Promise<void> {
    // Abort fetch, blank iframe, and revoke blob URL before React unmounts.
    await releaseDocumentPreview(documentId);

    flushSync(() => {
      setDetailOpen(false);
      setSelected(null);
      setPreviewRotation(0);
    });

    // Catch any preview still registered after unmount (useLayoutEffect cleanup).
    await releaseDocumentPreview(documentId);
  }

  async function handleDelete(doc: DocumentOut) {
    setError(null);

    try {
      await forceCloseDocumentPreview(doc.id);
      await deleteMutation.mutateAsync(doc.id);
    } catch (err) {
      if (!(err instanceof ApiError)) {
        setError("Error en eliminar");
      }
    }
  }

  const splitClassName = [
    "split-view",
    !detailVisible && "split-view--auto",
    !detailVisible && "split-view--collapsed",
    detailVisible && "split-view--detail-open",
  ]
    .filter(Boolean)
    .join(" ");

  const emptyRows = Math.max(0, pageSize - items.length);

  const tableOverlayMessage =
    isLoading || (isFetching && items.length === 0)
      ? "Carregant…"
      : items.length === 0
        ? "No hi ha documents pendents de revisió."
        : null;

  return (
    <div className="page-fill">
      <PageHeader
        title="Revisió"
        description={
          <>
            Revisió de documents classificats. Cliqueu un fitxer per previsualitzar el PDF, ajustar el
            nom/resum i aprovar-lo.{" "}
            <span className="revisio-repeated-legend">
              El fons vermell indica possibles documents repetits.
            </span>
          </>
        }
      />

      {error && <div className="alert alert-error">{error}</div>}

      <div className={splitClassName}>
        {!detailVisible && (
          <div ref={listCardRef} className="card card-panel">
            <h3 className="card-title">Documents pendents de revisió</h3>
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

            <div
              ref={tableAreaRef}
              className="table-responsive table-responsive--no-scroll table-list-body"
            >
              {tableOverlayMessage && (
                <p className="table-list-overlay" role="status">
                  {tableOverlayMessage}
                </p>
              )}
              <table
                className="data-table data-table--list"
                style={{ "--page-size": pageSize } as CSSProperties}
              >
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Empresa</th>
                    <th>Tipus</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((doc) => (
                    <tr
                      key={doc.id}
                      className={[
                        selected?.id === doc.id && "selected",
                        doc.status === "repeated" && "data-table-row--repeated",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => selectDoc(doc)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{doc.proposed_name ?? doc.original_name ?? "—"}</td>
                      <td>{doc.company ?? "—"}</td>
                      <td>{doc.doc_type_ca ?? doc.doc_type ?? "—"}</td>
                      <td>{doc.final_date ?? "—"}</td>
                    </tr>
                  ))}
                  {emptyRows > 0 &&
                    Array.from({ length: emptyRows }).map((_, idx) => (
                      <tr key={`empty-${idx}`} className="data-table-row--empty" aria-hidden="true">
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {!isLoading && !isFetching && (
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
            onClick={() => setDetailOpen((open) => !open)}
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
                <label>Original</label>
                <p className="split-detail-summary">{selected.original_name ?? "—"}</p>
              </div>

              <div className="field">
                <label htmlFor="doc-name">Nom proposat</label>
                <input
                  id="doc-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="doc-summary">Resum</label>
                <textarea
                  id="doc-summary"
                  rows={6}
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                />
              </div>

              {selected.error && <div className="alert alert-error">{selected.error}</div>}

              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={approveMutation.isPending}
                  onClick={() => approveMutation.mutate()}
                >
                  Aprovar
                </button>
                <DeleteDocumentButton
                  document={selected}
                  isPending={deleteMutation.isPending}
                  disabled={approveMutation.isPending}
                  onDelete={handleDelete}
                />
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
                // Key ensures iframe/object URL is fully disposed when we clear selection.
                key={selected.id}
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
