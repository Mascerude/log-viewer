import { MAX_COMPARE } from "../useCompareSelection";

export default function CompareToolbar({ count, onClear, onCompare }) {
  if (count === 0) return null;

  return (
    <div className="compare-toolbar">
      <span className="compare-toolbar-info">
        {count} von max. {MAX_COMPARE} markiert · Strg+Klick zum Markieren
      </span>
      <div className="compare-toolbar-actions">
        <button type="button" className="compare-clear-button" onClick={onClear}>
          Auswahl aufheben
        </button>
        <button type="button" className="settings-button" disabled={count < 2} onClick={onCompare}>
          Vergleichen
        </button>
      </div>
    </div>
  );
}
