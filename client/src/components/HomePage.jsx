import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { AlertIcon, RefreshIcon } from "./icons";
import RecentErrorsSection from "./RecentErrorsSection";
import ErrorsBySourceSection from "./ErrorsBySourceSection";

function ServiceTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-date">{p.sourceName}</div>
      <div className="chart-tooltip-row">
        <span>{p.service}</span>
        <span className="chart-tooltip-value">{p.count}</span>
      </div>
    </div>
  );
}

// Heads-up (>= 90% of the heap limit) or full emergency mode (>= 95%, PDF
// jobs blocked server-side and Reload-Übersicht's automatic reloads paused
// — see server/index.js). A real V8 OOM crash can't be caught in JS, so
// this is the app's only real shot at surfacing the danger before it
// happens, per the crash logs this session ran into twice already.
function HeapHealthBanner({ health, onClearEmergency, onSelectDiagnostics }) {
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState(null);

  if (!health.emergencyMode && !health.heapWarning) return null;

  async function handleClear() {
    setClearing(true);
    setClearError(null);
    try {
      await onClearEmergency();
    } catch (err) {
      setClearError(err.message);
    } finally {
      setClearing(false);
    }
  }

  if (health.emergencyMode) {
    return (
      <div className="heap-banner heap-banner-emergency">
        <AlertIcon className="heap-banner-icon" aria-hidden="true" />
        <div className="heap-banner-body">
          <div className="heap-banner-title">
            Notfallmodus aktiv — Speicherverbrauch kritisch ({health.heapPct}%)
          </div>
          <p>
            {health.emergencyReason} PDF-Exporte sind deaktiviert und die automatischen Reloads der
            Reload-Übersicht pausiert, damit sich der Server erholen kann.
          </p>
          <p>
            <strong>So beheben:</strong> 1) Zur Server-Diagnose gehen · 2) Datei-Cache leeren und/oder Garbage
            Collection ausführen · 3) Falls das nicht reicht, die maximale Heap-Größe erhöhen und den Server
            manuell neu starten · 4) Sobald der Verbrauch wieder im normalen Bereich ist, hier den Notfallmodus
            beenden.
          </p>
          <div className="heap-banner-actions">
            <button type="button" className="settings-button" onClick={onSelectDiagnostics}>
              Zur Server-Diagnose
            </button>
            <button type="button" className="settings-button danger" onClick={handleClear} disabled={clearing}>
              {clearing ? "Prüft..." : "Notfallmodus beenden"}
            </button>
          </div>
          {clearError && <div className="settings-result settings-error">{clearError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="heap-banner heap-banner-warning">
      <AlertIcon className="heap-banner-icon" aria-hidden="true" />
      <div className="heap-banner-body">
        <div className="heap-banner-title">Hoher Speicherverbrauch ({health.heapPct}% des Heap-Limits)</div>
        <p>
          Empfehlung: auf der Server-Diagnose-Seite eine Garbage Collection ausführen oder den Datei-Cache leeren.
          Passiert das dauerhaft, die maximale Heap-Größe in den Einstellungen erhöhen und den Server neu starten.
        </p>
        <div className="heap-banner-actions">
          <button type="button" className="settings-button" onClick={onSelectDiagnostics}>
            Zur Server-Diagnose
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HomePage({
  summary,
  loading,
  error,
  updatedAt,
  onRefresh,
  onSelectService,
  errorWarningThreshold,
  errorCriticalThreshold,
  health,
  onClearEmergency,
  onSelectDiagnostics,
}) {
  const total = summary?.totalErrorsLast24h ?? 0;
  const byService = summary?.byService ?? [];
  const servers = summary?.servers ?? [];
  const data = byService.map((s) => ({ ...s, label: `${s.sourceName} · ${s.service}` }));

  return (
    <div className="home-page">
      {health && (
        <HeapHealthBanner health={health} onClearEmergency={onClearEmergency} onSelectDiagnostics={onSelectDiagnostics} />
      )}

      <div className="stat-tile-row">
        <div className="stat-tile stat-tile-hero">
          <div className="stat-tile-icon" aria-hidden="true">
            <AlertIcon />
          </div>
          <div>
            <div className="stat-tile-label">Alle Fehler der letzten 24 Stunden</div>
            <div className="stat-tile-value">{loading ? "…" : total.toLocaleString("de-DE")}</div>
          </div>
        </div>
      </div>

      {error && <div className="table-error">{error}</div>}

      <div className="chart-card">
        <div className="chart-header">
          <div>
            <h2>Fehler nach Service (24h)</h2>
            <p className="chart-subtitle">
              Rollierendes 24-Stunden-Fenster, absteigend sortiert · Klick auf einen Balken öffnet den Service
            </p>
          </div>
        </div>
        {data.length === 0 ? (
          <div className="chart-empty">Keine Fehler in den letzten 24 Stunden.</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(120, data.length * 40)}>
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid stroke="var(--gridline)" horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: "var(--muted)", fontSize: 12 }}
                axisLine={{ stroke: "var(--baseline)" }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={260}
                tick={{ fill: "var(--text-h)", fontSize: 12.5 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ServiceTooltip />} cursor={{ fill: "var(--accent-bg)" }} />
              <Bar
                dataKey="count"
                fill="var(--critical)"
                radius={[0, 4, 4, 0]}
                maxBarSize={20}
                style={{ cursor: onSelectService ? "pointer" : undefined }}
                onClick={(entry) => onSelectService?.(entry.sourceId, entry.service, entry.sourceName)}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <RecentErrorsSection />
      <ErrorsBySourceSection
        errorWarningThreshold={errorWarningThreshold}
        errorCriticalThreshold={errorCriticalThreshold}
      />

      <div className="chart-card">
        <div className="chart-header">
          <div>
            <h2>Server-Status</h2>
            <p className="chart-subtitle">
              Eigenständige Server, unabhängig von den Log-Quellen. Erreichbarkeit per Ping,
              Windows-Dienste darauf per <code>sc query</code> (alle 30s).
            </p>
          </div>
          <div className="refresh-info">
            {updatedAt && <span>Aktualisiert: {updatedAt.toLocaleTimeString("de-DE")}</span>}
            <button type="button" className="settings-button" onClick={onRefresh} disabled={loading}>
              <RefreshIcon className={loading ? "icon-spin" : undefined} />
              {loading ? "Aktualisiert..." : "Jetzt aktualisieren"}
            </button>
          </div>
        </div>
        <div className="status-list">
          {servers.map((s) => (
            <div key={s.id} className="status-server-block">
              <div className="status-row">
                <span className={`status-dot ${s.online ? "status-online" : "status-offline"}`} aria-hidden="true" />
                <span className="status-name">{s.name}</span>
                <span className={`status-pill ${s.online ? "status-pill-online" : "status-pill-offline"}`}>
                  {s.online ? "Online" : "Offline"}
                </span>
                <code className="status-path">{s.host}</code>
              </div>
              {s.services.length > 0 && (
                <div className="status-service-list">
                  {s.services.map((svc) => (
                    <div key={svc.id} className="status-service-row">
                      <span
                        className={`status-dot ${svc.online ? "status-online" : "status-offline"}`}
                        aria-hidden="true"
                      />
                      <span className="status-service-name">{svc.name}</span>
                      <code className="status-service-port">{svc.serviceName}</code>
                      <span className={`status-pill ${svc.online ? "status-pill-online" : "status-pill-offline"}`}>
                        {svc.online ? "Läuft" : "Gestoppt"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {servers.length === 0 && <p className="chart-subtitle">Noch kein Server konfiguriert.</p>}
        </div>
      </div>
    </div>
  );
}
