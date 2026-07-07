import { useEffect, useMemo, useState } from "react";
import { documentFileUrl } from "@/api/client";

const API_KEY = import.meta.env.VITE_API_KEY?.trim() || "";

export function PdfPreview({
  documentId,
  title,
  rotation = 0,
}: {
  documentId: number;
  title: string;
  rotation?: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const iframeSrc = useMemo(() => {
    if (!objectUrl) return null;
    // Hide built-in PDF viewer UI when supported by browser/plugin.
    return `${objectUrl}#toolbar=0&navpanes=0&scrollbar=0`;
  }, [objectUrl]);

  const rotationDeg = useMemo(() => {
    const normalized = ((rotation % 360) + 360) % 360;
    return normalized;
  }, [rotation]);

  useEffect(() => {
    let active = true;
    const ac = new AbortController();
    let urlToRevoke: string | null = null;

    setLoading(true);
    setError(null);
    setObjectUrl(null);

    const headers: HeadersInit = {};
    if (API_KEY) headers["X-API-Key"] = API_KEY;

    fetch(documentFileUrl(documentId), { headers, signal: ac.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => {
        if (!active) return;
        const blob = new Blob([data], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        urlToRevoke = url;
        setObjectUrl(url);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!active) return;
        setError("No s'ha pogut carregar la vista prèvia del PDF.");
        setLoading(false);
      });

    return () => {
      active = false;
      ac.abort();
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [documentId]);

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  return (
    <>
      {loading && <p className="empty-state">Carregant PDF…</p>}
      <div className="pdf-preview-frame" aria-busy={loading} aria-label={title} hidden={loading}>
        {iframeSrc && (
          <div
            style={{
              width: "100%",
              height: "100%",
              transform: `rotate(${rotationDeg}deg)`,
              transformOrigin: "center center",
            }}
          >
            <iframe
              title={title}
              src={iframeSrc}
              style={{ width: "100%", height: "100%", border: 0, display: "block" }}
            />
          </div>
        )}
      </div>
    </>
  );
}
