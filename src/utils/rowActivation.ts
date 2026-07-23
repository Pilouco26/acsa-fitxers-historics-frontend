import type { KeyboardEvent } from "react";

/** Activate a clickable table row with Enter/Space (keyboard parity with click). */
export function onRowKeyActivate(
  e: KeyboardEvent<HTMLElement>,
  activate: () => void,
): void {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    activate();
  }
}
