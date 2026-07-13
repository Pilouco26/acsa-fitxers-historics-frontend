import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AnalisiPage } from "@/pages/AnalisiPage";
import { ClassificadorPage } from "@/pages/ClassificadorPage";
import { ComparadorPage } from "@/pages/ComparadorPage";
import { CorreusPage } from "@/pages/CorreusPage";
import { DocumentsPage } from "@/pages/DocumentsPage";
import { EdicionsPage } from "@/pages/EdicionsPage";
import { RevisioPage } from "@/pages/RevisioPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { UploadPage } from "@/pages/UploadPage";

const ROUTES: { path: string; element: ReactNode }[] = [
  { path: "/upload", element: <UploadPage /> },
  { path: "/classificador", element: <ClassificadorPage /> },
  { path: "/revisio", element: <RevisioPage /> },
  { path: "/documents", element: <DocumentsPage /> },
  { path: "/settings", element: <SettingsPage /> },
  { path: "/comparador", element: <ComparadorPage /> },
  { path: "/admin/analisi", element: <AnalisiPage /> },
  { path: "/admin/edicions", element: <EdicionsPage /> },
  { path: "/correus", element: <CorreusPage /> },
];

const KNOWN_PATHS = new Set(ROUTES.map((r) => r.path));

/**
 * Keeps visited pages mounted (hidden) so local UI state survives nav changes.
 * Pages mount lazily on first visit.
 */
export function PersistentPages() {
  const location = useLocation();
  const path = location.pathname;

  const [mounted, setMounted] = useState<Set<string>>(() => {
    const initial = path === "/" ? "/upload" : path;
    return KNOWN_PATHS.has(initial) ? new Set([initial]) : new Set();
  });

  useEffect(() => {
    if (!KNOWN_PATHS.has(path)) return;
    setMounted((prev) => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }, [path]);

  if (path === "/" || !KNOWN_PATHS.has(path)) {
    return <Navigate to="/upload" replace />;
  }

  return (
    <>
      {ROUTES.map(({ path: routePath, element }) => {
        if (!mounted.has(routePath)) return null;
        const active = path === routePath;
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
            {element}
          </div>
        );
      })}
    </>
  );
}
