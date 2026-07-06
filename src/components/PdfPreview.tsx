import { useEffect, useState } from "react";
import { documentFileUrl } from "@/api/client";

const API_KEY = import.meta.env.VITE_API_KEY?.trim() || "";

export function PdfPreview({ documentId, title }: { documentId: number; title: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let active = true;

    const headers: HeadersInit = {};
    if (API_KEY) headers["X-API-Key"] = API_KEY;

    fetch(documentFileUrl(documentId), { headers })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (!active) return;
        const url = URL.createObjectURL(blob);
        revoked = url;
        setBlobUrl(url);
        setError(null);
      })
      .catch(() => {
        if (active) setError("No s'ha pogut carregar la vista prèvia del PDF.");
      });

    return () => {
      active = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [documentId]);

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  if (!blobUrl) {
    return <p className="empty-state">Carregant PDF…</p>;
  }

  return (
    <iframe
      title={title}
      src={blobUrl}
      className="pdf-preview-frame"
    />
  );
}
