import { useEffect, useMemo, useState } from "react";
import { CloseIcon } from "./icons";
import EntryFields from "./EntryFields";
import ToggleSwitch from "./ToggleSwitch";
import { computeMessageDiffs } from "../textDiff";

const DIFF_KEYS = ["timestamp", "levelName", "sourceName", "service", "pid", "tid", "file", "message"];

function computeDiffFields(entries) {
  const diffs = new Set();
  if (!entries || entries.length < 2) return diffs;
  for (const key of DIFF_KEYS) {
    const first = entries[0][key];
    if (entries.some((e) => e[key] !== first)) diffs.add(key);
  }
  return diffs;
}

export default function CompareEntriesModal({ entries, onClose }) {
  const [highlightDiffs, setHighlightDiffs] = useState(true);
  const [textDiff, setTextDiff] = useState(false);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const diffFields = useMemo(() => computeDiffFields(entries), [entries]);
  const messageDiffs = useMemo(() => (textDiff ? computeMessageDiffs(entries) : null), [entries, textDiff]);

  if (!entries || entries.length === 0) return null;

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal-card modal-card-compare"
        role="dialog"
        aria-modal="true"
        aria-label="Log-Einträge vergleichen"
      >
        <div className="modal-header">
          <div className="modal-header-title-group">
            <h2>Log-Einträge vergleichen ({entries.length})</h2>
            {entries.length > 1 && (
              <>
                <ToggleSwitch checked={highlightDiffs} onChange={setHighlightDiffs}>
                  Unterschiede farblich hervorheben
                </ToggleSwitch>
                <ToggleSwitch checked={textDiff} onChange={setTextDiff}>
                  Nachrichtentexte vergleichen
                </ToggleSwitch>
              </>
            )}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          <div className="compare-columns">
            {entries.map((e, i) => (
              <div key={e.id} className="compare-column">
                <div className="compare-column-header">Eintrag {i + 1}</div>
                <EntryFields
                  entry={e}
                  singleColumn
                  diffFields={highlightDiffs ? diffFields : null}
                  messageDiffTokens={messageDiffs ? messageDiffs[i] : null}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
