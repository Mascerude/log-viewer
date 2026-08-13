import { useEffect, useState } from "react";
import { getErrorCounts } from "../api";
import { errorSeverity } from "../errorSeverity";
import CollapsibleSection from "./CollapsibleSection";
import { RefreshIcon } from "./icons";

const WINDOWS = [
  { label: "24 Std.", hours: 24 },
  { label: "48 Std.", hours: 48 },
  { label: "72 Std.", hours: 72 },
  { label: "1 Woche", hours: 168 },
];

// A year — generous for "eigene Stunden", but keeps a mistyped huge number
// from triggering a full-history scan across every source.
const MAX_CUSTOM_HOURS = 8760;

// Error count per source over a chosen time window, with a red/amber/green
// indicator per row — collapsed by default so nothing is fetched until
// opened. Separate from the "Fehler nach Service (24h)" chart above (that
// one is per-service and fixed to 24h; this is per-source with a wider,
// user-chosen window, going back up to a week or a custom value).
//
// Deliberately does NOT auto-refresh on a timer (see RecentErrorsSection.jsx
// for why) — fetches once per open/window change, plus an explicit
// "Aktualisieren" button.
export default function ErrorsBySourceSection({ errorWarningThreshold = 1, errorCriticalThreshold = 10 }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState(24);
  const [customOpen, setCustomOpen] = useState(false);
  const [customHours, setCustomHours] = useState("");
  const hours = customOpen ? Math.min(MAX_CUSTOM_HOURS, Math.max(1, parseInt(customHours, 10) || 24)) : preset;

  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    getErrorCounts({ hours })
      .then((res) => setCounts(res.counts))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, hours, reloadTick]);

  return (
    <CollapsibleSection
      title="Fehler pro Quelle"
      subtitle="Fehleranzahl je Quelle über einen wählbaren Zeitraum."
      open={open}
      onToggle={() => setOpen((o) => !o)}
    >
      <div className="occurrence-scope" role="group" aria-label="Zeitraum">
        {WINDOWS.map((w) => (
          <button
            key={w.hours}
            type="button"
            className={`occurrence-scope-chip${!customOpen && preset === w.hours ? " active" : ""}`}
            onClick={() => {
              setCustomOpen(false);
              setPreset(w.hours);
            }}
          >
            {w.label}
          </button>
        ))}
        <button
          type="button"
          className={`occurrence-scope-chip${customOpen ? " active" : ""}`}
          onClick={() => setCustomOpen(true)}
        >
          Eigene…
        </button>
        {customOpen && (
          <input
            type="number"
            min="1"
            max={MAX_CUSTOM_HOURS}
            className="export-range-input"
            placeholder="Stunden"
            value={customHours}
            onChange={(e) => setCustomHours(e.target.value)}
            aria-label="Eigener Zeitraum in Stunden"
            title={`Bis zu ${MAX_CUSTOM_HOURS} Stunden (1 Jahr)`}
          />
        )}
        <button type="button" className="settings-button" onClick={() => setReloadTick((t) => t + 1)} disabled={loading}>
          <RefreshIcon className={loading ? "icon-spin" : undefined} /> Aktualisieren
        </button>
      </div>

      {error && <div className="table-error">{error}</div>}

      {counts.length === 0 && !loading ? (
        <p className="chart-subtitle">Keine Quellen vorhanden.</p>
      ) : (
        <div className="error-count-list">
          {counts.map((c) => (
            <div key={c.sourceId} className="error-count-row">
              <span className="error-count-name">{c.sourceName}</span>
              <span
                className={`error-count-value severity-${errorSeverity(c.count, errorWarningThreshold, errorCriticalThreshold)}`}
              >
                {c.count.toLocaleString("de-DE")}
              </span>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
