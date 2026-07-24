import { useEffect, useMemo, useState } from "react";
import { getLogs } from "../api";
import { SearchIcon, CloseIcon } from "./icons";
import LogTable from "./LogTable";

const SEARCH_PAGE_SIZE = 50;

export default function SearchPage({ sources, files }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] = useState(() => new Set());
  const [selectedServices, setSelectedServices] = useState(() => new Set());
  const [page, setPage] = useState(1);
  const [results, setResults] = useState({ entries: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const availableServices = useMemo(() => {
    const relevant = selectedSourceIds.size
      ? files.filter((f) => selectedSourceIds.has(f.sourceId))
      : files;
    return Array.from(new Set(relevant.map((f) => f.service).filter(Boolean))).sort();
  }, [files, selectedSourceIds]);

  // Narrowing the selected sources can make a previously-picked service
  // unavailable — drop it rather than silently keep filtering by a service
  // that's no longer in scope.
  useEffect(() => {
    setSelectedServices((prev) => {
      const next = new Set(Array.from(prev).filter((s) => availableServices.includes(s)));
      return next.size === prev.size ? prev : next;
    });
  }, [availableServices]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, selectedSourceIds, selectedServices]);

  const sourceParam = selectedSourceIds.size ? Array.from(selectedSourceIds).join(",") : undefined;
  const serviceParam = selectedServices.size ? Array.from(selectedServices).join(",") : undefined;

  useEffect(() => {
    if (!debouncedQuery) {
      setResults({ entries: [], total: 0 });
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    getLogs({ search: debouncedQuery, source: sourceParam, service: serviceParam, page, pageSize: SEARCH_PAGE_SIZE })
      .then(setResults)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [debouncedQuery, sourceParam, serviceParam, page]);

  function toggleSource(id) {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleService(name) {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
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
            <div className="filter-group source-toggles" role="group" aria-label="Quelle einschränken">
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
              Services{selectedServices.size > 0 && (
                <span className="filter-group-hint"> ({selectedServices.size} ausgewählt)</span>
              )}
            </span>
            <div className="filter-group source-toggles" role="group" aria-label="Service einschränken">
              {availableServices.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`level-chip source-chip${selectedServices.has(name) ? " active" : ""}`}
                  onClick={() => toggleService(name)}
                  aria-pressed={selectedServices.has(name)}
                >
                  {name}
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
          pageSize={SEARCH_PAGE_SIZE}
          loading={loading}
          error={error}
          showSource
          showService
          onPageChange={setPage}
        />
      ) : (
        <div className="chart-card">
          <p className="chart-empty">Suchbegriff eingeben, um die ausgewählten Log-Quellen zu durchsuchen.</p>
        </div>
      )}
    </div>
  );
}
