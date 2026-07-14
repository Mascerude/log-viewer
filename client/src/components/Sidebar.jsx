import { useEffect, useMemo, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import { HomeIcon, SettingsIcon, ChevronRightIcon } from "./icons";

export default function Sidebar({ sources, files, view, onSelectHome, onSelectService, onSelectSettings }) {
  const servicesBySource = useMemo(() => {
    const map = new Map();
    for (const f of files) {
      if (!f.service) continue;
      if (!map.has(f.sourceId)) map.set(f.sourceId, new Set());
      map.get(f.sourceId).add(f.service);
    }
    const result = new Map();
    for (const [sourceId, set] of map) {
      result.set(sourceId, Array.from(set).sort());
    }
    return result;
  }, [files]);

  // Sources collapse by default; only the one containing the active service
  // (if any) starts open, so navigating in never hides the current selection.
  const [expanded, setExpanded] = useState(() => new Set(view.name === "service" ? [view.sourceId] : []));

  useEffect(() => {
    if (view.name !== "service") return;
    setExpanded((prev) => (prev.has(view.sourceId) ? prev : new Set(prev).add(view.sourceId)));
  }, [view]);

  function toggleSource(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark" aria-hidden="true" />
        <span className="sidebar-brand-text">Log Viewer</span>
        <ThemeToggle />
      </div>

      <button
        type="button"
        className={`sidebar-home${view.name === "home" ? " active" : ""}`}
        onClick={onSelectHome}
      >
        <HomeIcon className="sidebar-icon" /> Übersicht
      </button>

      <div className="sidebar-sources">
        {sources.map((s) => {
          const services = servicesBySource.get(s.id) || [];
          const isOpen = expanded.has(s.id);
          return (
            <div key={s.id} className="sidebar-source">
              <button
                type="button"
                className="sidebar-source-header"
                title={s.path}
                aria-expanded={isOpen}
                onClick={() => toggleSource(s.id)}
              >
                <span
                  className={`status-dot ${s.exists ? "status-online" : "status-offline"}`}
                  aria-hidden="true"
                  title={s.exists ? "Ordner erreichbar" : "Ordner nicht gefunden"}
                />
                <span className="sidebar-source-name">{s.name}</span>
                <ChevronRightIcon className={`sidebar-source-chevron${isOpen ? " open" : ""}`} />
              </button>
              {isOpen && (
                <ul className="sidebar-services">
                  {services.map((svc) => {
                    const active = view.name === "service" && view.sourceId === s.id && view.service === svc;
                    return (
                      <li key={svc}>
                        <button
                          type="button"
                          className={`sidebar-service${active ? " active" : ""}`}
                          onClick={() => onSelectService(s.id, svc, s.name)}
                        >
                          {svc}
                        </button>
                      </li>
                    );
                  })}
                  {services.length === 0 && <li className="sidebar-empty">Keine Daten</li>}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className={`sidebar-settings${view.name === "settings" ? " active" : ""}`}
        onClick={onSelectSettings}
      >
        <SettingsIcon className="sidebar-icon" /> Einstellungen
      </button>
    </nav>
  );
}
