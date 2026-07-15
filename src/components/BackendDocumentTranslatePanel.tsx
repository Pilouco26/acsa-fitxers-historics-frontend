import { normalizeTranslateLanguage } from "@/constants/translateLanguages";

/** Prefer blank-line paragraphs, then lines, so layout stays readable. */
function splitDocumentBlocks(text: string): string[] {
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return [];

  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;

  return [trimmed];
}

/**
 * Shows the document's stored backend `translated_text` beside the PDF preview.
 * Separate from client-side PDF page OCR translation (`PdfOcrTranslateWorkspace`).
 */
export function BackendDocumentTranslatePanel({
  translatedText,
  documentLanguage,
  open,
  onClose,
}: {
  translatedText?: string | null;
  /** Classified / metadata language of the source document. */
  documentLanguage?: string | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  const metaSource = normalizeTranslateLanguage(documentLanguage);
  const blocks = splitDocumentBlocks(translatedText ?? "");
  const looksArabic = /[\u0600-\u06FF]/.test(translatedText ?? "");

  return (
    <div className="card card-panel split-detail-translate">
      <div className="toolbar-row" style={{ marginBottom: 0 }}>
        <h3 className="card-title" style={{ marginBottom: 0, flex: "1 1 auto" }}>
          Traducció
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
        <div
          className="pdf-ocr-paper pdf-ocr-paper--translation"
          lang={metaSource ?? undefined}
          dir={looksArabic ? "rtl" : "ltr"}
        >
          {blocks.length > 0 ? (
            <div className="pdf-ocr-page-plain">
              {blocks.map((para, index) => (
                <p key={`${index}-${para.slice(0, 32)}`}>{para}</p>
              ))}
            </div>
          ) : (
            <p
              className="empty-state"
              style={{ padding: "1.5rem", position: "relative" }}
            >
              Aquest document no té text traduït.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
