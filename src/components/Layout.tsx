import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listDocuments, listPictures, listVideos } from "@/api/client";
import { JobProgressPanel } from "@/components/JobProgressPanel";
import { MoreNavMenu } from "@/components/MoreNavMenu";
import { useAuth } from "@/contexts/AuthContext";
import { useClassificadorJob } from "@/contexts/ClassificadorJobContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  ADMIN_VIEW_MODE_OPTIONS,
  type AdminViewMode,
} from "@/constants/appMode";
import { DOCUMENT_STATUS_REVISIO } from "@/constants/globals";
import logoAcsa from "../../images/Logo_ACSA_02.png";

const fluxNav = [
  { to: "/upload", label: "Pujar" },
  { to: "/classificador", label: "Classificador" },
  { to: "/revisio", label: "Revisió", badgeKey: "revisio" as const },
  { to: "/documents", label: "Classificats" },
  { to: "/notes", label: "Notes" },
];

const toolsNav = [
  { to: "/comparador", label: "Comparador" },
  { to: "/recuperacio", label: "Recuperació" },
];

const adminOpsNav = [
  { to: "/settings", label: "Configuració" },
  { to: "/admin/logs", label: "Logs" },
  { to: "/admin/services", label: "Serveis" },
  { to: "/admin/jobs", label: "Treballs" },
];

const adminToolsNav = [
  { to: "/admin/analisi", label: "Anàlisi" },
  { to: "/admin/edicions", label: "Edicions" },
  { to: "/correus", label: "Correus" },
];

function NavSection({
  title,
  items,
  badgeCount,
}: {
  title: string;
  items: { to: string; label: string; badgeKey?: "revisio"; end?: boolean }[];
  badgeCount?: number;
}) {
  return (
    <div className="nav-section">
      <div className="nav-section-title">{title}</div>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `nav-link${isActive ? " active" : ""}`
          }
        >
          {item.label}
          {item.badgeKey === "revisio" && badgeCount != null && badgeCount > 0 && (
            <span className="nav-link-badge" aria-label={`${badgeCount} pendents`}>
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          )}
        </NavLink>
      ))}
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    logout,
    userTypeLabel,
    roleLabel,
    isAdmin,
    viewMode,
    setViewMode,
  } = useAuth();
  const { theme, setTheme } = useTheme();
  const { job, jobId, isActive, isStarting, cancel } = useClassificadorJob();
  const onClassificador = location.pathname === "/classificador";
  const showGlobalJobProgress = !onClassificador && isActive;

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const moreNavSections = isAdmin
    ? [
        { title: "Flux principal", items: fluxNav },
        { title: "Eines", items: toolsNav },
        { title: "Administració", items: adminToolsNav },
      ]
    : [
        {
          title: "Eines",
          items: toolsNav,
        },
      ];

  const revisioCountQuery = useQuery({
    queryKey: ["revisio-count"],
    queryFn: async () => {
      const [documents, pictures, videos] = await Promise.all([
        listDocuments({ status: DOCUMENT_STATUS_REVISIO, limit: 1 }),
        listPictures({ status: DOCUMENT_STATUS_REVISIO, limit: 1 }),
        listVideos({ status: DOCUMENT_STATUS_REVISIO, limit: 1 }),
      ]);
      return documents.total + pictures.total + videos.total;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const adminVisualControls = isAdmin ? (
    <div className="more-nav-visual-controls">
      <div className="more-nav-visual-group">
        <span className="more-nav-visual-label">Mode de dades</span>
        <div className="sidebar-mode-switch" role="group" aria-label="Mode de dades">
          {ADMIN_VIEW_MODE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={viewMode === option ? "active" : undefined}
              onClick={() => setViewMode(option as AdminViewMode)}
            >
              {option === "ALL"
                ? "Tots"
                : option === "EMPRESA"
                  ? "Empresa"
                  : "Personal"}
            </button>
          ))}
        </div>
      </div>
      <div className="more-nav-visual-group">
        <span className="more-nav-visual-label">Tema</span>
        <div className="sidebar-theme-switch" role="group" aria-label="Mode de tema">
          <button
            type="button"
            className={theme === "light" ? "active" : undefined}
            onClick={() => setTheme("light")}
          >
            Clar
          </button>
          <button
            type="button"
            className={theme === "dark" ? "active" : undefined}
            onClick={() => setTheme("dark")}
          >
            Fosc
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src={logoAcsa} alt="ACSA" className="sidebar-brand-logo" />
          <p>Fitxers històrics</p>
          {!isAdmin && userTypeLabel ? (
            <p className="sidebar-mode" aria-label={`Mode ${userTypeLabel}`}>
              {userTypeLabel}
              {roleLabel && roleLabel !== userTypeLabel ? ` · ${roleLabel}` : ""}
            </p>
          ) : null}
          {isAdmin && roleLabel ? (
            <p className="sidebar-mode sidebar-mode--role" aria-label={`Rol ${roleLabel}`}>
              {roleLabel}
            </p>
          ) : null}
        </div>
        <nav className="sidebar-nav">
          {isAdmin ? (
            <NavSection title="Operació" items={adminOpsNav} />
          ) : (
            <NavSection
              title="Flux principal"
              items={fluxNav}
              badgeCount={revisioCountQuery.data}
            />
          )}
        </nav>
        <div className="sidebar-footer">
          <MoreNavMenu
            sections={moreNavSections}
            onLogout={handleLogout}
            visualControls={adminVisualControls}
          />
        </div>
      </aside>
      <div className="main-area">
        {showGlobalJobProgress && (
          <div className="classificador-job-banner">
            {isStarting && !job ? (
              <div className="job-status">
                <strong>Estat:</strong> En execució
              </div>
            ) : (
              <JobProgressPanel
                job={job}
                onCancel={jobId ? cancel : undefined}
              />
            )}
          </div>
        )}
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
