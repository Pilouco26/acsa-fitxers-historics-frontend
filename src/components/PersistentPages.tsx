import { useEffect, useState, type ComponentType } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AnalisiPage } from "@/pages/AnalisiPage";
import { ClassificadorPage } from "@/pages/ClassificadorPage";
import { ComparadorPage } from "@/pages/ComparadorPage";
import { CorreusPage } from "@/pages/CorreusPage";
import { DocumentsPage } from "@/pages/DocumentsPage";
import { EdicionsPage } from "@/pages/EdicionsPage";
import { MediaCatalogPage } from "@/pages/MediaCatalogPage";
import { NotesPage } from "@/pages/NotesPage";
import { RecuperacioPage } from "@/pages/RecuperacioPage";
import { RevisioPage } from "@/pages/RevisioPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { UploadPage } from "@/pages/UploadPage";

const ROUTES: { path: string; Page: ComponentType }[] = [
  { path: "/upload", Page: UploadPage },
  { path: "/classificador", Page: ClassificadorPage },
  { path: "/revisio", Page: RevisioPage },
  { path: "/documents", Page: DocumentsPage },
  { path: "/media/catalog", Page: MediaCatalogPage },
  { path: "/notes", Page: NotesPage },
  { path: "/settings", Page: SettingsPage },
  { path: "/comparador", Page: ComparadorPage },
  { path: "/admin/analisi", Page: AnalisiPage },
  { path: "/admin/edicions", Page: EdicionsPage },
  { path: "/correus", Page: CorreusPage },
  { path: "/recuperacio", Page: RecuperacioPage },
];

const LEGACY_REDIRECTS: Record<string, string> = {
  "/media": "/upload",
  "/media/review": "/revisio",
};

const KNOWN_PATHS = new Set(ROUTES.map((r) => r.path));

/** Map nested paths (e.g. `/documents/14523`) to their keep-alive page key. */
function resolveRoutePath(pathname: string): string | null {
  if (LEGACY_REDIRECTS[pathname]) return LEGACY_REDIRECTS[pathname];
  if (KNOWN_PATHS.has(pathname)) return pathname;
  if (pathname.startsWith("/documents/")) return "/documents";
  if (pathname.startsWith("/media/catalog/")) return "/media/catalog";
  return null;
}

/**
 * Keeps visited pages mounted (hidden) so local UI state survives nav changes.
 * Pages mount lazily on first visit.
 */
export function PersistentPages() {
  const location = useLocation();
  const path = location.pathname;
  const legacyTarget = LEGACY_REDIRECTS[path];
  const activePath = path === "/" ? "/upload" : resolveRoutePath(path);

  const [mounted, setMounted] = useState<Set<string>>(() => {
    return activePath && KNOWN_PATHS.has(activePath)
      ? new Set([activePath])
      : new Set();
  });

  useEffect(() => {
    if (!activePath || !KNOWN_PATHS.has(activePath)) return;
    setMounted((prev) => {
      if (prev.has(activePath)) return prev;
      const next = new Set(prev);
      next.add(activePath);
      return next;
    });
  }, [activePath]);

  if (legacyTarget) {
    return <Navigate to={legacyTarget} replace />;
  }

  if (!activePath || !KNOWN_PATHS.has(activePath)) {
    return <Navigate to="/upload" replace />;
  }

  return (
    <>
      {ROUTES.map(({ path: routePath, Page }) => {
        if (!mounted.has(routePath)) return null;
        const active = activePath === routePath;
        return (
          <div
            key={routePath}
            className={
              active
                ? "keep-alive-page keep-alive-page--active"
                : "keep-alive-page"
            }
            aria-hidden={!active}
          >
            <Page />
          </div>
        );
      })}
    </>
  );
}
