import { LEVEL_COLORS, LEVEL_LETTERS, LEVEL_ORDER } from "../levelColors";
import DateRangePicker from "./DateRangePicker";
import { FilterXIcon } from "./icons";

export default function FilterBar({ filters, onChange, services, sources, minDate, maxDate }) {
  function set(patch) {
    onChange({ ...filters, ...patch });
  }

  function toggleLevel(letter) {
    const active = new Set(filters.levels);
    if (active.has(letter)) active.delete(letter);
    else active.add(letter);
    set({ levels: active });
  }

  function toggleSource(id) {
    const active = new Set(filters.sources);
    if (active.has(id)) active.delete(id);
    else active.add(id);
    set({ sources: active });
  }

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label>Zeitraum</label>
        <DateRangePicker from={filters.from} to={filters.to} minDate={minDate} maxDate={maxDate} onChange={set} />
      </div>

      <div className="filter-group level-toggles" role="group" aria-label="Level filtern">
        {LEVEL_ORDER.map((name) => {
          const letter = LEVEL_LETTERS[name];
          const active = filters.levels.has(letter);
          return (
            <button
              key={letter}
              type="button"
              className={`level-chip${active ? " active" : ""}`}
              style={{ "--chip-color": LEVEL_COLORS[name] }}
              onClick={() => toggleLevel(letter)}
              aria-pressed={active}
            >
              <span className="level-dot" aria-hidden="true" />
              {name}
            </button>
          );
        })}
      </div>

      {sources && sources.length > 1 && (
        <div className="filter-group source-toggles" role="group" aria-label="Quelle filtern">
          {sources.map((s) => {
            const active = filters.sources.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                className={`level-chip source-chip${active ? " active" : ""}${
                  !s.exists ? " source-chip-missing" : ""
                }`}
                onClick={() => toggleSource(s.id)}
                aria-pressed={active}
                title={s.exists ? s.path : `${s.path} (nicht gefunden)`}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      )}

      {services && services.length > 1 && (
        <div className="filter-group">
          <label htmlFor="service">Service</label>
          <select
            id="service"
            value={filters.service}
            onChange={(e) => set({ service: e.target.value })}
          >
            <option value="">Alle</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="filter-group">
        <label htmlFor="pid">PID</label>
        <input
          id="pid"
          type="text"
          size="6"
          value={filters.pid}
          onChange={(e) => set({ pid: e.target.value.replace(/\D/g, "") })}
        />
      </div>

      <div className="filter-group">
        <label htmlFor="tid">TID</label>
        <input
          id="tid"
          type="text"
          size="6"
          value={filters.tid}
          onChange={(e) => set({ tid: e.target.value.replace(/\D/g, "") })}
        />
      </div>

      <div className="filter-group filter-group-search">
        <label htmlFor="search">Suche</label>
        <input
          id="search"
          type="text"
          placeholder="Nachricht durchsuchen..."
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
        />
      </div>

      <button
        type="button"
        className="reset-button"
        title="Filter zurücksetzen"
        aria-label="Filter zurücksetzen"
        onClick={() =>
          set({
            from: "",
            to: "",
            levels: new Set(Object.values(LEVEL_LETTERS)),
            sources: new Set((sources || []).map((s) => s.id)),
            search: "",
            pid: "",
            tid: "",
            service: "",
          })
        }
      >
        <FilterXIcon />
      </button>
    </div>
  );
}
