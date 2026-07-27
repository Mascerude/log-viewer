import { useState } from "react";

const PRESETS = [20, 50, 100, 200];

// A page size not in PRESETS means the user previously typed a custom value
// (or a parent picked a non-preset default) — start with the number input
// already open so that value stays visible instead of silently snapping to
// the nearest preset.
export default function PageSizeSelect({ pageSize, onChange, max = 1000 }) {
  const [customOpen, setCustomOpen] = useState(() => !PRESETS.includes(pageSize));

  function handleSelect(e) {
    if (e.target.value === "custom") {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onChange(Number(e.target.value));
  }

  function handleCustomChange(e) {
    const num = parseInt(e.target.value, 10);
    if (Number.isFinite(num) && num > 0) onChange(Math.min(num, max));
  }

  return (
    <div className="page-size-control">
      <label htmlFor="page-size-select">Pro Seite</label>
      <select id="page-size-select" value={customOpen ? "custom" : String(pageSize)} onChange={handleSelect}>
        {PRESETS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        <option value="custom">Eigene…</option>
      </select>
      {customOpen && (
        <input
          type="number"
          min={1}
          max={max}
          value={pageSize}
          onChange={handleCustomChange}
          className="page-size-custom-input"
          aria-label="Eigene Seitengröße"
        />
      )}
    </div>
  );
}
