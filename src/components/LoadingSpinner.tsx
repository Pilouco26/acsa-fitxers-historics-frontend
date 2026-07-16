export function LoadingSpinner({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={["loading-spinner", className].filter(Boolean).join(" ")}
      role="status"
      aria-label={label ?? "Carregant"}
    >
      <span className="loading-spinner__ring" aria-hidden="true" />
      {label ? <span className="loading-spinner__label">{label}</span> : null}
    </div>
  );
}
