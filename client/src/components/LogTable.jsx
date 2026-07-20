import { useEffect, useMemo, useState } from "react";
import { LEVEL_COLORS } from "../levelColors";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import LogEntryModal from "./LogEntryModal";
import CompareEntriesModal from "./CompareEntriesModal";
import FormattedMessage from "../stackTrace";

const MAX_COMPARE = 5;

function formatTimestamp(iso) {
  const [datePart, timePart] = iso.split("T");
  const [y, m, d] = datePart.split("-");
  return `${d}.${m}.${y} ${timePart}`;
}

export default function LogTable({ entries, total, page, pageSize, loading, error, showSource, onPageChange }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const colCount = showSource ? 6 : 5;
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [selected, setSelected] = useState(() => new Map());
  const [compareOpen, setCompareOpen] = useState(false);

  function toggleSelected(entry) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(entry.id)) {
        next.delete(entry.id);
      } else {
        if (next.size >= MAX_COMPARE) return prev;
        next.set(entry.id, entry);
      }
      return next;
    });
  }

  function handleRowClick(e, entry) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    toggleSelected(entry);
  }

  // Enter opens the compare modal as long as at least two rows are marked
  // and the user isn't typing in a filter field at the time.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== "Enter" || selected.size < 2) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      setCompareOpen(true);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selected]);

  const compareEntries = useMemo(
    () => Array.from(selected.values()).sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1)),
    [selected]
  );

  return (
    <div className="table-card">
      <div className="table-header">
        <h2>Log-Einträge</h2>
        <span className="table-count">
          {total.toLocaleString("de-DE")} Einträge{loading ? " · lädt..." : ""}
        </span>
      </div>

      {error && <div className="table-error">{error}</div>}

      {selected.size > 0 && (
        <div className="compare-toolbar">
          <span className="compare-toolbar-info">
            {selected.size} von max. {MAX_COMPARE} markiert · Strg+Klick zum Markieren
          </span>
          <div className="compare-toolbar-actions">
            <button type="button" className="compare-clear-button" onClick={() => setSelected(new Map())}>
              Auswahl aufheben
            </button>
            <button
              type="button"
              className="settings-button"
              disabled={selected.size < 2}
              onClick={() => setCompareOpen(true)}
            >
              Vergleichen
            </button>
          </div>
        </div>
      )}

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
              <tr
                key={e.id}
                style={{ "--row-color": LEVEL_COLORS[e.levelName] }}
                className={`log-row${selected.has(e.id) ? " selected" : ""}`}
                onDoubleClick={() => setSelectedEntry(e)}
                onClick={(evt) => handleRowClick(evt, e)}
                title="Doppelklick: Details · Strg+Klick: zum Vergleich markieren"
              >
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
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeftIcon /> Zurück
        </button>
        <span>
          Seite {page} von {pageCount}
        </span>
        <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          Weiter <ChevronRightIcon />
        </button>
      </div>

      <LogEntryModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      {compareOpen && <CompareEntriesModal entries={compareEntries} onClose={() => setCompareOpen(false)} />}
    </div>
  );
}
