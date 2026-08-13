import { useEffect, useState } from "react";
import { getErrorCounts } from "../api";
import CollapsibleSection from "./CollapsibleSection";

const WINDOWS = [
  { label: "24 Std.", hours: 24 },
  { label: "48 Std.", hours: 48 },
  { label: "72 Std.", hours: 72 },
  { label: "1 Woche", hours: 168 },
];

// Traffic light, thresholds configurable in Einstellungen (Fehler-Schwellenwerte).
function severity(count, warningThreshold, criticalThreshold) {
  if (count >= criticalThreshold) return "critical";
  if (count >= warningThreshold) return "warning";
  return "good";
}

// Error count per source over a chosen time window, with a red/amber/green
// indicator per row — collapsed by default so nothing is fetched until
// opened. Separate from the "Fehler nach Service (24h)" chart above (that
// one is per-service and fixed to 24h; this is per-source with a wider,
// user-chosen window, going back up to a week or a custom value).
export default function ErrorsBySourceSection({ refreshSignal, errorWarningThreshold = 1, errorCriticalThreshold = 10 }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState(24);
  const [customOpen, setCustomOpen] = useState(false);
  const [customHours, setCustomHours] = useState("");
  const hours = customOpen ? Math.max(1, parseInt(customHours, 10) || 24) : preset;

  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    getErrorCounts({ hours })
      .then((res) => setCounts(res.counts))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, hours, refreshSignal]);

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
            className="export-range-input"
            placeholder="Stunden"
            value={customHours}
            onChange={(e) => setCustomHours(e.target.value)}
            aria-label="Eigener Zeitraum in Stunden"
          />
        )}
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
                className={`error-count-value severity-${severity(c.count, errorWarningThreshold, errorCriticalThreshold)}`}
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
