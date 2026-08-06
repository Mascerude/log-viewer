import { useCallback, useEffect, useMemo, useState } from "react";
import { getLogs, getStats } from "../api";
import { LEVEL_LETTERS, LEVEL_NAMES_BY_LETTER, LEVEL_ORDER } from "../levelColors";
import FilterBar from "./FilterBar";
import ErrorChart from "./ErrorChart";
import LogTable from "./LogTable";
import { RefreshIcon } from "./icons";
import useSort from "../useSort";

const ALL_LETTERS = new Set(Object.values(LEVEL_LETTERS));
const DEFAULT_PAGE_SIZE = 20;

export default function ServiceView({ sourceId, service, sourceName, source, files, refreshIntervalSeconds }) {
  // Most specific wins: a per-service override beats a per-source override
  // beats the global default.
  const effectiveRefreshIntervalSeconds =
    source?.serviceRefreshIntervals?.[service] ?? source?.refreshIntervalSeconds ?? refreshIntervalSeconds;

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
    fromTime: "00:00",
    toTime: "23:59",
    levels: new Set(ALL_LETTERS),
    search: "",
    excludeList: [],
    excludeMode: "contains",
    pid: "",
    tid: "",
  }));
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const { sortBy, sortDir, toggleSort } = useSort();
  const [stats, setStats] = useState([]);
  const [logs, setLogs] = useState({ entries: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  // Exclude terms commit discretely (Enter/blur adds a chip), so no debounce
  // is needed — just a stable, comparable key for the effect dependencies.
  const excludeParam = filters.excludeList.length ? JSON.stringify(filters.excludeList) : undefined;

  useEffect(() => {
    setPage(1);
  }, [
    filters.from,
    filters.to,
    filters.fromTime,
    filters.toTime,
    filters.levels,
    debouncedSearch,
    excludeParam,
    filters.excludeMode,
    filters.pid,
    filters.tid,
    pageSize,
    sortBy,
    sortDir,
  ]);

  // Auto-refresh: re-fetch periodically without disturbing the user's filters
  useEffect(() => {
    if (!effectiveRefreshIntervalSeconds) return;
    const id = setInterval(() => setRefreshTick((t) => t + 1), effectiveRefreshIntervalSeconds * 1000);
    return () => clearInterval(id);
  }, [effectiveRefreshIntervalSeconds]);

  const levelParam = useMemo(
    () => (filters.levels.size === ALL_LETTERS.size ? undefined : Array.from(filters.levels).join(",")),
    [filters.levels]
  );
  const visibleLevels = useMemo(
    () => new Set(Array.from(filters.levels).map((letter) => LEVEL_NAMES_BY_LETTER[letter])),
    [filters.levels]
  );

  useEffect(() => {
    getStats({
      from: filters.from,
      to: filters.to,
      fromTime: filters.fromTime,
      toTime: filters.toTime,
      source: sourceId,
      service,
      level: levelParam,
      search: debouncedSearch,
      exclude: excludeParam,
      excludeMode: filters.excludeMode,
      pid: filters.pid,
      tid: filters.tid,
    })
      .then(setStats)
      .catch((err) => setError(err.message));
  }, [
    filters.from,
    filters.to,
    filters.fromTime,
    filters.toTime,
    levelParam,
    debouncedSearch,
    excludeParam,
    filters.excludeMode,
    filters.pid,
    filters.tid,
    sourceId,
    service,
    refreshTick,
  ]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getLogs({
      from: filters.from,
      to: filters.to,
      fromTime: filters.fromTime,
      toTime: filters.toTime,
      level: levelParam,
      source: sourceId,
      service,
      search: debouncedSearch,
      exclude: excludeParam,
      excludeMode: filters.excludeMode,
      pid: filters.pid,
      tid: filters.tid,
      sortBy,
      sortDir,
      page,
      pageSize,
    })
      .then((result) => {
        setLogs(result);
        setLastUpdated(new Date());
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [
    filters.from,
    filters.to,
    filters.fromTime,
    filters.toTime,
    levelParam,
    sourceId,
    service,
    debouncedSearch,
    excludeParam,
    filters.excludeMode,
    filters.pid,
    filters.tid,
    sortBy,
    sortDir,
    page,
    pageSize,
    refreshTick,
  ]);

  // Reused by the export menu to fetch pages beyond the one currently
  // loaded, with the exact same filters/sort — just a different page number.
  const fetchExportPage = useCallback(
    (pageNum) =>
      getLogs({
        from: filters.from,
        to: filters.to,
        fromTime: filters.fromTime,
        toTime: filters.toTime,
        level: levelParam,
        source: sourceId,
        service,
        search: debouncedSearch,
        exclude: excludeParam,
        excludeMode: filters.excludeMode,
        pid: filters.pid,
        tid: filters.tid,
        sortBy,
        sortDir,
        page: pageNum,
        pageSize,
      }).then((result) => result.entries),
    [
      filters.from,
      filters.to,
      filters.fromTime,
      filters.toTime,
      levelParam,
      sourceId,
      service,
      debouncedSearch,
      excludeParam,
      filters.excludeMode,
      filters.pid,
      filters.tid,
      sortBy,
      sortDir,
      pageSize,
    ]
  );

  // "Quelle_Service_Levels_Zeitraum" download name for the export menu —
  // built from the same filters currently applied to the table.
  function formatDateForFilename(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  }
  const levelsLabel =
    filters.levels.size === ALL_LETTERS.size
      ? "Alle-Level"
      : LEVEL_ORDER.filter((name) => filters.levels.has(LEVEL_LETTERS[name])).join("+") || "Kein-Level";
  const zeitraumLabel =
    filters.from && filters.to
      ? `${formatDateForFilename(filters.from)}-${formatDateForFilename(filters.to)}`
      : "Gesamt";
  const exportFilename = `${sourceName}_${service}_${levelsLabel}_${zeitraumLabel}`;

  function toggleChartLevel(name) {
    const letter = LEVEL_LETTERS[name];
    setFilters((prev) => {
      const next = new Set(prev.levels);
      if (next.has(letter)) next.delete(letter);
      else next.add(letter);
      return { ...prev, levels: next };
    });
  }

  function handleSelectDayLevel(date, levelName) {
    const letter = LEVEL_LETTERS[levelName];
    setFilters((prev) => ({
      ...prev,
      from: date,
      to: date,
      fromTime: "00:00",
      toTime: "23:59",
      levels: new Set([letter]),
    }));
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
          {effectiveRefreshIntervalSeconds > 0 && (
            <span> · automatisch alle {effectiveRefreshIntervalSeconds}s</span>
          )}
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
        pageSize={pageSize}
        loading={loading}
        error={error}
        showSource={false}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={toggleSort}
        onFetchPage={fetchExportPage}
        filename={exportFilename}
      />
    </div>
  );
}
