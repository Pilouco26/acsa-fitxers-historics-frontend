interface TablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
}: TablePaginationProps) {
  if (total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * pageSize + 1;
  const end = Math.min((safePage + 1) * pageSize, total);

  return (
    <div className="table-pagination">
      <span className="table-pagination-info">
        {start}–{end} de {total}
      </span>
      <div className="table-pagination-controls">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={safePage <= 0}
          onClick={() => onPageChange(safePage - 1)}
        >
          Anterior
        </button>
        <span className="table-pagination-page">
          Pàgina {safePage + 1} de {totalPages}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={safePage >= totalPages - 1}
          onClick={() => onPageChange(safePage + 1)}
        >
          Següent
        </button>
      </div>
    </div>
  );
}
