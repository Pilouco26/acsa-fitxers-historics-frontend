import { useEffect, useState } from "react";

export function FilePdfPreview({ file, title }: { file: File; title: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const iframeSrc = objectUrl ? `${objectUrl}#toolbar=0&navpanes=0&scrollbar=0` : null;

  useEffect(() => {
    setLoading(true);
    setLoading(true);
    setError(null);
    setObjectUrl(null);

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
    <>
      {loading && <p className="empty-state">Carregant PDF…</p>}
      <div className="pdf-preview-frame" aria-busy={loading} aria-label={title} hidden={loading}>
        {iframeSrc && (
          <iframe
            title={title}
            src={iframeSrc}
            style={{ width: "100%", height: "100%", border: 0, display: "block" }}
          />
        )}
      </div>
    </>
  );
}

