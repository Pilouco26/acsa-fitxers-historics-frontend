import type { TranslatedPage } from "@/api/types";
import { normalizeTranslateLanguage } from "@/constants/translateLanguages";
import { splitDocumentBlocks } from "@/utils/ocrTranslateHelpers";

const LETTER_SECTION_MARKERS = [
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

type LetterSectionId = (typeof LETTER_SECTION_MARKERS)[number]["id"];

type LetterSection = {
  id: LetterSectionId;
  label: string;
  primary: boolean;
  text: string;
};

const LETTER_DOC_TYPES = new Set([
  "letter",
  "bank_letter",
  "carta",
  "lletra banc",
]);

function isLetterDocType(
  docType?: string | null,
  docTypeCa?: string | null,
): boolean {
  const values = [docType, docTypeCa]
    .filter(Boolean)
    .map((value) => value!.trim().toLowerCase());
  return values.some((value) => LETTER_DOC_TYPES.has(value));
}

function looksLikePassthroughSource(language?: string | null): boolean {
  const normalized = normalizeTranslateLanguage(language);
  return normalized === "ca" || normalized === "es";
}

/** Parse `[Capçalera…]` / `[Cos…]` / `[Peu…]` sections when present. */
function parseLetterSections(text: string): LetterSection[] | null {
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

function normalizeTranslatedPages(
  pages: TranslatedPage[] | null | undefined,
): TranslatedPage[] {
  if (!pages?.length) return [];
  return [...pages].sort((a, b) => a.page - b.page);
}

function PagePlainContent({ text }: { text: string }) {
  const blocks = splitDocumentBlocks(text);
  if (blocks.length === 0) {
    return (
      <p className="empty-state" style={{ padding: "1.25rem" }}>
        (Pàgina sense text)
      </p>
    );
  }
  return (
    <div className="pdf-ocr-page-plain">
      {blocks.map((para, index) => (
        <p key={`${index}-${para.slice(0, 32)}`}>{para}</p>
      ))}
    </div>
  );
}

function PageLetterContent({ sections }: { sections: LetterSection[] }) {
  return (
    <div className="backend-translate-letter">
      {sections.map((section) => (
        <section
          key={section.id}
          className={`backend-translate-letter-section${
            section.primary
              ? " backend-translate-letter-section--primary"
              : " backend-translate-letter-section--meta"
          }`}
        >
          <h5 className="backend-translate-letter-label">{section.label}</h5>
          {section.text ? (
            <PagePlainContent text={section.text} />
          ) : (
            <p className="empty-state" style={{ padding: "0.5rem 0" }}>
              —
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

function TranslationPageBlock({
  page,
  text,
  parseLetter,
  lang,
  dir,
  showPageLabel = true,
}: {
  page: number;
  text: string;
  parseLetter: boolean;
  lang?: string;
  dir: "ltr" | "rtl";
  showPageLabel?: boolean;
}) {
  const sections = parseLetter ? parseLetterSections(text) : null;

  return (
    <article
      className="pdf-ocr-paper pdf-ocr-paper--translation backend-translate-page"
      data-translate-page={page}
      lang={lang}
      dir={dir}
    >
      {showPageLabel && (
        <div className="backend-translate-page-label">Pàg. {page}</div>
      )}
      {sections ? (
        <PageLetterContent sections={sections} />
      ) : text.trim() ? (
        <PagePlainContent text={text} />
      ) : (
        <p className="empty-state" style={{ padding: "1.5rem" }}>
          (Pàgina sense text)
        </p>
      )}
    </article>
  );
}

/**
 * Shows the document's stored backend translation beside the PDF preview.
 * Prefers `translated_pages` (one block per PDF page); falls back to
 * `translated_text`. Separate from client OCR (`PdfOcrTranslateWorkspace`).
 */
export function BackendDocumentTranslatePanel({
  translatedText,
  translatedPages,
  documentLanguage,
  docType,
  docTypeCa,
  open,
  onClose,
}: {
  translatedText?: string | null;
  translatedPages?: TranslatedPage[] | null;
  /** Classified / metadata language of the source document. */
  documentLanguage?: string | null;
  docType?: string | null;
  docTypeCa?: string | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  const metaSource = normalizeTranslateLanguage(documentLanguage);
  const pages = normalizeTranslatedPages(translatedPages);
  const usePages = pages.length > 0;
  const combinedText = usePages
    ? pages
        .map((page) => page.text)
        .filter((text) => text.trim())
        .join("\n\n")
    : (translatedText ?? "");
  const looksArabic = /[\u0600-\u06FF]/.test(combinedText);
  const dir = looksArabic ? "rtl" : "ltr";
  const letterDoc = isLetterDocType(docType, docTypeCa);
  const passthrough = looksLikePassthroughSource(documentLanguage);
  const hasAnyText =
    usePages
      ? pages.some((page) => page.text.trim())
      : Boolean(translatedText?.trim());

  return (
    <div className="card card-panel split-detail-translate">
      <div className="toolbar-row" style={{ marginBottom: 0 }}>
        <h3 className="card-title" style={{ marginBottom: 0, flex: "1 1 auto" }}>
          Traducció
          {passthrough && (
            <span className="backend-translate-badge">
              Original ({metaSource ?? "ca/es"})
            </span>
          )}
        </h3>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onClose}
          aria-label="Tancar panell de traducció"
        >
          Tancar
        </button>
      </div>

      <div className="split-detail-translate-scroll">
        <div className="backend-translate-stack">
          {!hasAnyText ? (
            <div
              className="pdf-ocr-paper pdf-ocr-paper--translation"
              lang={metaSource ?? undefined}
              dir={dir}
            >
              <p
                className="empty-state"
                style={{ padding: "1.5rem", position: "relative" }}
              >
                Aquest document no té text traduït.
              </p>
            </div>
          ) : usePages ? (
            pages.map((page) => (
              <TranslationPageBlock
                key={page.page}
                page={page.page}
                text={page.text}
                parseLetter={letterDoc}
                lang={metaSource ?? undefined}
                dir={dir}
              />
            ))
          ) : (
            <TranslationPageBlock
              page={1}
              text={translatedText ?? ""}
              parseLetter={letterDoc}
              lang={metaSource ?? undefined}
              dir={dir}
              showPageLabel={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}
