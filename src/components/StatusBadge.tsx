export function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "pending";
  const cls =
    s === "ok"
      ? "badge-ok"
      : s === "revisio"
        ? "badge-revisio"
        : s === "repeated"
          ? "badge-repeated"
        : s === "error"
          ? "badge-error"
          : "badge-pending";

  const labels: Record<string, string> = {
    ok: "Aprovat",
    revisio: "Revisió",
    repeated: "Repetit",
    error: "Error",
    pendent: "Pendent",
    pending: "Pendent",
  };

  return <span className={`badge ${cls}`}>{labels[s] ?? s}</span>;
}
