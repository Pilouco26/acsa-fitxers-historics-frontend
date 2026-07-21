import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MediaCatalogPanel } from "@/components/MediaCatalogPanel";
import { HubBackButton } from "@/components/HubBackButton";
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
            Fotos aprovades.
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
            Vídeos aprovats.
            {folderLabel}
          </>
        ),
      };
    }
    return {
      title: "Catàleg de mitjans",
      description: (
        <>
          Fotos i vídeos aprovats. Cerqueu i obriu a pantalla completa.
          {folderLabel}
        </>
      ),
    };
  }, [folder, kind]);

  return (
    <div className="page-fill">
      <PageHeader title={title} description={description} />
      <div className="panel-with-back">
        <HubBackButton
          onClick={() => navigate(backTarget)}
          label="Tornar a Classificats"
        />
        <div className="panel-with-back-body">
          <MediaCatalogPanel kind={kind} folder={folder} />
        </div>
      </div>
    </div>
  );
}
