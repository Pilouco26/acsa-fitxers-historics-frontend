import { useEffect, useId, useRef, type ReactNode } from "react";

type AppDialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Footer actions (buttons). */
  actions?: ReactNode;
  /** Extra class on the dialog panel. */
  className?: string;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Accessible modal dialog (Escape + backdrop + focus trap + scroll lock). */
export function AppDialog({
  open,
  title,
  onClose,
  children,
  actions,
  className,
}: AppDialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const prevFocus = document.activeElement;
    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
          ).filter(
            (el) =>
              !el.hasAttribute("disabled") &&
              el.getAttribute("aria-hidden") !== "true" &&
              el.tabIndex !== -1,
          )
        : [];

    const first = focusables()[0];
    (first ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;

      const nodes = focusables();
      if (nodes.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === firstNode || !panel.contains(active)) {
          e.preventDefault();
          lastNode.focus();
        }
      } else if (active === lastNode) {
        e.preventDefault();
        firstNode.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (prevFocus instanceof HTMLElement) prevFocus.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="app-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={["app-dialog", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h3 id={titleId} className="app-dialog-title">
          {title}
        </h3>
        <div className="app-dialog-body">{children}</div>
        {actions ? <div className="app-dialog-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
