import { useEffect } from "react";
import { CloseIcon } from "./icons";
import EntryFields from "./EntryFields";

export default function CompareEntriesModal({ entries, onClose }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!entries || entries.length === 0) return null;

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal-card modal-card-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Log-Einträge vergleichen"
      >
        <div className="modal-header">
          <h2>Log-Einträge vergleichen ({entries.length})</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          <div className="compare-columns">
            {entries.map((e, i) => (
              <div key={e.id} className="compare-column">
                <div className="compare-column-header">Eintrag {i + 1}</div>
                <EntryFields entry={e} singleColumn />
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
