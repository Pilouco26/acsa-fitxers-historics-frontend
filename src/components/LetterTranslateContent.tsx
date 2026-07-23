import { splitDocumentBlocks } from "@/utils/ocrTranslateHelpers";
import {
  compactLetterText,
  letterLayoutForSections,
  type LetterSection,
} from "@/utils/letterSections";

/** Line-wise Cos rendering; blank lines already removed by `compactLetterText`. */
function denseLetterLines(text: string): string[] {
  const compact = compactLetterText(text);
  if (!compact) return [];
  return compact.split("\n");
}

export function PagePlainContent({
  text,
  dense = false,
}: {
  text: string;
  /** Cos layout: strip empty newlines, tighter line spacing. */
  dense?: boolean;
}) {
  const blocks = dense ? denseLetterLines(text) : splitDocumentBlocks(text);
  if (blocks.length === 0) {
    return (
      <p className="empty-state empty-state--compact">(Pàgina sense text)</p>
    );
  }
  return (
    <div
      className={`pdf-ocr-page-plain${dense ? " pdf-ocr-page-plain--dense" : ""}`}
    >
      {blocks.map((para, index) => (
        <p key={`${index}-${para.slice(0, 32)}`}>{para}</p>
      ))}
    </div>
  );
}

export function PageLetterContent({
  sections,
  showLetterhead,
}: {
  sections: LetterSection[];
  showLetterhead: boolean;
}) {
  const { visible, layout } = letterLayoutForSections(sections, showLetterhead);

  return (
    <div className="backend-translate-letter" data-letter-layout={layout}>
      {visible.map((section) => (
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
            <PagePlainContent text={section.text} dense={section.primary} />
          ) : (
            <p className="empty-state empty-state--inline">—</p>
          )}
        </section>
      ))}
    </div>
  );
}
