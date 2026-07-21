interface TablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Compact controls for narrow viewports (icon chevrons, shorter labels). */
  compact?: boolean;
}

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  compact = false,
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const start = total === 0 ? 0 : safePage * pageSize + 1;
  const end = total === 0 ? 0 : Math.min((safePage + 1) * pageSize, total);

  // Always render the same markup (even with zero results) so the panel's
  // height stays constant instead of collapsing when the list is empty.
  return (
    <div className={`table-pagination${compact ? " table-pagination--compact" : ""}`}>
      <span className="table-pagination-info">
        {start}–{end} de {total}
      </span>
      <div className="table-pagination-controls">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={page <= 0 || total === 0}
          onClick={() => onPageChange(page - 1)}
          aria-label="Anterior"
          title="Anterior"
        >
          {compact ? "‹" : "Anterior"}
        </button>
        <span className="table-pagination-page">
          {compact
            ? `${safePage + 1} / ${totalPages}`
            : `Pàgina ${safePage + 1} de ${totalPages}`}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={page >= totalPages - 1 || total === 0}
          onClick={() => onPageChange(page + 1)}
          aria-label="Següent"
          title="Següent"
        >
          {compact ? "›" : "Següent"}
        </button>
      </div>
    </div>
  );
}
