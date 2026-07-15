import type { DocumentOut } from "@/api/types";

export interface DeleteDocumentButtonProps {
  document: DocumentOut;
  isPending?: boolean;
  disabled?: boolean;
  onDelete: (doc: DocumentOut) => void | Promise<void>;
  className?: string;
}

function documentLabel(doc: DocumentOut): string {
  return doc.proposed_name ?? doc.original_name ?? "aquest document";
}

/**
 * Shared delete action for document detail panels.
 */
export function DeleteDocumentButton({
  document,
  isPending = false,
  disabled = false,
  onDelete,
  className,
}: DeleteDocumentButtonProps) {
  async function handleClick() {
    const label = documentLabel(document);
    const ok = window.confirm(
      `Segur que voleu eliminar "${label}"? Es mourà a _DELETED i es podrà recuperar des de Recuperació.`,
    );
    if (!ok) return;
    await onDelete(document);
  }

  return (
    <button
      type="button"
      className={["btn btn-danger btn-sm", className].filter(Boolean).join(" ")}
      onClick={handleClick}
      disabled={disabled || isPending}
      title="Eliminar document"
    >
      {isPending ? "Eliminant…" : "Eliminar"}
    </button>
  );
}
