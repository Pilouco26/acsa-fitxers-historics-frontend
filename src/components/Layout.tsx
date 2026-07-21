import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listDocuments, listPictures, listVideos } from "@/api/client";
import { JobProgressPanel } from "@/components/JobProgressPanel";
import { MoreNavMenu } from "@/components/MoreNavMenu";
import { useAuth } from "@/contexts/AuthContext";
import { useClassificadorJob } from "@/contexts/ClassificadorJobContext";
import { DOCUMENT_STATUS_REVISIO } from "@/constants/globals";
import logoAcsa from "../../images/Logo_ACSA_02.png";

const mainNav = [
  { to: "/upload", label: "Pujar" },
  { to: "/classificador", label: "Classificador" },
  { to: "/revisio", label: "Revisió", badgeKey: "revisio" as const },
  { to: "/documents", label: "Classificats" },
  { to: "/notes", label: "Notes" },
];

const mediaNav = [{ to: "/media/catalog", label: "Catàleg mitjans" }];

const secondaryNav = [
  { to: "/comparador", label: "Comparador" },
  { to: "/settings", label: "Configuració" },
];

const adminNav = [
  { to: "/admin/analisi", label: "Anàlisi" },
  { to: "/admin/edicions", label: "Edicions" },
  { to: "/correus", label: "Correus" },
  { to: "/recuperacio", label: "Recuperació" },
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
  const { logout } = useAuth();
  const { job, jobId, isActive, isStarting, cancel } = useClassificadorJob();
  const onClassificador = location.pathname === "/classificador";
  const showGlobalJobProgress = !onClassificador && isActive;

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src={logoAcsa} alt="ACSA" className="sidebar-brand-logo" />
          <p>Fitxers històrics</p>
        </div>
        <nav className="sidebar-nav">
          <NavSection
            title="Flux principal"
            items={mainNav}
            badgeCount={revisioCountQuery.data}
          />
          <NavSection title="Mitjans" items={mediaNav} />
        </nav>
        <div className="sidebar-footer">
          <MoreNavMenu
            sections={[
              { title: "Eines", items: secondaryNav },
              { title: "Administració", items: adminNav },
            ]}
            onLogout={handleLogout}
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
