import { LEVEL_COLORS } from "../levelColors";

function formatTimestamp(iso) {
  const [datePart, timePart] = iso.split("T");
  const [y, m, d] = datePart.split("-");
  return `${d}.${m}.${y} ${timePart}`;
}

export default function LogTable({ entries, total, page, pageSize, loading, error, showSource, onPageChange }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const colCount = showSource ? 6 : 5;

  return (
    <div className="table-card">
      <div className="table-header">
        <h2>Log-Einträge</h2>
        <span className="table-count">
          {total.toLocaleString("de-DE")} Einträge{loading ? " · lädt..." : ""}
        </span>
      </div>

      {error && <div className="table-error">{error}</div>}

      <div className="table-scroll">
        <table className="log-table">
          <thead>
            <tr>
              <th className="col-time">Zeitstempel</th>
              <th className="col-level">Level</th>
              {showSource && <th className="col-source">Server</th>}
              <th className="col-pid">PID</th>
              <th className="col-tid">TID</th>
              <th className="col-message">Nachricht</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && !loading && (
              <tr>
                <td colSpan={colCount} className="table-empty">
                  Keine Einträge für die aktuellen Filter.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} style={{ "--row-color": LEVEL_COLORS[e.levelName] }}>
                <td className="col-time">{formatTimestamp(e.timestamp)}</td>
                <td className="col-level">
                  <span className="level-badge" style={{ "--badge-color": LEVEL_COLORS[e.levelName] }}>
                    <span className="level-dot" aria-hidden="true" />
                    {e.levelName}
                  </span>
                </td>
                {showSource && <td className="col-source">{e.sourceName}</td>}
                <td className="col-pid">{e.pid}</td>
                <td className="col-tid">{e.tid}</td>
                <td className="col-message">
                  <pre>{e.message}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          ← Zurück
        </button>
        <span>
          Seite {page} von {pageCount}
        </span>
        <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          Weiter →
        </button>
      </div>
    </div>
  );
}
