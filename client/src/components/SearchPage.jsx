import { useEffect, useState } from "react";
import { getLogs } from "../api";
import { SearchIcon, CloseIcon } from "./icons";
import LogTable from "./LogTable";

const SEARCH_PAGE_SIZE = 50;

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState({ entries: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  useEffect(() => {
    if (!debouncedQuery) {
      setResults({ entries: [], total: 0 });
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    getLogs({ search: debouncedQuery, page, pageSize: SEARCH_PAGE_SIZE })
      .then(setResults)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [debouncedQuery, page]);

  return (
    <div className="home-page">
      <div className="chart-card global-search-card">
        <div className="chart-header">
          <div>
            <h2>Alle Quellen durchsuchen</h2>
            <p className="chart-subtitle">Volltextsuche über sämtliche Log-Quellen und Services, ohne Zeitraumbegrenzung</p>
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
          <p className="chart-empty">Suchbegriff eingeben, um alle Log-Quellen zu durchsuchen.</p>
        </div>
      )}
    </div>
  );
}
