import { useEffect, useState } from "react";
import { getMessageOccurrences } from "../api";
import { LEVEL_COLORS } from "../levelColors";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import LogEntryModal from "./LogEntryModal";

function formatTimestamp(iso) {
  const [datePart, timePart] = iso.split("T");
  const [y, m, d] = datePart.split("-");
  return `${d}.${m}.${y} ${timePart}`;
}

const SCOPES = [
  { value: "service", label: "Dieser Service" },
  { value: "source", label: "Diese Quelle" },
  { value: "global", label: "Global" },
];

const MODES = [
  { value: "exact", label: "Exakt", hint: "Nachricht muss identisch sein" },
  { value: "similar", label: "Ähnlich", hint: "Zahlen/IDs in der Nachricht werden ignoriert" },
];

const PAGE_SIZE = 50;

export default function MessageOccurrences({ message, sourceId, service }) {
  const [scope, setScope] = useState("service");
  const [mode, setMode] = useState("exact");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);

  useEffect(() => {
    setPage(1);
  }, [scope, mode]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getMessageOccurrences({ message, scope, mode, sourceId, service, page, pageSize: PAGE_SIZE })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [message, scope, mode, sourceId, service, page]);

  const counts = data?.counts;
  const entries = data?.entries ?? [];
  const pageCount = counts ? Math.max(1, Math.ceil(counts.total / PAGE_SIZE)) : 1;
  const showSource = scope === "global";
  const showService = scope !== "service";
  const showMessage = mode === "similar";
  const colCount = 4 + (showSource ? 1 : 0) + (showService ? 1 : 0) + (showMessage ? 1 : 0);

  return (
    <div className="occurrence-panel">
      <div className="occurrence-toggle-row">
        <span className="occurrence-toggle-label">Modus</span>
        <div className="occurrence-scope" role="group" aria-label="Suchmodus">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              className={`occurrence-scope-chip${mode === m.value ? " active" : ""}`}
              onClick={() => setMode(m.value)}
              aria-pressed={mode === m.value}
              title={m.hint}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="occurrence-toggle-row">
        <span className="occurrence-toggle-label">Bereich</span>
        <div className="occurrence-scope" role="group" aria-label="Suchbereich">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`occurrence-scope-chip${scope === s.value ? " active" : ""}`}
              onClick={() => setScope(s.value)}
              aria-pressed={scope === s.value}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="settings-result settings-error">{error}</div>}

      <div className="occurrence-stats">
        {[
          ["24 Std.", counts?.last24h],
          ["3 Tage", counts?.last3d],
          ["7 Tage", counts?.last7d],
          ["Gesamt", counts?.total],
        ].map(([label, value]) => (
          <div className="occurrence-stat" key={label}>
            <span className="occurrence-stat-value">
              {value === undefined ? "…" : value.toLocaleString("de-DE")}
            </span>
            <span className="occurrence-stat-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="table-scroll">
        <table className="log-table occurrence-table">
          <thead>
            <tr>
              <th>Zeitstempel</th>
              <th>Level</th>
              {showSource && <th>Quelle</th>}
              {showService && <th>Service</th>}
              <th>PID</th>
              <th>TID</th>
              {showMessage && <th>Nachricht</th>}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={colCount} className="table-empty">
                  {loading ? "Lädt..." : "Keine weiteren Vorkommen gefunden."}
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr
                key={e.id}
                style={{ "--row-color": LEVEL_COLORS[e.levelName] }}
                className="log-row"
                onDoubleClick={() => setSelectedEntry(e)}
                title="Doppelklick für Details"
              >
                <td className="col-time">{formatTimestamp(e.timestamp)}</td>
                <td className="col-level">
                  <span className="level-badge" style={{ "--badge-color": LEVEL_COLORS[e.levelName] }}>
                    <span className="level-dot" aria-hidden="true" />
                    {e.levelName}
                  </span>
                </td>
                {showSource && <td>{e.sourceName}</td>}
                {showService && <td>{e.service}</td>}
                <td className="col-pid">{e.pid}</td>
                <td className="col-tid">{e.tid}</td>
                {showMessage && (
                  <td className="occurrence-message-cell" title={e.message}>
                    {e.message}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {counts && counts.total > PAGE_SIZE && (
        <div className="pagination occurrence-pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeftIcon /> Zurück
          </button>
          <span>
            Seite {page} von {pageCount}
          </span>
          <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
            Weiter <ChevronRightIcon />
          </button>
        </div>
      )}

      <LogEntryModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </div>
  );
}
