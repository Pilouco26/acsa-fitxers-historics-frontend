import { useEffect, useState } from "react";
import { PdfOcrTranslateWorkspace } from "@/components/PdfOcrTranslateWorkspace";

export function FilePdfPreview({ file, title }: { file: File; title: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [ocrOpen, setOcrOpen] = useState(false);

  const iframeSrc = objectUrl
    ? `${objectUrl}#toolbar=0&navpanes=0&scrollbar=0`
    : null;

  useEffect(() => {
    setLoading(true);
    setError(null);
    setObjectUrl(null);
    setOcrOpen(false);

    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    setLoading(false);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file, title]);

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  return (
    <div className={`pdf-preview-shell ${ocrOpen ? "pdf-preview-shell--ocr" : ""}`}>
      {loading && <p className="empty-state">Carregant PDF…</p>}

      {!loading && (
        <div className="pdf-preview-toolbar">
          <button
            type="button"
            className={`btn btn-sm ${ocrOpen ? "btn-primary" : "btn-secondary"}`}
            aria-pressed={ocrOpen}
            disabled={!objectUrl}
            title="Traduir la pàgina actual (resultat al costat)"
            onClick={() => setOcrOpen((open) => !open)}
          >
            {ocrOpen ? "Tancar traducció" : "Traduir pàgina"}
          </button>
        </div>
      )}

      {ocrOpen ? (
        <PdfOcrTranslateWorkspace
          objectUrl={objectUrl}
          open={ocrOpen}
        />
      ) : (
        <div
          className="pdf-preview-frame"
          aria-busy={loading}
          aria-label={title}
          hidden={loading}
        >
          {iframeSrc && (
            <iframe
              title={title}
              src={iframeSrc}
              style={{ width: "100%", height: "100%", border: 0, display: "block" }}
            />
          )}
        </div>
      )}
    </div>
  );
}
