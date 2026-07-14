import {
  DOCUMENT_LIST_MAX_PAGE_SIZE,
  DOCUMENT_LIST_MIN_PAGE_SIZE,
  LIST_PANEL_ROW_HEIGHT_PX,
} from "@/constants/globals";

/** Allowed row heights when fitting table area (px). */
export const LIST_PANEL_ROW_HEIGHT_MIN_PX = 34;
export const LIST_PANEL_ROW_HEIGHT_MAX_PX = 48;

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
 * Pick integer rowHeight + pageSize so tableHeight % rowHeight === 0
 * (header counts as one row). Prefers little shrink from available height,
 * then rowHeight near the preferred size, then more visible rows.
 */
export function fitListPanelLayout(availableHeight: number): ListPanelFit {
  const available = Math.max(
    0,
    Math.floor(availableHeight),
  );
  const minTotalRows = DOCUMENT_LIST_MIN_PAGE_SIZE + 1;
  const maxTotalRows = DOCUMENT_LIST_MAX_PAGE_SIZE + 1;
  const maxShrink = LIST_PANEL_ROW_HEIGHT_MAX_PX;

  let best: (ListPanelFit & { score: number }) | null = null;

  for (let shrink = 0; shrink <= maxShrink; shrink++) {
    const height = available - shrink;
    if (height < minTotalRows * LIST_PANEL_ROW_HEIGHT_MIN_PX) break;

    for (
      let rowHeight = LIST_PANEL_ROW_HEIGHT_MIN_PX;
      rowHeight <= LIST_PANEL_ROW_HEIGHT_MAX_PX;
      rowHeight++
    ) {
      if (height % rowHeight !== 0) continue;

      const totalRows = height / rowHeight;
      if (totalRows < minTotalRows || totalRows > maxTotalRows) continue;

      const pageSize = totalRows - 1;
      const score =
        shrink * 1_000 +
        Math.abs(rowHeight - LIST_PANEL_ROW_HEIGHT_PX) * 10 -
        pageSize;

      if (!best || score < best.score) {
        best = { height, rowHeight, pageSize, score };
      }
    }

    // Exact fit with no/little shrink is enough once found at this shrink.
    if (best && best.score < 1_000) break;
  }

  if (best) {
    return {
      height: best.height,
      rowHeight: best.rowHeight,
      pageSize: best.pageSize,
    };
  }

  // Fallback: classic floor fit (may leave a tiny unused strip if clamps hit).
  const rowHeight = LIST_PANEL_ROW_HEIGHT_PX;
  const pageSize = Math.max(
    DOCUMENT_LIST_MIN_PAGE_SIZE,
    Math.min(
      DOCUMENT_LIST_MAX_PAGE_SIZE,
      Math.floor(available / rowHeight) - 1,
    ),
  );
  return {
    height: rowHeight * (pageSize + 1),
    rowHeight,
    pageSize,
  };
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
