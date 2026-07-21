type HubBackButtonProps = {
  onClick: () => void;
  label?: string;
  className?: string;
};

/** Grey ◀ control shared by hub navigation and split-detail panels. */
export function HubBackButton({
  onClick,
  label = "Tornar a carpetes",
  className,
}: HubBackButtonProps) {
  return (
    <button
      type="button"
      className={["split-detail-toggle", "hub-back-toggle", className]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      ◀
    </button>
  );
}
