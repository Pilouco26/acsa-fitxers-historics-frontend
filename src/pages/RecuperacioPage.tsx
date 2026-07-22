import { useEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  listDeletedDocuments,
  restoreDocument,
} from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import { PdfPreview, releaseDocumentPreview } from "@/components/PdfPreview";
import { TablePagination } from "@/components/TablePagination";
import { useAuth } from "@/contexts/AuthContext";
import { DOCUMENT_LIST_PAGE_SIZE } from "@/constants/globals";
import {
  applyListPanelFit,
  clearListPanelFit,
  fitListPanelLayout,
  measureListPanelChrome,
} from "@/utils/listPanelLayout";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePrefetchDocumentListPages } from "@/hooks/usePrefetchDocumentListPages";
import type { DocumentOut } from "@/api/types";

function formatDeletedAt(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ca-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function RecuperacioPage() {
  const queryClient = useQueryClient();
  const { apiMode } = useAuth();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DOCUMENT_LIST_PAGE_SIZE);

  const [selected, setSelected] = useState<DocumentOut | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const listCardRef = useRef<HTMLDivElement>(null);
  const tableAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, apiMode]);

  const detailVisible = Boolean(selected && detailOpen);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [
      "documents",
      "deleted",
      debouncedSearch,
      page,
      pageSize,
      apiMode ?? "ALL",
    ],
    queryFn: () =>
      listDeletedDocuments({
        q: debouncedSearch || undefined,
        limit: pageSize,
        offset: page * pageSize,
        ...(apiMode ? { mode: apiMode } : {}),
      }),
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  usePrefetchDocumentListPages({
    enabled: true,
    page,
    pageSize,
    total,
    scopeKey: `${debouncedSearch}:${apiMode ?? "ALL"}`,
    getPageOptions: (targetPage) => ({
      queryKey: [
        "documents",
        "deleted",
        debouncedSearch,
        targetPage,
        pageSize,
        apiMode ?? "ALL",
      ],
      queryFn: () =>
        listDeletedDocuments({
          q: debouncedSearch || undefined,
          limit: pageSize,
          offset: targetPage * pageSize,
          ...(apiMode ? { mode: apiMode } : {}),
        }),
    }),
  });

  useEffect(() => {
    if (detailVisible) return;

    const cardEl = listCardRef.current;
    const tableEl = tableAreaRef.current;
    if (!cardEl || !tableEl) return;

    const compute = () => {
      window.requestAnimationFrame(() => {
        const available =
          cardEl.getBoundingClientRect().height -
          measureListPanelChrome(cardEl, tableEl);
        const fit = fitListPanelLayout(available);
        applyListPanelFit(tableEl, fit);
        setPageSize((prev) => (prev === fit.pageSize ? prev : fit.pageSize));
      });
    };

    const raf = window.requestAnimationFrame(() => compute());
    const ro = new ResizeObserver(() => compute());
    ro.observe(cardEl);

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      clearListPanelFit(tableEl);
    };
  }, [detailVisible, isLoading, isFetching]);

  useEffect(() => {
    if (total <= 0) return;
    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [total, page, pageSize]);

  const restoreMutation = useMutation({
    mutationFn: (id: number) => restoreDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Error en recuperar");
    },
  });

  function selectDoc(doc: DocumentOut) {
    setSelected(doc);
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
    await releaseDocumentPreview(documentId);
    flushSync(() => {
      setDetailOpen(false);
      setSelected(null);
      setPreviewRotation(0);
    });
    await releaseDocumentPreview(documentId);
  }

  async function handleRestore(doc: DocumentOut) {
    const label = doc.proposed_name ?? doc.original_name ?? "aquest document";
    const ok = window.confirm(
      `Segur que voleu recuperar "${label}"? Es mourà fora de _DELETED.`,
    );
    if (!ok) return;

    setError(null);
    try {
      await forceCloseDocumentPreview(doc.id);
      await restoreMutation.mutateAsync(doc.id);
    } catch (err) {
      if (!(err instanceof ApiError)) {
        setError("Error en recuperar");
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
        ? "No hi ha documents a _DELETED."
        : null;

  return (
    <div className="page-fill">
      <PageHeader
        title="Recuperació"
        description="Documents soft-deleted de la carpeta _DELETED. Cliqueu un fitxer per previsualitzar-lo i recuperar-lo."
      />

      {error && <div className="alert alert-error">{error}</div>}

      <div className={splitClassName}>
        {!detailVisible && (
          <div ref={listCardRef} className="card card-panel">
            <h3 className="card-title">Documents eliminats</h3>
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
                    <th>Carpeta</th>
                    <th>Eliminat</th>
                    <th>Estat</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((doc) => (
                    <tr
                      key={doc.id}
                      className={selected?.id === doc.id ? "selected" : undefined}
                      onClick={() => selectDoc(doc)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{doc.proposed_name ?? doc.original_name ?? "—"}</td>
                      <td>{doc.company_folder ?? "—"}</td>
                      <td>{formatDeletedAt(doc.deleted_at)}</td>
                      <td>{doc.status ?? "—"}</td>
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
              <h3 className="card-title">Document eliminat</h3>

              <div className="field">
                <label>Original</label>
                <p className="split-detail-summary">{selected.original_name ?? "—"}</p>
              </div>

              <div className="field">
                <label>Nom proposat</label>
                <p className="split-detail-summary">{selected.proposed_name ?? "—"}</p>
              </div>

              <div className="field">
                <label>Carpeta anterior</label>
                <p className="split-detail-summary">{selected.company_folder ?? "—"}</p>
              </div>

              <div className="field">
                <label>Eliminat</label>
                <p className="split-detail-summary">{formatDeletedAt(selected.deleted_at)}</p>
              </div>

              <div className="field">
                <label>Resum</label>
                <p className="split-detail-summary">{selected.summary ?? "—"}</p>
              </div>

              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={restoreMutation.isPending}
                  onClick={() => handleRestore(selected)}
                >
                  {restoreMutation.isPending ? "Recuperant…" : "Recuperar"}
                </button>
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
