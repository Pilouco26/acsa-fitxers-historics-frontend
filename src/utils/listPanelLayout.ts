import {
  DOCUMENT_LIST_PAGE_SIZE,
  LIST_PANEL_ROW_HEIGHT_PX,
} from "@/constants/globals";

/** Floor for row height when the panel is short (px). */
export const LIST_PANEL_ROW_HEIGHT_MIN_PX = 34;

export type ListPanelFit = {
  /** Exact table area height: (pageSize + 1) * rowHeight */
  height: number;
  rowHeight: number;
  pageSize: number;
};

/** Vertical space taken by card padding and non-table children (incl. margins). */
export function measureListPanelChrome(
  cardEl: HTMLElement,
  tableEl: HTMLElement,
): number {
  const cardStyle = getComputedStyle(cardEl);
  let used =
    parseFloat(cardStyle.paddingTop) + parseFloat(cardStyle.paddingBottom);

  for (const child of Array.from(cardEl.children)) {
    if (child === tableEl) continue;
    const style = getComputedStyle(child);
    used +=
      child.getBoundingClientRect().height +
      parseFloat(style.marginTop) +
      parseFloat(style.marginBottom);
  }

  return used;
}

/**
 * Fit pageSize + row height into the available height so the table never
 * overflows the card (which would clip the pagination bar under
 * `overflow: hidden`). Prefers DOCUMENT_LIST_PAGE_SIZE; shrinks pageSize
 * when filters/chrome leave too little room.
 */
export function fitListPanelLayout(availableHeight: number): ListPanelFit {
  const available = Math.max(0, Math.floor(availableHeight));

  let pageSize = DOCUMENT_LIST_PAGE_SIZE;
  let totalRows = pageSize + 1; // header + data rows
  let rowHeight = Math.floor(available / totalRows);

  if (rowHeight < LIST_PANEL_ROW_HEIGHT_MIN_PX) {
    const maxTotalRows = Math.max(
      2,
      Math.floor(available / LIST_PANEL_ROW_HEIGHT_MIN_PX),
    );
    pageSize = Math.max(1, Math.min(DOCUMENT_LIST_PAGE_SIZE, maxTotalRows - 1));
    totalRows = pageSize + 1;
    rowHeight = Math.max(
      LIST_PANEL_ROW_HEIGHT_MIN_PX,
      Math.floor(available / totalRows) || LIST_PANEL_ROW_HEIGHT_MIN_PX,
    );
  } else if (rowHeight === 0) {
    rowHeight = LIST_PANEL_ROW_HEIGHT_PX;
  }

  // Never exceed available height — keeps pagination visible in the card.
  const height = Math.min(available, rowHeight * totalRows);

  return { height, rowHeight, pageSize };
}

/** Apply a fitted layout onto the table area element. */
export function applyListPanelFit(
  tableEl: HTMLElement,
  fit: ListPanelFit,
): void {
  tableEl.style.flex = "0 0 auto";
  tableEl.style.height = `${fit.height}px`;
  tableEl.style.setProperty("--list-panel-row-height", `${fit.rowHeight}px`);
}

export function clearListPanelFit(tableEl: HTMLElement): void {
  tableEl.style.removeProperty("flex");
  tableEl.style.removeProperty("height");
  tableEl.style.removeProperty("--list-panel-row-height");
}
