import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

type NavItem = { to: string; label: string };
type NavSection = { title: string; items: NavItem[] };

export function MoreNavMenu({ sections }: { sections: NavSection[] }) {
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

  return (
    <div className="more-nav" ref={wrapperRef}>
      <button
        type="button"
        className={`more-nav-trigger${isActive ? " active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Més
      </button>

      {open ? (
        <div className="more-nav-dropdown" role="menu" aria-label="Més opcions">
          {sections.map((section) => (
            <div key={section.title} className="nav-section">
              <div className="nav-section-title">{section.title}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  role="menuitem"
                  className={({ isActive: linkActive }) =>
                    `nav-link${linkActive ? " active" : ""}`
                  }
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

