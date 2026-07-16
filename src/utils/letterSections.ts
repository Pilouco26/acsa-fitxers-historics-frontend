import type {
  TranslatedPage,
  TranslatedPageSegment,
  TranslatedPageSegmentRole,
} from "@/api/types";

export const LETTER_SECTION_MARKERS = [
  {
    id: "header" as const,
    marker: "[Capçalera / membrete]",
    label: "Capçalera",
    primary: false,
  },
  {
    id: "body" as const,
    marker: "[Cos de la carta]",
    label: "Cos",
    primary: true,
  },
  {
    id: "footer" as const,
    marker: "[Peu / contacte]",
    label: "Peu",
    primary: false,
  },
];

export type LetterSectionId = (typeof LETTER_SECTION_MARKERS)[number]["id"];

export type LetterSection = {
  id: LetterSectionId;
  label: string;
  primary: boolean;
  text: string;
};

export type LetterLayout =
  | "body"
  | "header-body"
  | "body-footer"
  | "header-body-footer";

const SEGMENT_ROLE_META: Record<
  TranslatedPageSegmentRole,
  { label: string; primary: boolean }
> = {
  header: { label: "Capçalera", primary: false },
  body: { label: "Cos", primary: true },
  footer: { label: "Peu", primary: false },
};

/** ~top 12% / bottom 12% bands for OCR geometry fallback. */
const OCR_HEADER_BAND = 0.12;
const OCR_FOOTER_BAND = 0.12;
const OCR_MIN_LINES_FOR_LAYOUT = 4;

export function sectionsFromSegments(
  segments: TranslatedPageSegment[] | null | undefined,
): LetterSection[] | null {
  if (!segments?.length) return null;

  const sections: LetterSection[] = [];
  for (const segment of segments) {
    const meta = SEGMENT_ROLE_META[segment.role];
    if (!meta) continue;
    sections.push({
      id: segment.role,
      label: meta.label,
      primary: meta.primary,
      text: segment.text.trim(),
    });
  }
  return sections.length > 0 ? sections : null;
}

/** Parse `[Capçalera…]` / `[Cos…]` / `[Peu…]` sections when present. */
export function parseLetterSections(text: string): LetterSection[] | null {
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return null;

  const hasMarker = LETTER_SECTION_MARKERS.some(({ marker }) =>
    trimmed.includes(marker),
  );
  if (!hasMarker) return null;

  const positions = LETTER_SECTION_MARKERS.map((section) => ({
    ...section,
    index: trimmed.indexOf(section.marker),
  }))
    .filter((section) => section.index >= 0)
    .sort((a, b) => a.index - b.index);

  if (positions.length === 0) return null;

  return positions.map((section, i) => {
    const start = section.index + section.marker.length;
    const end =
      i + 1 < positions.length ? positions[i + 1].index : trimmed.length;
    return {
      id: section.id,
      label: section.label,
      primary: section.primary,
      text: trimmed.slice(start, end).trim(),
    };
  });
}

/**
 * Prefer structured `segments`; fall back to labeled-text markers.
 */
export function resolveLetterSections(
  page: Pick<TranslatedPage, "text" | "segments">,
): LetterSection[] | null {
  const sections =
    sectionsFromSegments(page.segments) ?? parseLetterSections(page.text);
  if (!sections) return null;
  return sections.map((section) => ({
    ...section,
    text: compactLetterText(section.text),
  }));
}

export function pageHasMetaSections(
  page: Pick<TranslatedPage, "text" | "segments">,
): boolean {
  const sections = resolveLetterSections(page);
  return Boolean(sections?.some((section) => !section.primary && section.text));
}

export function letterLayoutForSections(
  sections: LetterSection[],
  showLetterhead: boolean,
): { visible: LetterSection[]; layout: LetterLayout } {
  const visible = sections.filter(
    (section) => section.primary || showLetterhead,
  );
  const metaCount = visible.filter((section) => !section.primary).length;
  const layout: LetterLayout =
    metaCount === 0
      ? "body"
      : metaCount >= 2
        ? "header-body-footer"
        : visible[0]?.primary
          ? "body-footer"
          : "header-body";
  return { visible, layout };
}

type LineWithBox = {
  text?: string;
  translated?: string;
  bbox: { y0: number; y1: number };
};

/**
 * Infer Capçalera / Cos / Peu from OCR line positions when markers are absent.
 * Returns null when the page is too short or has no clear body + meta split.
 */
export function inferLetterSectionsFromOcrLines(
  lines: LineWithBox[],
  pageHeight: number,
): LetterSection[] | null {
  if (pageHeight <= 0 || lines.length < OCR_MIN_LINES_FOR_LAYOUT) return null;

  const headerCut = pageHeight * OCR_HEADER_BAND;
  const footerCut = pageHeight * (1 - OCR_FOOTER_BAND);

  const header: string[] = [];
  const body: string[] = [];
  const footer: string[] = [];

  const sorted = [...lines].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  for (const line of sorted) {
    const text = (line.translated ?? line.text ?? "").trim();
    if (!text) continue;
    const midY = (line.bbox.y0 + line.bbox.y1) / 2;
    if (midY < headerCut) header.push(text);
    else if (midY > footerCut) footer.push(text);
    else body.push(text);
  }

  if (body.length === 0) return null;
  if (header.length === 0 && footer.length === 0) return null;

  return [
    {
      id: "header",
      label: "Capçalera",
      primary: false,
      text: compactLetterText(header.join("\n")),
    },
    {
      id: "body",
      label: "Cos",
      primary: true,
      text: compactLetterText(body.join("\n")),
    },
    {
      id: "footer",
      label: "Peu",
      primary: false,
      text: compactLetterText(footer.join("\n")),
    },
  ];
}

/**
 * Drop blank lines and collapse runs of newlines that don't separate real content.
 */
export function compactLetterText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .trim();
}

/**
 * Resolve letter sections for a client OCR page result.
 * Prefer markers in plain text; fall back to OCR geometry.
 */
export function resolveOcrLetterSections(options: {
  plainParagraphs: string[];
  lines: LineWithBox[];
  pageHeight: number;
}): LetterSection[] | null {
  const fromMarkers = parseLetterSections(
    compactLetterText(options.plainParagraphs.join("\n")),
  );
  if (fromMarkers) {
    return fromMarkers.map((section) => ({
      ...section,
      text: compactLetterText(section.text),
    }));
  }
  return inferLetterSectionsFromOcrLines(options.lines, options.pageHeight);
}
