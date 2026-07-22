import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MediaCatalogPanel } from "@/components/MediaCatalogPanel";
import { PageHeader } from "@/components/PageHeader";
import { documentsFolderPickPath } from "@/constants/folders";
import type { MediaKind } from "@/api/types";

function parseKind(value: string | null): MediaKind | "all" {
  if (value === "picture" || value === "video") return value;
  return "all";
}

export function MediaCatalogPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const kind = parseKind(searchParams.get("kind"));
  const folder = searchParams.get("folder");

  const backTarget = useMemo(() => {
    const folderName = folder?.trim();
    if (folderName) return documentsFolderPickPath(folderName);
    return "/documents";
  }, [folder]);

  const { title, description } = useMemo(() => {
    const folderLabel = folder?.trim()
      ? (
          <>
            {" "}
            Carpeta: <strong>{folder.trim()}</strong>.
          </>
        )
      : null;

    if (kind === "picture") {
      return {
        title: "Fotos",
        description: (
          <>
            Fotos aprovades. Cliqueu una foto per previsualitzar-la i editar-ne
            el nom, la carpeta o el resum.
            {folderLabel}
          </>
        ),
      };
    }
    if (kind === "video") {
      return {
        title: "Vídeos",
        description: (
          <>
            Vídeos aprovats. Cliqueu un vídeo per previsualitzar-lo i editar-ne
            el nom, la carpeta o el resum.
            {folderLabel}
          </>
        ),
      };
    }
    return {
      title: "Catàleg de mitjans",
      description: (
        <>
          Fotos i vídeos aprovats. Cliqueu un fitxer per previsualitzar-lo i
          editar-ne les dades.
          {folderLabel}
        </>
      ),
    };
  }, [folder, kind]);

  return (
    <div className="page-fill">
      <PageHeader title={title} description={description} />
      <MediaCatalogPanel
        kind={kind}
        folder={folder}
        onBackToHub={() =>
          navigate(backTarget, { state: { skipAutoPick: true } })
        }
        hubBackLabel="Tornar a Classificats"
      />
    </div>
  );
}
