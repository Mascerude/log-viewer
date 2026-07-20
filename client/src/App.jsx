import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSources, getGroups, getServers, getFiles, getSettings, getSummary } from "./api";
import Sidebar from "./components/Sidebar";
import HomePage from "./components/HomePage";
import ServiceView from "./components/ServiceView";
import SettingsPage from "./components/SettingsPage";
import "./App.css";

export default function App() {
  const [view, setView] = useState({ name: "home" });
  const [sources, setSources] = useState([]);
  const [groups, setGroups] = useState([]);
  const [servers, setServers] = useState([]);
  const [files, setFiles] = useState([]);
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(30);
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
    refreshSources();
    refreshGroups();
    refreshServers();
    refreshFiles();
    getSettings()
      .then((s) => setRefreshIntervalSeconds(s.refreshIntervalSeconds))
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

  function goHome() {
    setView({ name: "home" });
  }
  function goSettings() {
    setView({ name: "settings" });
  }
  function goService(sourceId, service, sourceName) {
    setView({ name: "service", sourceId, service, sourceName });
  }

  return (
    <div className="app-shell">
      <Sidebar
        sources={sources}
        groups={groups}
        files={files}
        view={view}
        onSelectHome={goHome}
        onSelectService={goService}
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
            />
          )}

          {view.name === "service" && (
            <ServiceView
              key={`${view.sourceId}:${view.service}`}
              sourceId={view.sourceId}
              service={view.service}
              sourceName={view.sourceName}
              files={files}
              refreshIntervalSeconds={refreshIntervalSeconds}
            />
          )}

          {view.name === "settings" && (
            <SettingsPage
              sources={sources}
              groups={groups}
              fileCounts={fileCounts}
              servers={servers}
              refreshIntervalSeconds={refreshIntervalSeconds}
              onChanged={handleSourcesChanged}
              onServersChanged={handleServersChanged}
              onRefreshIntervalChanged={setRefreshIntervalSeconds}
              onBack={goHome}
            />
          )}
        </div>
      </div>
    </div>
  );
}
