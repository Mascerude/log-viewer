import { useCallback, useEffect, useMemo, useState } from "react";
import { getLogs } from "../api";
import { SearchIcon, CloseIcon } from "./icons";
import LogTable from "./LogTable";
import useSort from "../useSort";

const DEFAULT_PAGE_SIZE = 20;

// Services aren't unique by name alone — different sources can happen to run
// a same-named service. Keying selection on (sourceId, service) keeps those
// independently selectable; the JSON key survives any characters a service
// name could contain.
function pairKey(sourceId, service) {
  return JSON.stringify([sourceId, service]);
}

export default function SearchPage({ sources, files }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] = useState(() => new Set());
  const [selectedServiceKeys, setSelectedServiceKeys] = useState(() => new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const { sortBy, sortDir, toggleSort } = useSort();
  const [results, setResults] = useState({ entries: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
  }, [availableServices]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, selectedSourceIds, selectedServiceKeys, pageSize, sortBy, sortDir]);

  const sourceParam = selectedSourceIds.size ? Array.from(selectedSourceIds).join(",") : undefined;
  const servicePairsParam = selectedServiceKeys.size
    ? JSON.stringify(Array.from(selectedServiceKeys).map((k) => JSON.parse(k)))
    : undefined;

  useEffect(() => {
    if (!debouncedQuery) {
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
      sortBy,
      sortDir,
      page,
      pageSize,
    })
      .then(setResults)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [debouncedQuery, sourceParam, servicePairsParam, sortBy, sortDir, page, pageSize]);

  const fetchExportPage = useCallback(
    (pageNum) =>
      getLogs({
        search: debouncedQuery,
        source: sourceParam,
        servicePairs: servicePairsParam,
        sortBy,
        sortDir,
        page: pageNum,
        pageSize,
      }).then((result) => result.entries),
    [debouncedQuery, sourceParam, servicePairsParam, sortBy, sortDir, pageSize]
  );

  function toggleSource(id) {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleService(key) {
    setSelectedServiceKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="home-page">
      <div className="chart-card global-search-card">
        <div className="chart-header">
          <div>
            <h2>Alle Quellen durchsuchen</h2>
            <p className="chart-subtitle">Volltextsuche, wahlweise eingeschränkt auf bestimmte Quellen und Services</p>
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
              Services{selectedServiceKeys.size > 0 && (
                <span className="filter-group-hint"> ({selectedServiceKeys.size} ausgewählt)</span>
              )}
            </span>
            <div className="filter-group source-toggles wrap-toggles" role="group" aria-label="Service einschränken">
              {availableServices.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`level-chip source-chip${selectedServiceKeys.has(s.key) ? " active" : ""}`}
                  onClick={() => toggleService(s.key)}
                  aria-pressed={selectedServiceKeys.has(s.key)}
                >
                  {s.service}
                  {serviceNameCounts.get(s.service) > 1 && (
                    <span className="chip-source-hint"> ({s.sourceName})</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {debouncedQuery ? (
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
          onFetchPage={fetchExportPage}
        />
      ) : (
        <div className="chart-card">
          <p className="chart-empty">Suchbegriff eingeben, um die ausgewählten Log-Quellen zu durchsuchen.</p>
        </div>
      )}
    </div>
  );
}
