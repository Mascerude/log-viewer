import { useEffect, useMemo, useState } from "react";
import { getLogs, getStats } from "../api";
import { LEVEL_LETTERS } from "../levelColors";
import FilterBar from "./FilterBar";
import ErrorChart from "./ErrorChart";
import LogTable from "./LogTable";
import { RefreshIcon } from "./icons";

const ALL_LETTERS = new Set(Object.values(LEVEL_LETTERS));
const PAGE_SIZE = 100;

export default function ServiceView({ sourceId, service, sourceName, files, refreshIntervalSeconds }) {
  const relevantFiles = useMemo(
    () => files.filter((f) => f.sourceId === sourceId && f.service === service),
    [files, sourceId, service]
  );
  const minDate = useMemo(
    () => relevantFiles.map((f) => f.date).filter(Boolean).sort()[0] || "",
    [relevantFiles]
  );
  const maxDate = useMemo(() => {
    const dates = relevantFiles.map((f) => f.date).filter(Boolean).sort();
    let max = dates[dates.length - 1] || "";
    // The undated file (current/active log, not yet rotated) can contain
    // today's entries, so extend the range to today whenever it's present.
    const hasUndatedFile = relevantFiles.some((f) => !f.date);
    if (hasUndatedFile) {
      const today = new Date().toISOString().slice(0, 10);
      if (!max || today > max) max = today;
    }
    return max;
  }, [relevantFiles]);

  // The parent remounts this component (via a `key` on sourceId+service) when
  // the selected service changes, so these lazy initializers only need to
  // handle the first render of each instance.
  const [filters, setFilters] = useState(() => ({
    from: minDate,
    to: maxDate,
    levels: new Set(ALL_LETTERS),
    search: "",
    pid: "",
    tid: "",
  }));
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState([]);
  const [visibleLevels, setVisibleLevels] = useState(new Set(["Error"]));
  const [logs, setLogs] = useState({ entries: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  useEffect(() => {
    setPage(1);
  }, [filters.from, filters.to, filters.levels, debouncedSearch, filters.pid, filters.tid]);

  // Auto-refresh: re-fetch periodically without disturbing the user's filters
  useEffect(() => {
    if (!refreshIntervalSeconds) return;
    const id = setInterval(() => setRefreshTick((t) => t + 1), refreshIntervalSeconds * 1000);
    return () => clearInterval(id);
  }, [refreshIntervalSeconds]);

  useEffect(() => {
    getStats({ from: filters.from, to: filters.to, source: sourceId, service })
      .then(setStats)
      .catch((err) => setError(err.message));
  }, [filters.from, filters.to, sourceId, service, refreshTick]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const levelParam =
      filters.levels.size === ALL_LETTERS.size ? undefined : Array.from(filters.levels).join(",");
    getLogs({
      from: filters.from,
      to: filters.to,
      level: levelParam,
      source: sourceId,
      service,
      search: debouncedSearch,
      pid: filters.pid,
      tid: filters.tid,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        setLogs(result);
        setLastUpdated(new Date());
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filters.from, filters.to, filters.levels, sourceId, service, debouncedSearch, filters.pid, filters.tid, page, refreshTick]);

  function toggleChartLevel(name) {
    setVisibleLevels((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function handleSelectDayLevel(date, levelName) {
    const letter = LEVEL_LETTERS[levelName];
    setFilters((prev) => ({ ...prev, from: date, to: date, levels: new Set([letter]) }));
  }

  return (
    <div className="service-view">
      <div className="service-view-header">
        <div>
          <p className="breadcrumb">{sourceName}</p>
          <h1 className="service-title">{service}</h1>
        </div>
        <div className="refresh-info">
          {lastUpdated && <span>Aktualisiert: {lastUpdated.toLocaleTimeString("de-DE")}</span>}
          {refreshIntervalSeconds > 0 && <span> · automatisch alle {refreshIntervalSeconds}s</span>}
          <button type="button" className="settings-button" onClick={() => setRefreshTick((t) => t + 1)}>
            <RefreshIcon /> Jetzt aktualisieren
          </button>
        </div>
      </div>

      <FilterBar filters={filters} onChange={setFilters} minDate={minDate} maxDate={maxDate} />

      <ErrorChart
        stats={stats}
        visibleLevels={visibleLevels}
        onToggleLevel={toggleChartLevel}
        onSelectDayLevel={handleSelectDayLevel}
      />

      <LogTable
        entries={logs.entries}
        total={logs.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={loading}
        error={error}
        showSource={false}
        onPageChange={setPage}
      />
    </div>
  );
}
