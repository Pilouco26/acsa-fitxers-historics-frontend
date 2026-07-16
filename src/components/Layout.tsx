import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listPictures, listVideos } from "@/api/client";
import { JobProgressPanel } from "@/components/JobProgressPanel";
import { MoreNavMenu } from "@/components/MoreNavMenu";
import { useClassificadorJob } from "@/contexts/ClassificadorJobContext";
import { DOCUMENT_STATUS_REVISIO } from "@/constants/globals";
import logoAcsa from "../../images/Logo_ACSA_02.png";

const mainNav = [
  { to: "/upload", label: "Pujar" },
  { to: "/classificador", label: "Classificador" },
  { to: "/revisio", label: "Revisió" },
  { to: "/documents", label: "Documents" },
];

const mediaNav = [
  { to: "/media", label: "Pujar mitjans" },
  { to: "/media/review", label: "Revisió mitjans", badgeKey: "revisio" as const },
  { to: "/media/catalog", label: "Catàleg mitjans" },
];

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
  items: { to: string; label: string; badgeKey?: "revisio" }[];
  badgeCount?: number;
}) {
  return (
    <div className="nav-section">
      <div className="nav-section-title">{title}</div>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
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
  const { job, jobId, isActive, isStarting, cancel } = useClassificadorJob();
  const onClassificador = location.pathname === "/classificador";
  const showGlobalJobProgress = !onClassificador && isActive;

  const revisioCountQuery = useQuery({
    queryKey: ["media-revisio-count"],
    queryFn: async () => {
      const [pictures, videos] = await Promise.all([
        listPictures({ status: DOCUMENT_STATUS_REVISIO, limit: 1 }),
        listVideos({ status: DOCUMENT_STATUS_REVISIO, limit: 1 }),
      ]);
      return pictures.total + videos.total;
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
          <NavSection title="Flux principal" items={mainNav} />
          <NavSection
            title="Mitjans"
            items={mediaNav}
            badgeCount={revisioCountQuery.data}
          />
        </nav>
        <div className="sidebar-footer">
          <MoreNavMenu
            sections={[
              { title: "Eines", items: secondaryNav },
              { title: "Administració", items: adminNav },
            ]}
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
