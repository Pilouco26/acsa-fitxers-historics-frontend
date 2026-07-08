import { NavLink, useLocation } from "react-router-dom";
import { JobProgressPanel } from "@/components/JobProgressPanel";
import { MoreNavMenu } from "@/components/MoreNavMenu";
import { useClassificadorJob } from "@/contexts/ClassificadorJobContext";

const mainNav = [
  { to: "/upload", label: "Escàner" },
  { to: "/classificador", label: "Classificador" },
  { to: "/revisio", label: "Revisió" },
  { to: "/documents", label: "Documents" },
];

const secondaryNav = [
  { to: "/comparador", label: "Comparador" },
  { to: "/settings", label: "Configuració" },
];

const adminNav = [
  { to: "/admin/analisi", label: "Anàlisi" },
  { to: "/admin/edicions", label: "Edicions" },
  { to: "/correus", label: "Correus" },
];

function NavSection({
  title,
  items,
}: {
  title: string;
  items: { to: string; label: string }[];
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>ACSA</h1>
          <p>Fitxers històrics</p>
        </div>
        <nav className="sidebar-nav">
          <NavSection title="Flux principal" items={mainNav} />
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
