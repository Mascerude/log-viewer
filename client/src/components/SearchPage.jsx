import { useEffect, useMemo, useRef, useState } from "react";
import { getLogs, getSavedSearch } from "../api";
import { SearchIcon, CloseIcon, RefreshIcon } from "./icons";
import LogTable from "./LogTable";
import FilterBar from "./FilterBar";
import ToggleSwitch from "./ToggleSwitch";
import SavedSearchesModal, { SaveSearchModal, MissingItemsModal } from "./SavedSearches";
import useSort from "../useSort";
import { LEVEL_LETTERS } from "../levelColors";

const DEFAULT_PAGE_SIZE = 20;
const ALL_LETTERS = new Set(Object.values(LEVEL_LETTERS));

// Services aren't unique by name alone — different sources can happen to run
// a same-named service. Keying selection on (sourceId, service) keeps those
// independently selectable; the JSON key survives any characters a service
// name could contain.
function pairKey(sourceId, service) {
  return JSON.stringify([sourceId, service]);
}

export default function SearchPage({ sources, files, initialSavedSearchId }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] = useState(() => new Set());
  const [selectedServiceKeys, setSelectedServiceKeys] = useState(() => new Set());
  const [excludedServiceKeys, setExcludedServiceKeys] = useState(() => new Set());
  // Controls what clicking a service chip does — "include" (default, the
  // long-standing behaviour: restrict results to only the picked services)
  // or "exclude" (new: keep everything except the picked services). A chip
  // can only be in one of the two sets at a time; switching a chip's mode
  // removes it from the other set.
  const [serviceFilterMode, setServiceFilterMode] = useState("include");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const { sortBy, sortDir, toggleSort } = useSort();
  const [results, setResults] = useState({ entries: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  // Refresh interval for this search's results. Not tied to Einstellungen's
  // global/source/service intervals — but unlike earlier, it's not purely
  // session-only either: saving a search now stores it too, so loading that
  // search brings the interval back. 0 means "off".
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(0);

  // Extra filters (level/PID/TID/exclude/date range), same shape ServiceView
  // uses — hidden behind a switch since most searches don't need them.
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(() => ({
    from: "",
    to: "",
    fromTime: "00:00",
    toTime: "23:59",
    levels: new Set(ALL_LETTERS),
    search: "",
    excludeList: [],
    excludeMode: "contains",
    pid: "",
    tid: "",
  }));

  const [missingWarning, setMissingWarning] = useState(null);
  const [savedSearchesOpen, setSavedSearchesOpen] = useState(false);
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);
  const [sharedSearchError, setSharedSearchError] = useState(null);

  const availableServices = useMemo(() => {
    const relevant = selectedSourceIds.size
      ? files.filter((f) => selectedSourceIds.has(f.sourceId))
      : files;
    const map = new Map();
    for (const f of relevant) {
      if (!f.service) continue;
      const key = pairKey(f.sourceId, f.service);
      if (!map.has(key)) map.set(key, { key, sourceId: f.sourceId, sourceName: f.sourceName, service: f.service });
    }
    return Array.from(map.values()).sort(
      (a, b) => a.service.localeCompare(b.service) || a.sourceName.localeCompare(b.sourceName)
    );
  }, [files, selectedSourceIds]);

  // Same service name showing up under more than one source is ambiguous —
  // append the source name to every chip sharing that name so they read
  // distinctly (e.g. "Auth Service (Portal A)" vs "Auth Service (Portal B)").
  const serviceNameCounts = useMemo(() => {
    const counts = new Map();
    for (const s of availableServices) counts.set(s.service, (counts.get(s.service) || 0) + 1);
    return counts;
  }, [availableServices]);

  // Narrowing the selected sources can make a previously-picked service
  // unavailable — drop it rather than silently keep filtering by a service
  // that's no longer in scope.
  useEffect(() => {
    const availableKeys = new Set(availableServices.map((s) => s.key));
    setSelectedServiceKeys((prev) => {
      const next = new Set(Array.from(prev).filter((k) => availableKeys.has(k)));
      return next.size === prev.size ? prev : next;
    });
    setExcludedServiceKeys((prev) => {
      const next = new Set(Array.from(prev).filter((k) => availableKeys.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [availableServices]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const sourceParam = selectedSourceIds.size ? Array.from(selectedSourceIds).join(",") : undefined;
  const servicePairsParam = selectedServiceKeys.size
    ? JSON.stringify(Array.from(selectedServiceKeys).map((k) => JSON.parse(k)))
    : undefined;
  const excludeServicePairsParam = excludedServiceKeys.size
    ? JSON.stringify(Array.from(excludedServiceKeys).map((k) => JSON.parse(k)))
    : undefined;
  const levelParam = filters.levels.size === ALL_LETTERS.size ? undefined : Array.from(filters.levels).join(",");
  const excludeParam = filters.excludeList.length ? JSON.stringify(filters.excludeList) : undefined;

  useEffect(() => {
    setPage(1);
  }, [
    debouncedQuery,
    selectedSourceIds,
    selectedServiceKeys,
    excludedServiceKeys,
    pageSize,
    sortBy,
    sortDir,
    filters.from,
    filters.to,
    filters.fromTime,
    filters.toTime,
    levelParam,
    excludeParam,
    filters.excludeMode,
    filters.pid,
    filters.tid,
  ]);

  // A source/service selection or any other active filter is enough to show
  // results — an empty search text then just means "no text filter", not
  // "nothing selected".
  const hasScope = Boolean(sourceParam || servicePairsParam);
  const hasActiveFilters =
    levelParam !== undefined ||
    Boolean(excludeParam) ||
    Boolean(excludeServicePairsParam) ||
    Boolean(filters.pid) ||
    Boolean(filters.tid) ||
    Boolean(filters.from) ||
    Boolean(filters.to);
  const shouldSearch = Boolean(debouncedQuery) || hasScope || hasActiveFilters;

  // Auto-refresh: re-fetch periodically without disturbing the current
  // filters. Session-only — resets if the page is left or reloaded.
  useEffect(() => {
    if (!refreshIntervalSeconds) return;
    const id = setInterval(() => setRefreshTick((t) => t + 1), refreshIntervalSeconds * 1000);
    return () => clearInterval(id);
  }, [refreshIntervalSeconds]);

  useEffect(() => {
    if (!shouldSearch) {
      setResults({ entries: [], total: 0 });
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    getLogs({
      search: debouncedQuery,
      source: sourceParam,
      servicePairs: servicePairsParam,
      excludeServicePairs: excludeServicePairsParam,
      from: filters.from,
      to: filters.to,
      fromTime: filters.fromTime,
      toTime: filters.toTime,
      level: levelParam,
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
        setResults(result);
        setLastUpdated(new Date());
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [
    shouldSearch,
    debouncedQuery,
    sourceParam,
    servicePairsParam,
    excludeServicePairsParam,
    filters.from,
    filters.to,
    filters.fromTime,
    filters.toTime,
    levelParam,
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

  // Same filter/sort params as the getLogs() calls above — handed to a
  // background PDF-export job (see ExportMenu.jsx/pdfJobsContext.jsx) so it
  // can re-derive the exact same entries server-side.
  const exportQuery = useMemo(
    () => ({
      search: debouncedQuery,
      source: sourceParam,
      servicePairs: servicePairsParam,
      excludeServicePairs: excludeServicePairsParam,
      from: filters.from,
      to: filters.to,
      fromTime: filters.fromTime,
      toTime: filters.toTime,
      level: levelParam,
      exclude: excludeParam,
      excludeMode: filters.excludeMode,
      pid: filters.pid,
      tid: filters.tid,
      sortBy,
      sortDir,
    }),
    [
      debouncedQuery,
      sourceParam,
      servicePairsParam,
      excludeServicePairsParam,
      filters.from,
      filters.to,
      filters.fromTime,
      filters.toTime,
      levelParam,
      excludeParam,
      filters.excludeMode,
      filters.pid,
      filters.tid,
      sortBy,
      sortDir,
    ]
  );

  const savePayload = useMemo(
    () => ({
      query,
      sources: Array.from(selectedSourceIds).map((id) => ({
        id,
        name: sources.find((s) => s.id === id)?.name || id,
      })),
      services: Array.from(selectedServiceKeys).map((k) => {
        const [sourceId, service] = JSON.parse(k);
        return { sourceId, sourceName: sources.find((s) => s.id === sourceId)?.name || sourceId, service };
      }),
      excludedServices: Array.from(excludedServiceKeys).map((k) => {
        const [sourceId, service] = JSON.parse(k);
        return { sourceId, sourceName: sources.find((s) => s.id === sourceId)?.name || sourceId, service };
      }),
      filters: {
        levels: Array.from(filters.levels),
        pid: filters.pid,
        tid: filters.tid,
        excludeList: filters.excludeList,
        excludeMode: filters.excludeMode,
        from: filters.from,
        to: filters.to,
        fromTime: filters.fromTime,
        toTime: filters.toTime,
      },
      refreshIntervalSeconds,
    }),
    [query, selectedSourceIds, selectedServiceKeys, excludedServiceKeys, sources, filters, refreshIntervalSeconds]
  );

  // Applies a saved search, dropping any source/service that no longer
  // exists (checked against the live sources/files, not just the snapshot
  // stored with the saved search) and warning about it via a modal instead
  // of silently applying a stale/broken selection.
  function handleLoadSavedSearch(saved) {
    const currentSourceIds = new Set(sources.map((s) => s.id));
    const currentServiceKeys = new Set(files.filter((f) => f.service).map((f) => pairKey(f.sourceId, f.service)));

    const validSources = saved.sources.filter((s) => currentSourceIds.has(s.id));
    const missingSources = saved.sources.filter((s) => !currentSourceIds.has(s.id));

    const validServices = saved.services.filter((s) => currentServiceKeys.has(pairKey(s.sourceId, s.service)));
    const missingServices = saved.services.filter((s) => !currentServiceKeys.has(pairKey(s.sourceId, s.service)));

    // Older saved searches predate the exclude-services option and won't
    // have this field at all.
    const savedExcludedServices = saved.excludedServices || [];
    const validExcludedServices = savedExcludedServices.filter((s) => currentServiceKeys.has(pairKey(s.sourceId, s.service)));
    const missingExcludedServices = savedExcludedServices.filter(
      (s) => !currentServiceKeys.has(pairKey(s.sourceId, s.service))
    );

    setQuery(saved.query || "");
    setSelectedSourceIds(new Set(validSources.map((s) => s.id)));
    setSelectedServiceKeys(new Set(validServices.map((s) => pairKey(s.sourceId, s.service))));
    setExcludedServiceKeys(new Set(validExcludedServices.map((s) => pairKey(s.sourceId, s.service))));
    setFilters({
      from: saved.filters?.from || "",
      to: saved.filters?.to || "",
      fromTime: saved.filters?.fromTime || "00:00",
      toTime: saved.filters?.toTime || "23:59",
      levels: saved.filters && Array.isArray(saved.filters.levels) ? new Set(saved.filters.levels) : new Set(ALL_LETTERS),
      search: "",
      excludeList: saved.filters?.excludeList || [],
      excludeMode: saved.filters?.excludeMode || "contains",
      pid: saved.filters?.pid || "",
      tid: saved.filters?.tid || "",
    });
    setRefreshIntervalSeconds(saved.refreshIntervalSeconds > 0 ? saved.refreshIntervalSeconds : 0);
    setShowFilters(true);

    if (missingSources.length > 0 || missingServices.length > 0 || missingExcludedServices.length > 0) {
      setMissingWarning({
        name: saved.name,
        missingSources,
        missingServices: [...missingServices, ...missingExcludedServices],
      });
    }
  }

  // Consumes a "?savedSearch=<id>" share link exactly once: fetch that
  // record and apply it the same way clicking it in the browse modal would,
  // then strip the param so a later reload/refresh starts from a clean URL
  // instead of re-applying it every time.
  const consumedSharedSearch = useRef(false);
  useEffect(() => {
    if (!initialSavedSearchId || consumedSharedSearch.current) return;
    consumedSharedSearch.current = true;
    getSavedSearch(initialSavedSearchId)
      .then((saved) => {
        handleLoadSavedSearch(saved);
        const url = new URL(window.location.href);
        url.searchParams.delete("savedSearch");
        window.history.replaceState({}, "", url);
      })
      .catch(() => setSharedSearchError("Die verlinkte gespeicherte Suche wurde nicht gefunden oder wurde gelöscht."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSavedSearchId, sources, files]);

  function toggleSource(id) {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function removeFromSet(setter, key) {
    setter((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  // Clicking a chip toggles its membership in whichever set the current
  // mode targets, and clears it from the other one — a service is either
  // included, excluded, or neither, never both at once.
  function toggleService(key) {
    if (serviceFilterMode === "exclude") {
      setExcludedServiceKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      removeFromSet(setSelectedServiceKeys, key);
    } else {
      setSelectedServiceKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      removeFromSet(setExcludedServiceKeys, key);
    }
  }

  return (
    <div className="home-page">
      <div className="chart-card global-search-card">
        <div className="chart-header">
          <div>
            <h2>Alle Quellen durchsuchen</h2>
            <p className="chart-subtitle">Volltextsuche, wahlweise eingeschränkt auf bestimmte Quellen und Services</p>
          </div>
          <div className="global-search-header-actions">
            <button type="button" className="settings-button" onClick={() => setSaveSearchOpen(true)}>
              Suche speichern
            </button>
            <button type="button" className="settings-button" onClick={() => setSavedSearchesOpen(true)}>
              Gespeicherte Suchen
            </button>
            <ToggleSwitch checked={showFilters} onChange={setShowFilters} variant="accent">
              Filter anzeigen
            </ToggleSwitch>
          </div>
        </div>
        <div className="global-search-input">
          <SearchIcon aria-hidden="true" />
          <input
            type="text"
            autoFocus
            placeholder="Nachricht in allen Quellen suchen..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="global-search-clear" aria-label="Suche zurücksetzen" onClick={() => setQuery("")}>
              <CloseIcon />
            </button>
          )}
        </div>

        {sources.length > 1 && (
          <div className="global-search-filter-group">
            <span className="filter-group-title">
              Quellen{selectedSourceIds.size > 0 && (
                <span className="filter-group-hint"> ({selectedSourceIds.size} ausgewählt)</span>
              )}
            </span>
            <div className="filter-group source-toggles wrap-toggles" role="group" aria-label="Quelle einschränken">
              {sources.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`level-chip source-chip${selectedSourceIds.has(s.id) ? " active" : ""}`}
                  onClick={() => toggleSource(s.id)}
                  aria-pressed={selectedSourceIds.has(s.id)}
                  title={s.path}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {availableServices.length > 1 && (
          <div className="global-search-filter-group">
            <span className="filter-group-title">
              Services
              {selectedServiceKeys.size > 0 && (
                <span className="filter-group-hint"> ({selectedServiceKeys.size} ausgewählt)</span>
              )}
              {excludedServiceKeys.size > 0 && (
                <span className="filter-group-hint filter-group-hint-exclude"> ({excludedServiceKeys.size} ausgeschlossen)</span>
              )}
            </span>
            <div className="exclude-mode-toggle" role="group" aria-label="Service-Filtermodus">
              <button
                type="button"
                className={`exclude-mode-chip${serviceFilterMode === "include" ? " active" : ""}`}
                onClick={() => setServiceFilterMode("include")}
                aria-pressed={serviceFilterMode === "include"}
                title="Ausgewählte Services einschließen — nur diese durchsuchen"
              >
                Einschließen
              </button>
              <button
                type="button"
                className={`exclude-mode-chip${serviceFilterMode === "exclude" ? " active" : ""}`}
                onClick={() => setServiceFilterMode("exclude")}
                aria-pressed={serviceFilterMode === "exclude"}
                title="Ausgewählte Services ausschließen — alle anderen durchsuchen"
              >
                Ausschließen
              </button>
            </div>
            <div className="filter-group source-toggles wrap-toggles" role="group" aria-label="Service einschränken">
              {availableServices.map((s) => {
                const isIncluded = selectedServiceKeys.has(s.key);
                const isExcluded = excludedServiceKeys.has(s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    className={`level-chip source-chip${isIncluded ? " active" : ""}${isExcluded ? " excluded" : ""}`}
                    onClick={() => toggleService(s.key)}
                    aria-pressed={isIncluded || isExcluded}
                    title={isExcluded ? "Wird ausgeschlossen" : undefined}
                  >
                    {s.service}
                    {serviceNameCounts.get(s.service) > 1 && (
                      <span className="chip-source-hint"> ({s.sourceName})</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <SaveSearchModal open={saveSearchOpen} onClose={() => setSaveSearchOpen(false)} savePayload={savePayload} />

      <SavedSearchesModal
        open={savedSearchesOpen}
        onClose={() => setSavedSearchesOpen(false)}
        onLoad={handleLoadSavedSearch}
        savePayload={savePayload}
      />

      {missingWarning && (
        <MissingItemsModal
          searchName={missingWarning.name}
          missingSources={missingWarning.missingSources}
          missingServices={missingWarning.missingServices}
          onClose={() => setMissingWarning(null)}
        />
      )}

      {sharedSearchError && (
        <div className="settings-result settings-error global-search-shared-error">
          {sharedSearchError}
          <button type="button" className="modal-close" onClick={() => setSharedSearchError(null)} aria-label="Schließen">
            <CloseIcon />
          </button>
        </div>
      )}

      {showFilters && <FilterBar filters={filters} onChange={setFilters} showSearch={false} />}

      {shouldSearch ? (
        <>
          <div className="refresh-info global-search-refresh">
            <label className="global-search-refresh-input">
              Auto-Aktualisierung
              <input
                type="number"
                min="1"
                step="1"
                className="export-range-input"
                placeholder="aus"
                value={refreshIntervalSeconds || ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setRefreshIntervalSeconds(e.target.value === "" || !Number.isFinite(n) ? 0 : Math.max(1, n));
                }}
              />
              s
            </label>
            {lastUpdated && <span>Aktualisiert: {lastUpdated.toLocaleTimeString("de-DE")}</span>}
            <button type="button" className="settings-button" onClick={() => setRefreshTick((t) => t + 1)}>
              <RefreshIcon /> Jetzt aktualisieren
            </button>
          </div>
          <LogTable
            title="Suchergebnisse"
            entries={results.entries}
            total={results.total}
            page={page}
            pageSize={pageSize}
            loading={loading}
            error={error}
            showSource
            showService
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortChange={toggleSort}
            exportQuery={exportQuery}
          />
        </>
      ) : (
        <div className="chart-card">
          <p className="chart-empty">
            Suchbegriff eingeben, eine Quelle/einen Service auswählen oder einen Filter setzen, um Ergebnisse zu sehen.
          </p>
        </div>
      )}
    </div>
  );
}
