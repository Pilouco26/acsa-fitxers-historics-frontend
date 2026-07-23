import { useEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ApiError,
  deleteDocument,
  listDocuments,
  updateDocument,
} from "@/api/client";
import { DeleteDocumentButton } from "@/components/DeleteDocumentButton";
import { BackendDocumentTranslatePanel } from "@/components/BackendDocumentTranslatePanel";
import { MediaReviewPanel } from "@/components/MediaReviewPanel";
import { PageHeader } from "@/components/PageHeader";
import { PanelEmptyActions, PanelSkeletonList } from "@/components/PanelStatus";
import {
  PdfPreview,
  releaseDocumentPreview,
  releaseFilePathPreview,
} from "@/components/PdfPreview";
import { TablePagination } from "@/components/TablePagination";
import {
  DOCUMENT_LIST_PAGE_SIZE,
  DOCUMENT_STATUS_OK,
  DOCUMENT_STATUS_REVISIO,
} from "@/constants/globals";
import { looksLikePassthroughSource } from "@/constants/translateLanguages";
import {
  applyListPanelFit,
  clearListPanelFit,
  fitListPanelLayout,
  measureListPanelChrome,
} from "@/utils/listPanelLayout";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePrefetchDocumentListPages } from "@/hooks/usePrefetchDocumentListPages";
import type { DocumentOut } from "@/api/types";
import { onRowKeyActivate } from "@/utils/rowActivation";

type ContentKind = "documents" | "media";

function parseContentKind(value: string | null): ContentKind | null {
  if (value === "documents" || value === "media") return value;
  return null;
}

function isRepeatedDocument(doc: DocumentOut): boolean {
  return (
    doc.status === "repeated" ||
    Boolean(doc.duplicate_path?.trim()) ||
    doc.duplicate === true ||
    doc.compare?.verdict?.toLowerCase() === "duplicate"
  );
}

function duplicateLabel(path: string | null | undefined): string {
  if (!path?.trim()) return "";
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
}

export function RevisioPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const pageActive = location.pathname === "/revisio";
  const wasPageActiveRef = useRef(pageActive);

  const [contentKind, setContentKind] = useState<ContentKind>(() => {
    return parseContentKind(searchParams.get("kind")) ?? "documents";
  });
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DOCUMENT_LIST_PAGE_SIZE);

  const [selected, setSelected] = useState<DocumentOut | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [previewRotation, setPreviewRotation] = useState(0);
  const [previewToolbarActionsHost, setPreviewToolbarActionsHost] =
    useState<HTMLDivElement | null>(null);
  const [compareToolbarActionsHost, setCompareToolbarActionsHost] =
    useState<HTMLDivElement | null>(null);
  const [originalToolbarActionsHost, setOriginalToolbarActionsHost] =
    useState<HTMLDivElement | null>(null);
  const [originalRotation, setOriginalRotation] = useState(0);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const listCardRef = useRef<HTMLDivElement>(null);
  const tableAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pageActive) return;
    const fromUrl = parseContentKind(searchParams.get("kind"));
    if (fromUrl) setContentKind(fromUrl);
  }, [pageActive, searchParams]);

  const selectContentKind = (kind: ContentKind) => {
    setContentKind(kind);
    navigate({ pathname: "/revisio", search: `?kind=${kind}` }, { replace: true });
  };

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch]);

  const detailVisible = Boolean(selected && detailOpen);
  const selectedIsRepeated = Boolean(selected && isRepeatedDocument(selected));
  const duplicatePath = selected?.duplicate_path?.trim() || null;
  const showOriginalCompare = compareOriginal && Boolean(duplicatePath);

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
    enabled: contentKind === "documents",
  });

  useEffect(() => {
    const becameActive = pageActive && !wasPageActiveRef.current;
    wasPageActiveRef.current = pageActive;
    if (!becameActive || contentKind !== "documents") return;
    void refetch();
  }, [pageActive, contentKind, refetch]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  usePrefetchDocumentListPages({
    enabled: contentKind === "documents",
    page,
    pageSize,
    total,
    scopeKey: debouncedSearch,
    getPageOptions: (targetPage) => ({
      queryKey: [
        "documents",
        DOCUMENT_STATUS_REVISIO,
        debouncedSearch,
        targetPage,
        pageSize,
      ],
      queryFn: () =>
        listDocuments({
          status: DOCUMENT_STATUS_REVISIO,
          q: debouncedSearch || undefined,
          limit: pageSize,
          offset: targetPage * pageSize,
        }),
    }),
  });

  useEffect(() => {
    // Keep rows-per-page responsive without introducing scrollbars.
    // The list panel unmounts in preview mode, so we must re-attach when it returns.
    if (contentKind !== "documents" || detailVisible) return;

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
  }, [contentKind, detailVisible, isLoading, isFetching]);

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
      queryClient.invalidateQueries({ queryKey: ["revisio-count"] });
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
      queryClient.invalidateQueries({ queryKey: ["revisio-count"] });
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
    setCompareOriginal(false);
    setOriginalRotation(0);
    setTranslateOpen(false);
    setError(null);
  }

  useEffect(() => {
    setPreviewRotation(0);
    setOriginalRotation(0);
    setCompareOriginal(false);
    setTranslateOpen(false);
  }, [selected?.id]);

  function rotatePreview() {
    setPreviewRotation((deg) => (deg + 90) % 360);
  }

  function rotateOriginalPreview() {
    setOriginalRotation((deg) => (deg + 90) % 360);
  }

  async function forceCloseDocumentPreview(
    documentId: number,
    alsoFilePath?: string | null,
  ): Promise<void> {
    // Abort fetch, blank iframe, and revoke blob URL before React unmounts.
    await releaseDocumentPreview(documentId);
    if (alsoFilePath) {
      await releaseFilePathPreview(alsoFilePath);
    }

    flushSync(() => {
      setDetailOpen(false);
      setSelected(null);
      setPreviewRotation(0);
      setOriginalRotation(0);
      setCompareOriginal(false);
      setTranslateOpen(false);
    });

    // Catch any preview still registered after unmount (useLayoutEffect cleanup).
    await releaseDocumentPreview(documentId);
    if (alsoFilePath) {
      await releaseFilePathPreview(alsoFilePath);
    }
  }

  async function handleDelete(doc: DocumentOut) {
    setError(null);

    try {
      await forceCloseDocumentPreview(doc.id, duplicatePath);
      await deleteMutation.mutateAsync(doc.id);
    } catch (err) {
      if (!(err instanceof ApiError)) {
        setError("Error en eliminar");
      }
    }
  }

  const translateFocusOpen = translateOpen;

  const splitClassName = [
    "split-view",
    !detailVisible && "split-view--auto",
    !detailVisible && "split-view--collapsed",
    detailVisible && "split-view--detail-open",
    showOriginalCompare && !translateFocusOpen && "split-view--compare",
    detailVisible && translateFocusOpen && "split-view--translate-focus",
  ]
    .filter(Boolean)
    .join(" ");

  const emptyRows = Math.max(0, pageSize - items.length);

  const isLoadingEmpty =
    isLoading || (isFetching && items.length === 0);
  const isEmpty = !isLoadingEmpty && items.length === 0;
  const hasActiveSearch = Boolean(search.trim() || debouncedSearch.trim());
  const isSearchNoMatch = isEmpty && hasActiveSearch;
  const isInboxEmpty = isEmpty && !hasActiveSearch;

  return (
    <div className="page-fill">
      <PageHeader
        title="Revisió"
        description={
          contentKind === "documents" ? (
            <>
              Revisió de documents classificats. Cliqueu un fitxer per
              previsualitzar el PDF, ajustar el nom/resum i aprovar-lo.{" "}
              <span className="revisio-repeated-legend">
                El fons vermell indica possibles documents repetits.
              </span>
            </>
          ) : (
            "Reviseu què passa a l'escena i on (resum i ubicació), ajusteu el nom, aproveu al catàleg o descarteu el fitxer."
          )
        }
      />

      <div className="field content-kind-field">
        <label>Tipus de contingut</label>
        <div
          className="segmented-control"
          role="group"
          aria-label="Tipus de contingut"
        >
          <button
            type="button"
            className={contentKind === "documents" ? "active" : undefined}
            onClick={() => selectContentKind("documents")}
          >
            Documents
          </button>
          <button
            type="button"
            className={contentKind === "media" ? "active" : undefined}
            onClick={() => selectContentKind("media")}
          >
            Fotos / vídeos
          </button>
        </div>
      </div>

      {contentKind === "media" ? (
        <MediaReviewPanel />
      ) : (
        <>
      {error && <div className="alert alert-error">{error}</div>}

      <div className={splitClassName}>
        {!detailVisible && (
          <div ref={listCardRef} className="card card-panel">
            <h3 className="card-title">Documents pendents de revisió</h3>

            {!isInboxEmpty && (
              <div className="toolbar-row">
                <input
                  type="search"
                  placeholder="Cerca per nom o empresa…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}

            {isLoadingEmpty ? (
              <PanelSkeletonList rows={pageSize} />
            ) : isSearchNoMatch ? (
              <PanelEmptyActions title="Cap document no coincideix amb la cerca.">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSearch("")}
                >
                  Netejar cerca
                </button>
              </PanelEmptyActions>
            ) : isInboxEmpty ? (
              <PanelEmptyActions title="No hi ha documents pendents de revisió.">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate("/documents")}
                >
                  Continuar a classificats
                </button>
              </PanelEmptyActions>
            ) : (
              <>
                <div
                  ref={tableAreaRef}
                  className="table-responsive table-responsive--no-scroll table-list-body"
                >
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
                            isRepeatedDocument(doc) && "data-table-row--repeated",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          tabIndex={0}
                          onClick={() => selectDoc(doc)}
                          onKeyDown={(e) =>
                            onRowKeyActivate(e, () => selectDoc(doc))
                          }
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
              </>
            )}
          </div>
        )}

        {detailVisible && (
          <button
            type="button"
            className="split-detail-toggle"
            onClick={() => {
              // In translation mode, first return to document detail.
              if (translateFocusOpen) {
                setTranslateOpen(false);
                return;
              }
              setDetailOpen((open) => !open);
            }}
            disabled={!selected}
            aria-expanded={detailVisible}
            aria-label={detailVisible ? "Tancar panell" : "Obrir panell"}
          >
            {detailVisible ? "◀" : "▶"}
          </button>
        )}

        {detailVisible && selected && (
          <>
            {!translateFocusOpen && (
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

              {selectedIsRepeated && (
                <div className="alert alert-info revisio-duplicate-banner">
                  <p className="m-0">
                    Possible duplicat
                    {duplicatePath ? `: ${duplicateLabel(duplicatePath)}` : ""}.
                  </p>
                  {duplicatePath ? (
                    <div className="toolbar-row toolbar-row--followup">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setCompareOriginal((open) => !open)}
                      >
                        {showOriginalCompare
                          ? "Tancar comparació"
                          : "Comparar amb l'original"}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 m-0">
                      No s'ha trobat el camí del document original.
                    </p>
                  )}
                </div>
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
                <DeleteDocumentButton
                  document={selected}
                  isPending={deleteMutation.isPending}
                  disabled={approveMutation.isPending}
                  onDelete={handleDelete}
                />
              </div>
            </div>
            )}

            <div className="card card-panel split-detail-preview">
              {translateOpen &&
              !looksLikePassthroughSource(selected.language) ? (
                <BackendDocumentTranslatePanel
                  documentId={selected.id}
                  translatedText={selected.translated_text}
                  translatedPages={selected.translated_pages}
                  layoutPages={selected.layout_pages}
                  layoutPdfUrl={selected.layout_pdf_url}
                  documentLanguage={selected.language}
                  docType={selected.doc_type}
                  docTypeCa={selected.doc_type_ca}
                  open
                  onTranslated={(result) => {
                    setSelected((prev) =>
                      prev && prev.id === result.document_id
                        ? {
                            ...prev,
                            translated_text: result.translated_text,
                            translated_pages: result.translated_pages,
                            layout_pages: result.layout_pages,
                            layout_pdf_url: result.layout_pdf_url,
                          }
                        : prev,
                    );
                    void queryClient.invalidateQueries({
                      queryKey: ["documents"],
                    });
                  }}
                />
              ) : showOriginalCompare &&
                duplicatePath ? (
                <div className="split-detail-compare">
                  <div className="split-detail-compare-pane">
                    <div className="toolbar-row toolbar-row--flush">
                      <h3 className="card-title card-title--grow">
                        Aquest document
                      </h3>
                      {!looksLikePassthroughSource(selected.language) && (
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        aria-pressed={false}
                        title="Mostrar el text traduït del document (resultat al costat)"
                        onClick={() => {
                          setTranslateOpen(true);
                        }}
                      >
                        Traduir
                      </button>
                      )}
                      <div
                        ref={setCompareToolbarActionsHost}
                        className="pdf-preview-toolbar-actions-host"
                      />
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
                      key={`current-${selected.id}`}
                      documentId={selected.id}
                      title={selected.proposed_name ?? selected.original_name ?? "PDF"}
                      rotation={previewRotation}
                      toolbarActionsHost={compareToolbarActionsHost}
                    />
                  </div>
                  <div className="split-detail-compare-pane">
                    <div className="toolbar-row toolbar-row--flush">
                      <h3 className="card-title card-title--grow">
                        Original
                      </h3>
                      <div
                        ref={setOriginalToolbarActionsHost}
                        className="pdf-preview-toolbar-actions-host"
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={rotateOriginalPreview}
                        title="Rotar 90°"
                      >
                        Rotar
                      </button>
                    </div>
                    <PdfPreview
                      key={`original-${duplicatePath}`}
                      filePath={duplicatePath}
                      title={duplicateLabel(duplicatePath)}
                      rotation={originalRotation}
                      toolbarActionsHost={originalToolbarActionsHost}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="toolbar-row toolbar-row--flush">
                    <h3 className="card-title card-title--grow">
                      Vista prèvia
                    </h3>
                    {!looksLikePassthroughSource(selected.language) && (
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      aria-pressed={false}
                      title="Mostrar el text traduït del document (resultat al costat)"
                      onClick={() => {
                        setTranslateOpen(true);
                      }}
                    >
                      Traduir
                    </button>
                    )}
                    <div
                      ref={setPreviewToolbarActionsHost}
                      className="pdf-preview-toolbar-actions-host"
                    />
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
                    toolbarActionsHost={previewToolbarActionsHost}
                  />
                </>
              )}
            </div>
          </>
        )}
      </div>
        </>
      )}
    </div>
  );
}
