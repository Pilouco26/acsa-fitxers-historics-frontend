import type { ReactNode } from "react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { DOCUMENT_LIST_PAGE_SIZE } from "@/constants/globals";

/** Centered loading block for list/card panels (uses existing spinner styles). */
export function PanelLoading({
  label = "Carregant…",
}: {
  label?: string;
}) {
  return (
    <div
      className="empty-state empty-state--actions empty-state--loading"
      role="status"
      aria-label={label}
    >
      <LoadingSpinner label={label} statusRole={false} />
    </div>
  );
}

/** Shared empty / error CTA block for Revisió-style panels. */
export function PanelEmptyActions({
  title,
  children,
  role = "status",
}: {
  title: string;
  children?: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div className="empty-state empty-state--actions" role={role}>
      <p className="empty-state__title">{title}</p>
      {children ? <div className="btn-row">{children}</div> : null}
    </div>
  );
}

/** Skeleton rows that reserve list height while data loads. */
export function PanelSkeletonList({
  rows = DOCUMENT_LIST_PAGE_SIZE,
  label = "Carregant…",
}: {
  rows?: number;
  label?: string;
}) {
  const count = Math.max(1, rows);
  return (
    <div
      className="panel-skeleton-list"
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <span
          key={idx}
          className="skeleton panel-skeleton-list__row"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
