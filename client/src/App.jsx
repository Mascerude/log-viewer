import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSources, getGroups, getServers, getFiles, getSettings, getSummary, getHealth, clearEmergencyMode } from "./api";
import { errorSeverity } from "./errorSeverity";
import Sidebar from "./components/Sidebar";
import HomePage from "./components/HomePage";
import PdfJobsWidget from "./components/PdfJobsWidget";
import { SettingsProvider } from "./settingsContext";
import { PdfJobsProvider } from "./pdfJobsContext";
import "./App.css";

// Code-split: only the home page (the default, always-visible view) and the
// sidebar/PDF widget chrome ship in the initial bundle — everything else is
// fetched on first visit to that view, keeping the main JS chunk smaller.
const SearchPage = lazy(() => import("./components/SearchPage"));
const ServiceView = lazy(() => import("./components/ServiceView"));
const SettingsPage = lazy(() => import("./components/SettingsPage"));
const ReloadOverviewPage = lazy(() => import("./components/ReloadOverviewPage"));
const ServerDiagnosticsPage = lazy(() => import("./components/ServerDiagnosticsPage"));
const ToolLogsPage = lazy(() => import("./components/ToolLogsPage"));

// A saved search's share link is "?savedSearch=<id>" — consumed once on
// load by SearchPage, which fetches and applies that record.
function getInitialSavedSearchId() {
  return new URLSearchParams(window.location.search).get("savedSearch");
}

// Per-browser display preference (Einstellungen → "Farbliche Hervorhebung"),
// not a server setting — different people using the same server may want
// different amounts of visual noise in their own sidebar.
const COLORIZE_SIDEBAR_KEY = "colorizeSidebar";

export default function App() {
  const [initialSavedSearchId] = useState(getInitialSavedSearchId);
  const [view, setView] = useState(() => (initialSavedSearchId ? { name: "search" } : { name: "home" }));
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [sources, setSources] = useState([]);
  const [groups, setGroups] = useState([]);
  const [servers, setServers] = useState([]);
  const [files, setFiles] = useState([]);
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(30);
  const [goToPageDelaySeconds, setGoToPageDelaySeconds] = useState(1.5);
  const [errorWarningThreshold, setErrorWarningThreshold] = useState(1);
  const [errorCriticalThreshold, setErrorCriticalThreshold] = useState(10);
  const [refreshTick, setRefreshTick] = useState(0);
  const [colorizeSidebar, setColorizeSidebarState] = useState(
    () => localStorage.getItem(COLORIZE_SIDEBAR_KEY) === "true"
  );

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [summaryUpdatedAt, setSummaryUpdatedAt] = useState(null);

  // Polled independent of refreshIntervalSeconds/view — the heap-warning
  // banner and the emergency-mode gate (see HomePage/ReloadOverviewPage)
  // need to stay current regardless of what page is open or what the user
  // has their own refresh interval set to.
  const [health, setHealth] = useState({
    heapPct: 0,
    heapWarning: false,
    emergencyMode: false,
    emergencyReason: null,
  });

  // Guards against overlapping requests (e.g. the initial mount fetch and a
  // fetch triggered right after a Settings change) resolving out of order and
  // letting a stale response clobber fresher state.
  const sourcesRequestId = useRef(0);
  const groupsRequestId = useRef(0);
  const serversRequestId = useRef(0);
  const filesRequestId = useRef(0);

  const refreshSources = useCallback(() => {
    const requestId = ++sourcesRequestId.current;
    return getSources()
      .then((list) => {
        if (requestId === sourcesRequestId.current) setSources(list);
      })
      .catch((err) => setSummaryError(err.message));
  }, []);

  const refreshGroups = useCallback(() => {
    const requestId = ++groupsRequestId.current;
    return getGroups()
      .then((list) => {
        if (requestId === groupsRequestId.current) setGroups(list);
      })
      .catch((err) => setSummaryError(err.message));
  }, []);

  const refreshServers = useCallback(() => {
    const requestId = ++serversRequestId.current;
    return getServers()
      .then((list) => {
        if (requestId === serversRequestId.current) setServers(list);
      })
      .catch((err) => setSummaryError(err.message));
  }, []);

  const refreshFiles = useCallback(() => {
    const requestId = ++filesRequestId.current;
    return getFiles()
      .then((list) => {
        if (requestId === filesRequestId.current) setFiles(list);
      })
      .catch(() => {
        if (requestId === filesRequestId.current) setFiles([]);
      });
  }, []);

  useEffect(() => {
    Promise.allSettled([refreshSources(), refreshGroups(), refreshServers(), refreshFiles()]).then(() =>
      setInitialDataLoaded(true)
    );
    getSettings()
      .then((s) => {
        setRefreshIntervalSeconds(s.refreshIntervalSeconds);
        if (s.goToPageDelaySeconds != null) setGoToPageDelaySeconds(s.goToPageDelaySeconds);
        if (s.errorWarningThreshold != null) setErrorWarningThreshold(s.errorWarningThreshold);
        if (s.errorCriticalThreshold != null) setErrorCriticalThreshold(s.errorCriticalThreshold);
      })
      .catch(() => {});
  }, [refreshSources, refreshGroups, refreshServers, refreshFiles]);

  function handleSourcesChanged() {
    refreshSources();
    refreshGroups();
    refreshFiles();
  }

  function handleServersChanged() {
    refreshServers();
  }

  function handleErrorThresholdsChanged({ errorWarningThreshold: warning, errorCriticalThreshold: critical }) {
    setErrorWarningThreshold(warning);
    setErrorCriticalThreshold(critical);
  }

  function setColorizeSidebar(value) {
    setColorizeSidebarState(value);
    localStorage.setItem(COLORIZE_SIDEBAR_KEY, String(value));
  }

  // Called by ReloadOverviewPage after it re-fetches a single source's file
  // list on its own schedule — merges just that source's entries into the
  // shared files state (rest untouched) so the sidebar/home page etc. see
  // the same fresh data instead of it staying local to that page.
  function handleSourceFilesReloaded(sourceId, sourceFiles) {
    setFiles((prev) => [...prev.filter((f) => f.sourceId !== sourceId), ...sourceFiles]);
  }

  // Periodically re-check sources/servers/files so the sidebar, home page and
  // server status stay live without a manual reload.
  useEffect(() => {
    if (!refreshIntervalSeconds) return;
    const id = setInterval(() => setRefreshTick((t) => t + 1), refreshIntervalSeconds * 1000);
    return () => clearInterval(id);
  }, [refreshIntervalSeconds]);

  useEffect(() => {
    if (refreshTick === 0) return;
    refreshSources();
    refreshGroups();
    refreshServers();
    refreshFiles();
  }, [refreshTick, refreshSources, refreshGroups, refreshServers, refreshFiles]);

  const refreshHealth = useCallback(() => {
    return getHealth()
      .then(setHealth)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshHealth();
    const id = setInterval(refreshHealth, 10_000);
    return () => clearInterval(id);
  }, [refreshHealth]);

  // Doesn't swallow errors — the server refuses to clear while the heap is
  // still genuinely critical, and the banner needs to show that message
  // rather than silently no-op.
  function handleClearEmergency() {
    return clearEmergencyMode().then((h) => {
      setHealth(h);
      return h;
    });
  }

  const refreshSummary = useCallback(() => {
    setSummaryLoading(true);
    setSummaryError(null);
    return getSummary()
      .then((s) => {
        setSummary(s);
        setSummaryUpdatedAt(new Date());
      })
      .catch((err) => setSummaryError(err.message))
      .finally(() => setSummaryLoading(false));
  }, []);

  // Also kept fresh outside the home page when sidebar colorization is on
  // (its byService breakdown is what that's colored from) — otherwise only
  // fetched while actually looking at the home page's chart.
  useEffect(() => {
    if (view.name !== "home" && !colorizeSidebar) return;
    refreshSummary();
  }, [view.name, refreshTick, refreshSummary, colorizeSidebar]);

  const fileCounts = useMemo(() => {
    const counts = {};
    for (const f of files) counts[f.sourceId] = (counts[f.sourceId] || 0) + 1;
    return counts;
  }, [files]);

  const servicesBySource = useMemo(() => {
    const map = new Map();
    for (const f of files) {
      if (!f.service) continue;
      if (!map.has(f.sourceId)) map.set(f.sourceId, new Set());
      map.get(f.sourceId).add(f.service);
    }
    const result = {};
    for (const [sourceId, set] of map) result[sourceId] = Array.from(set).sort();
    return result;
  }, [files]);

  // Sidebar colorization (see setColorizeSidebar) — 24h error counts per
  // service come straight from the rolling summary already fetched above;
  // per-source is those summed by sourceId, per-group is per-source summed
  // recursively through the (possibly nested) group tree. All empty objects
  // when the setting is off, which is enough for Sidebar's lookups to
  // resolve to "no severity" without it needing to know the setting itself.
  const sourceErrorCounts = useMemo(() => {
    const counts = {};
    for (const s of summary?.byService || []) counts[s.sourceId] = (counts[s.sourceId] || 0) + s.count;
    return counts;
  }, [summary]);

  const serviceSeverity = useMemo(() => {
    if (!colorizeSidebar) return {};
    const map = {};
    for (const s of summary?.byService || []) {
      map[`${s.sourceId}::${s.service}`] = errorSeverity(s.count, errorWarningThreshold, errorCriticalThreshold);
    }
    return map;
  }, [summary, colorizeSidebar, errorWarningThreshold, errorCriticalThreshold]);

  const sourceSeverity = useMemo(() => {
    if (!colorizeSidebar) return {};
    const map = {};
    for (const s of sources) {
      map[s.id] = errorSeverity(sourceErrorCounts[s.id] || 0, errorWarningThreshold, errorCriticalThreshold);
    }
    return map;
  }, [sources, sourceErrorCounts, colorizeSidebar, errorWarningThreshold, errorCriticalThreshold]);

  const groupSeverity = useMemo(() => {
    if (!colorizeSidebar) return {};
    const totals = {};
    function sumGroup(groupId) {
      if (totals[groupId] !== undefined) return totals[groupId];
      let total = 0;
      for (const s of sources) if (s.groupId === groupId) total += sourceErrorCounts[s.id] || 0;
      for (const g of groups) if (g.parentGroupId === groupId) total += sumGroup(g.id);
      totals[groupId] = total;
      return total;
    }
    const map = {};
    for (const g of groups) map[g.id] = errorSeverity(sumGroup(g.id), errorWarningThreshold, errorCriticalThreshold);
    return map;
  }, [groups, sources, sourceErrorCounts, colorizeSidebar, errorWarningThreshold, errorCriticalThreshold]);

  function goHome() {
    setView({ name: "home" });
  }
  function goSearch() {
    setView({ name: "search" });
  }
  function goSettings() {
    setView({ name: "settings" });
  }
  function goReloads() {
    setView({ name: "reloads" });
  }
  function goDiagnostics() {
    setView({ name: "diagnostics" });
  }
  function goToolLogs() {
    setView({ name: "toolLogs" });
  }
  function goService(sourceId, service, sourceName) {
    setView({ name: "service", sourceId, service, sourceName });
  }

  return (
    <SettingsProvider value={{ goToPageDelaySeconds }}>
      <PdfJobsProvider>
        <div className="app-shell">
          <Sidebar
            sources={sources}
            groups={groups}
            files={files}
            view={view}
            onSelectHome={goHome}
            onSelectService={goService}
            onSelectSearch={goSearch}
            onSelectReloads={goReloads}
            onSelectDiagnostics={goDiagnostics}
            onSelectToolLogs={goToolLogs}
            onSelectSettings={goSettings}
            sourceSeverity={sourceSeverity}
            serviceSeverity={serviceSeverity}
            groupSeverity={groupSeverity}
          />
          <div className="main-content">
            <div className="app">
              <Suspense fallback={<div className="chart-subtitle">Lädt...</div>}>
                {view.name === "home" && (
                  <HomePage
                    summary={summary}
                    loading={summaryLoading}
                    error={summaryError}
                    updatedAt={summaryUpdatedAt}
                    onRefresh={refreshSummary}
                    onSelectService={goService}
                    errorWarningThreshold={errorWarningThreshold}
                    errorCriticalThreshold={errorCriticalThreshold}
                    health={health}
                    onClearEmergency={handleClearEmergency}
                    onSelectDiagnostics={goDiagnostics}
                  />
                )}

                {view.name === "search" && (
                  <SearchPage
                    sources={sources}
                    files={files}
                    initialSavedSearchId={initialDataLoaded ? initialSavedSearchId : null}
                  />
                )}

                {view.name === "service" && (
                  <ServiceView
                    key={`${view.sourceId}:${view.service}`}
                    sourceId={view.sourceId}
                    service={view.service}
                    sourceName={view.sourceName}
                    source={sources.find((s) => s.id === view.sourceId)}
                    files={files}
                    refreshIntervalSeconds={refreshIntervalSeconds}
                  />
                )}

                {view.name === "reloads" && (
                  <ReloadOverviewPage
                    sources={sources}
                    fileCounts={fileCounts}
                    refreshIntervalSeconds={refreshIntervalSeconds}
                    onSourceReloaded={handleSourceFilesReloaded}
                    emergencyMode={health.emergencyMode}
                  />
                )}

                {view.name === "diagnostics" && <ServerDiagnosticsPage />}

                {view.name === "toolLogs" && <ToolLogsPage />}

                {view.name === "settings" && (
                  <SettingsPage
                    sources={sources}
                    groups={groups}
                    fileCounts={fileCounts}
                    servicesBySource={servicesBySource}
                    servers={servers}
                    refreshIntervalSeconds={refreshIntervalSeconds}
                    goToPageDelaySeconds={goToPageDelaySeconds}
                    errorWarningThreshold={errorWarningThreshold}
                    errorCriticalThreshold={errorCriticalThreshold}
                    onChanged={handleSourcesChanged}
                    onServersChanged={handleServersChanged}
                    onRefreshIntervalChanged={setRefreshIntervalSeconds}
                    onGoToPageDelayChanged={setGoToPageDelaySeconds}
                    onErrorThresholdsChanged={handleErrorThresholdsChanged}
                    colorizeSidebar={colorizeSidebar}
                    onColorizeSidebarChanged={setColorizeSidebar}
                    onBack={goHome}
                  />
                )}
              </Suspense>
            </div>
          </div>
          <PdfJobsWidget />
        </div>
      </PdfJobsProvider>
    </SettingsProvider>
  );
}
