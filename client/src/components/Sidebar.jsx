import { useMemo } from "react";

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

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark" aria-hidden="true" />
        Log Viewer
      </div>

      <button
        type="button"
        className={`sidebar-home${view.name === "home" ? " active" : ""}`}
        onClick={onSelectHome}
      >
        🏠 Übersicht
      </button>

      <div className="sidebar-sources">
        {sources.map((s) => {
          const services = servicesBySource.get(s.id) || [];
          return (
            <div key={s.id} className="sidebar-source">
              <div className="sidebar-source-header" title={s.path}>
                <span
                  className={`status-dot ${s.exists ? "status-online" : "status-offline"}`}
                  aria-hidden="true"
                  title={s.exists ? "Ordner erreichbar" : "Ordner nicht gefunden"}
                />
                {s.name}
              </div>
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
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className={`sidebar-settings${view.name === "settings" ? " active" : ""}`}
        onClick={onSelectSettings}
      >
        ⚙ Einstellungen
      </button>
    </nav>
  );
}
