import { useCallback, useEffect, useState } from "react";
import { getToolLogs } from "../api";
import { LEVEL_COLORS } from "../levelColors";
import { RefreshIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";
import PageSizeSelect from "./PageSizeSelect";
import GoToPage from "./GoToPage";
import LogEntryModal from "./LogEntryModal";
import FormattedMessage from "../stackTrace";

const POLL_MS = 10_000;

function formatTimestamp(iso) {
  const [datePart, timePart] = iso.split("T");
  const [y, m, d] = datePart.split("-");
  return `${d}.${m}.${y} ${timePart}`;
}

// The tool's own error log (see server/logger.js) — only what the tool logs
// about itself (e.g. skipped files during a race on a source's network
// share), not the monitored sources' log files themselves. Only errors are
// ever written here, so there's no level filter/column — every row is one.
// Deliberately not built on LogTable: that component's export menu starts a
// PDF-export background job scoped to a real configured source, which this
// virtual "source" isn't, so reusing it as-is would offer a button that
// can't actually work.
export default function ToolLogsPage() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(200);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    getToolLogs({
      search: search || undefined,
      page,
      pageSize,
      sortBy: "timestamp",
      sortDir: "desc",
    })
      .then((res) => {
        setEntries(res.entries);
        setTotal(res.total);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [search, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="home-page">
      <div className="chart-card">
        <div className="chart-header">
          <div>
            <h2>Tool-Logs</h2>
            <p className="chart-subtitle">
              Fehler, die das Tool selbst geloggt hat — nicht die überwachten Quellen. Wird monatlich
              in eine neue Datei geschrieben.
            </p>
          </div>
          <div className="refresh-info">
            <button type="button" className="settings-button" onClick={load}>
              <RefreshIcon className={loading ? "icon-spin" : undefined} /> Jetzt aktualisieren
            </button>
          </div>
        </div>

        <div className="filter-bar">
          <div className="filter-group filter-group-search">
            <label htmlFor="tool-log-search">Suche</label>
            <input
              id="tool-log-search"
              type="text"
              placeholder="Nachricht durchsuchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="table-error">{error}</div>}

        <div className="table-scroll">
          <table className="log-table">
            <thead>
              <tr>
                <th className="col-time">Zeitstempel</th>
                <th className="col-message">Nachricht</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && !loading && (
                <tr>
                  <td colSpan={2} className="table-empty">
                    Keine Fehler für die aktuellen Filter.
                  </td>
                </tr>
              )}
              {entries.map((e) => (
                <tr
                  key={e.id}
                  style={{ "--row-color": LEVEL_COLORS[e.levelName] }}
                  className="log-row"
                  onDoubleClick={() => setSelectedEntry(e)}
                  title="Doppelklick: Details"
                >
                  <td className="col-time">{formatTimestamp(e.timestamp)}</td>
                  <td className="col-message">
                    <pre>
                      <FormattedMessage message={e.message} />
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <PageSizeSelect pageSize={pageSize} onChange={setPageSize} />
          <div className="pagination-nav">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeftIcon /> Zurück
            </button>
            <GoToPage page={page} pageCount={pageCount} onChange={setPage} />
            <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
              Weiter <ChevronRightIcon />
            </button>
          </div>
        </div>
      </div>

      <LogEntryModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </div>
  );
}
