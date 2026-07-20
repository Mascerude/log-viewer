import { useEffect, useMemo, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import { HomeIcon, SettingsIcon, ChevronRightIcon, FolderIcon } from "./icons";

function formatExpiry(iso) {
  const [, m, d] = iso.split("-");
  return `bis ${d}.${m}.`;
}

function SourceSection({ source, services, isOpen, onToggle, view, onSelectService }) {
  return (
    <div className="sidebar-source">
      <button
        type="button"
        className="sidebar-source-header"
        title={source.path}
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span
          className={`status-dot ${source.exists ? "status-online" : "status-offline"}`}
          aria-hidden="true"
          title={source.exists ? "Ordner erreichbar" : "Ordner nicht gefunden"}
        />
        <span className="sidebar-source-name">{source.name}</span>
        {source.expiresAt && (
          <span className="sidebar-source-expiry" title="Läuft automatisch ab">
            {formatExpiry(source.expiresAt)}
          </span>
        )}
        <ChevronRightIcon className={`sidebar-source-chevron${isOpen ? " open" : ""}`} />
      </button>
      {isOpen && (
        <ul className="sidebar-services">
          {services.map((svc) => {
            const active = view.name === "service" && view.sourceId === source.id && view.service === svc;
            return (
              <li key={svc}>
                <button
                  type="button"
                  className={`sidebar-service${active ? " active" : ""}`}
                  onClick={() => onSelectService(source.id, svc, source.name)}
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
}

function GroupSection({ group, groupSources, servicesBySource, isOpen, onToggle, expandedSources, onToggleSource, view, onSelectService }) {
  return (
    <div className="sidebar-group">
      <button type="button" className="sidebar-group-header" aria-expanded={isOpen} onClick={onToggle}>
        <FolderIcon className="sidebar-group-icon" />
        <span className="sidebar-group-name">{group.name}</span>
        <ChevronRightIcon className={`sidebar-source-chevron${isOpen ? " open" : ""}`} />
      </button>
      {isOpen && (
        <div className="sidebar-group-sources">
          {groupSources.map((s) => (
            <SourceSection
              key={s.id}
              source={s}
              services={servicesBySource.get(s.id) || []}
              isOpen={expandedSources.has(s.id)}
              onToggle={() => onToggleSource(s.id)}
              view={view}
              onSelectService={onSelectService}
            />
          ))}
          {groupSources.length === 0 && <div className="sidebar-empty sidebar-group-empty">Keine Quellen</div>}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ sources, groups, files, view, onSelectHome, onSelectService, onSelectSettings }) {
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

  const groupedSources = useMemo(() => {
    const map = new Map();
    for (const s of sources) {
      if (!s.groupId) continue;
      if (!map.has(s.groupId)) map.set(s.groupId, []);
      map.get(s.groupId).push(s);
    }
    return map;
  }, [sources]);

  const ungroupedSources = useMemo(() => sources.filter((s) => !s.groupId), [sources]);
  const permanentSources = useMemo(() => ungroupedSources.filter((s) => !s.expiresAt), [ungroupedSources]);
  const temporarySources = useMemo(() => ungroupedSources.filter((s) => s.expiresAt), [ungroupedSources]);

  // Sources (and groups) collapse by default; only the one containing the
  // active service (if any) starts open, so navigating in never hides the
  // current selection.
  const [expanded, setExpanded] = useState(() => new Set(view.name === "service" ? [view.sourceId] : []));
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());

  useEffect(() => {
    if (view.name !== "service") return;
    setExpanded((prev) => (prev.has(view.sourceId) ? prev : new Set(prev).add(view.sourceId)));
    const activeSource = sources.find((s) => s.id === view.sourceId);
    if (activeSource?.groupId) {
      setExpandedGroups((prev) =>
        prev.has(activeSource.groupId) ? prev : new Set(prev).add(activeSource.groupId)
      );
    }
  }, [view, sources]);

  function toggleSource(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(id) {
    setExpandedGroups((prev) => {
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
        {groups.map((g) => (
          <GroupSection
            key={g.id}
            group={g}
            groupSources={groupedSources.get(g.id) || []}
            servicesBySource={servicesBySource}
            isOpen={expandedGroups.has(g.id)}
            onToggle={() => toggleGroup(g.id)}
            expandedSources={expanded}
            onToggleSource={toggleSource}
            view={view}
            onSelectService={onSelectService}
          />
        ))}

        {permanentSources.map((s) => (
          <SourceSection
            key={s.id}
            source={s}
            services={servicesBySource.get(s.id) || []}
            isOpen={expanded.has(s.id)}
            onToggle={() => toggleSource(s.id)}
            view={view}
            onSelectService={onSelectService}
          />
        ))}

        {temporarySources.length > 0 && (
          <>
            <div className="sidebar-section-label">Temporäre Quellen</div>
            {temporarySources.map((s) => (
              <SourceSection
                key={s.id}
                source={s}
                services={servicesBySource.get(s.id) || []}
                isOpen={expanded.has(s.id)}
                onToggle={() => toggleSource(s.id)}
                view={view}
                onSelectService={onSelectService}
              />
            ))}
          </>
        )}
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
