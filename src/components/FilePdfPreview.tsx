import { useEffect, useState } from "react";
import { PdfCanvasViewer } from "@/components/PdfPreview";

export function FilePdfPreview({ file, title }: { file: File; title: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ArrayBuffer | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);

    void file
      .arrayBuffer()
      .then((buffer) => {
        if (!active) return;
        setData(buffer);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError("No s'ha pogut carregar la vista prèvia del PDF.");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [file]);

  return (
    <PdfCanvasViewer
      data={data}
      title={title}
      loading={loading}
      error={error}
    />
  );
}
