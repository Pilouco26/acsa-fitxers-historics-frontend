import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";

type NavItem = {
  to: string;
  label: string;
  badgeKey?: "revisio";
};

type NavSection = { title: string; items: NavItem[] };

type MoreNavMenuProps = {
  sections: NavSection[];
  onLogout?: () => void;
  /** Admin-only visual controls (data mode + theme). */
  visualControls?: ReactNode;
  badgeCount?: number;
};

export function MoreNavMenu({
  sections,
  onLogout,
  visualControls,
  badgeCount,
}: MoreNavMenuProps) {
  const { pathname } = useLocation();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const allItems = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections],
  );

  const isActive = useMemo(() => {
    return allItems.some((item) => pathname === item.to);
  }, [allItems, pathname]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (wrapperRef.current && !wrapperRef.current.contains(target)) {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const hasNav = sections.some((section) => section.items.length > 0);

  return (
    <div className={`more-nav${open ? " more-nav--open" : ""}`} ref={wrapperRef}>
      <button
        type="button"
        className={`more-nav-trigger${isActive ? " active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="more-nav-trigger-label">Més</span>
        {badgeCount != null && badgeCount > 0 ? (
          <span
            className="nav-link-badge more-nav-trigger-badge"
            aria-label={`${badgeCount} pendents`}
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        ) : null}
        <span className="more-nav-trigger-chevron" aria-hidden="true" />
      </button>

      {open ? (
        <div className="more-nav-dropdown" role="menu" aria-label="Més opcions">
          {hasNav ? (
            <div className="more-nav-body">
              {sections.map((section) =>
                section.items.length === 0 ? null : (
                  <section key={section.title} className="more-nav-group">
                    <h3 className="more-nav-group-title">{section.title}</h3>
                    <div className="more-nav-link-grid">
                      {section.items.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          role="menuitem"
                          className={({ isActive: linkActive }) =>
                            `more-nav-link${linkActive ? " active" : ""}`
                          }
                          onClick={() => setOpen(false)}
                        >
                          <span className="more-nav-link-label">{item.label}</span>
                          {item.badgeKey === "revisio" &&
                          badgeCount != null &&
                          badgeCount > 0 ? (
                            <span
                              className="nav-link-badge"
                              aria-label={`${badgeCount} pendents`}
                            >
                              {badgeCount > 99 ? "99+" : badgeCount}
                            </span>
                          ) : null}
                        </NavLink>
                      ))}
                    </div>
                  </section>
                ),
              )}
            </div>
          ) : null}

          {visualControls ? (
            <div className="more-nav-prefs">
              <h3 className="more-nav-group-title">Preferències</h3>
              {visualControls}
            </div>
          ) : null}

          {onLogout ? (
            <div className="more-nav-footer">
              <button
                type="button"
                role="menuitem"
                className="more-nav-logout-btn"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
              >
                Tancar sessió
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
