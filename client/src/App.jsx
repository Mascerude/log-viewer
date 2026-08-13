import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSources, getGroups, getServers, getFiles, getSettings, getSummary } from "./api";
import Sidebar from "./components/Sidebar";
import HomePage from "./components/HomePage";
import SearchPage from "./components/SearchPage";
import ServiceView from "./components/ServiceView";
import SettingsPage from "./components/SettingsPage";
import ReloadOverviewPage from "./components/ReloadOverviewPage";
import PdfJobsWidget from "./components/PdfJobsWidget";
import { SettingsProvider } from "./settingsContext";
import { PdfJobsProvider } from "./pdfJobsContext";
import "./App.css";

// A saved search's share link is "?savedSearch=<id>" — consumed once on
// load by SearchPage, which fetches and applies that record.
function getInitialSavedSearchId() {
  return new URLSearchParams(window.location.search).get("savedSearch");
}

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

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [summaryUpdatedAt, setSummaryUpdatedAt] = useState(null);

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

  useEffect(() => {
    if (view.name !== "home") return;
    refreshSummary();
  }, [view.name, refreshTick, refreshSummary]);

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
            onSelectSettings={goSettings}
          />
          <div className="main-content">
            <div className="app">
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
                />
              )}

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
                  onBack={goHome}
                />
              )}
            </div>
          </div>
          <PdfJobsWidget />
        </div>
      </PdfJobsProvider>
    </SettingsProvider>
  );
}
