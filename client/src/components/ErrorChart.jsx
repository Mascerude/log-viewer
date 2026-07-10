import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { LEVEL_COLORS, LEVEL_ORDER } from "../levelColors";

function formatDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((sum, p) => sum + (p.value || 0), 0);
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-date">{label}</div>
      {payload
        .filter((p) => p.value > 0)
        .map((p) => (
          <div key={p.dataKey} className="chart-tooltip-row">
            <span className="level-dot" style={{ "--badge-color": p.fill }} />
            <span>{p.dataKey}</span>
            <span className="chart-tooltip-value">{p.value}</span>
          </div>
        ))}
      <div className="chart-tooltip-row chart-tooltip-total">
        <span>Gesamt</span>
        <span className="chart-tooltip-value">{total}</span>
      </div>
    </div>
  );
}

export default function ErrorChart({ stats, visibleLevels, onToggleLevel, onSelectDayLevel }) {
  const data = stats.map((s) => ({ ...s, label: formatDate(s.date) }));

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <h2>Log-Einträge pro Tag</h2>
          <p className="chart-subtitle">
            Nach Schweregrad, gefiltert nach Zeitraum
            {onSelectDayLevel && " · Klick auf einen Balken filtert Tag & Level"}
          </p>
        </div>
        <div className="chart-legend" role="group" aria-label="Level im Diagramm ein-/ausblenden">
          {LEVEL_ORDER.map((name) => {
            const active = visibleLevels.has(name);
            return (
              <button
                key={name}
                type="button"
                className={`legend-chip${active ? " active" : ""}`}
                style={{ "--chip-color": LEVEL_COLORS[name] }}
                onClick={() => onToggleLevel(name)}
                aria-pressed={active}
              >
                <span className="level-dot" aria-hidden="true" />
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="chart-empty">Keine Daten im gewählten Zeitraum.</div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} barGap={2} barCategoryGap="20%">
            <CartesianGrid stroke="var(--gridline)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--muted)", fontSize: 13 }}
              axisLine={{ stroke: "var(--baseline)" }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "var(--muted)", fontSize: 13 }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--accent-bg)" }} />
            {LEVEL_ORDER.filter((name) => visibleLevels.has(name)).map((name) => (
              <Bar
                key={name}
                dataKey={name}
                fill={LEVEL_COLORS[name]}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                style={{ cursor: onSelectDayLevel ? "pointer" : undefined }}
                onClick={(entry) => onSelectDayLevel?.(entry.payload?.date ?? entry.date, name)}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
