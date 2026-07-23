export function LoadingSpinner({
  label,
  className,
  statusRole = true,
}: {
  label?: string;
  className?: string;
  /** When false, omit role=status (parent already announces). */
  statusRole?: boolean;
}) {
  return (
    <div
      className={["loading-spinner", className].filter(Boolean).join(" ")}
      role={statusRole ? "status" : undefined}
      aria-label={statusRole ? (label ?? "Carregant") : undefined}
    >
      <span className="loading-spinner__ring" aria-hidden="true" />
      {label ? (
        <span className="loading-spinner__label" aria-hidden={!statusRole}>
          {label}
        </span>
      ) : null}
    </div>
  );
}
