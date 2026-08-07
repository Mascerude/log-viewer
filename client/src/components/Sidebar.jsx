import { useEffect, useMemo, useRef, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import { HomeIcon, SettingsIcon, SearchIcon, ChevronRightIcon, FolderIcon } from "./icons";

function formatExpiry(iso) {
  const [, m, d] = iso.split("-");
  return `bis ${d}.${m}.`;
}

const WIDTH_STORAGE_KEY = "sidebarWidth";
const MIN_WIDTH = 200;
const MAX_WIDTH = 560;
const FALLBACK_WIDTH = 248;

// Each row type renders its label with different font-size/weight/transform
// (source headers are bold+uppercase+letter-spaced, group headers are bold,
// service rows are plain) — matching that per category is what makes the
// text measurement below accurate instead of an underestimate. "chrome" is
// the row's own non-text width (icon/dot + chevron + padding) plus the
// sidebar's own padding and a little breathing room; generous on purpose
// since a too-narrow guess would defeat the point (visible truncation)
// while a too-wide one just costs a few spare pixels.
const ROW_TYPES = [
  { style: { fontSize: "13.5px" }, chrome: 100 },
  { style: { fontSize: "11.5px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em" }, chrome: 140 },
  { style: { fontSize: "12.5px", fontWeight: "700" }, chrome: 120 },
];

function clampWidth(w) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));
}

// Sizes the sidebar so the longest source/group/service name fits on one
// line without truncating — measured against the sidebar's actual fonts via
// a hidden probe element, since a hardcoded px-per-character estimate would
// drift from the real (variable-width) font.
function computeAutoFitWidth(sources, groups, files) {
  if (typeof document === "undefined") return null;
  const serviceNames = files.map((f) => f.service).filter(Boolean);
  const sourceNames = sources.map((s) => s.name);
  const groupNames = groups.map((g) => g.name);
  if (serviceNames.length + sourceNames.length + groupNames.length === 0) return null;

  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.whiteSpace = "nowrap";
  probe.style.fontFamily = "var(--sans)";
  document.body.appendChild(probe);

  function widestRow(names, rowType) {
    Object.assign(probe.style, {
      fontSize: rowType.style.fontSize,
      fontWeight: rowType.style.fontWeight || "400",
      textTransform: rowType.style.textTransform || "none",
      letterSpacing: rowType.style.letterSpacing || "normal",
    });
    let max = 0;
    for (const name of names) {
      probe.textContent = name;
      max = Math.max(max, probe.getBoundingClientRect().width);
    }
    return max > 0 ? Math.ceil(max) + rowType.chrome : 0;
  }

  const fit = Math.max(
    widestRow(serviceNames, ROW_TYPES[0]),
    widestRow(sourceNames, ROW_TYPES[1]),
    widestRow(groupNames, ROW_TYPES[2])
  );
  document.body.removeChild(probe);

  return fit > 0 ? clampWidth(fit) : null;
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

export default function Sidebar({ sources, groups, files, view, onSelectHome, onSelectService, onSelectSearch, onSelectSettings }) {
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

  // Width: an explicit user choice (dragged handle) wins and is remembered;
  // otherwise auto-fit to whatever's the longest name currently loaded, so
  // service names are readable without truncation out of the box.
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(WIDTH_STORAGE_KEY));
    return saved ? clampWidth(saved) : FALLBACK_WIDTH;
  });
  const resizingRef = useRef(false);

  useEffect(() => {
    if (localStorage.getItem(WIDTH_STORAGE_KEY) !== null) return;
    const fit = computeAutoFitWidth(sources, groups, files);
    if (fit) setWidth(fit);
  }, [sources, groups, files]);

  function startResize(e) {
    e.preventDefault();
    resizingRef.current = true;
    document.body.classList.add("sidebar-resizing");

    function onMove(ev) {
      if (!resizingRef.current) return;
      setWidth(clampWidth(ev.clientX));
    }
    function onUp(ev) {
      resizingRef.current = false;
      document.body.classList.remove("sidebar-resizing");
      localStorage.setItem(WIDTH_STORAGE_KEY, String(clampWidth(ev.clientX)));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function resetWidth() {
    localStorage.removeItem(WIDTH_STORAGE_KEY);
    const fit = computeAutoFitWidth(sources, groups, files);
    setWidth(fit || FALLBACK_WIDTH);
  }

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
    <nav className="sidebar" style={{ width }}>
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
        className={`sidebar-search${view.name === "search" ? " active" : ""}`}
        onClick={onSelectSearch}
      >
        <SearchIcon className="sidebar-icon" /> Suche
      </button>

      <button
        type="button"
        className={`sidebar-settings${view.name === "settings" ? " active" : ""}`}
        onClick={onSelectSettings}
      >
        <SettingsIcon className="sidebar-icon" /> Einstellungen
      </button>

      <div
        className="sidebar-resize-handle"
        onMouseDown={startResize}
        onDoubleClick={resetWidth}
        title="Ziehen zum Größe ändern, Doppelklick zum Zurücksetzen"
      />
    </nav>
  );
}
