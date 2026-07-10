import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { AlertIcon, RefreshIcon } from "./icons";

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

export default function HomePage({ summary, loading, error, updatedAt, onRefresh, onSelectService }) {
  const total = summary?.totalErrorsLast24h ?? 0;
  const byService = summary?.byService ?? [];
  const servers = summary?.servers ?? [];
  const data = byService.map((s) => ({ ...s, label: `${s.sourceName} · ${s.service}` }));

  return (
    <div className="home-page">
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
