import { useEffect } from "react";
import { CloseIcon, AlertIcon } from "./icons";

// Shown when opening a share link (?share=<id>) turns up something missing —
// either the link itself is gone (deleted from Server-Diagnose, or never
// existed) or one/more of the entries it points at can no longer be found
// (the source's file was rotated away or deleted since the link was
// created). `missingRefs` is only ever non-empty for a still-valid share
// whose entries are partially/fully gone — see resolveSharedEntries in
// App.jsx. `onShowFound` lets the user proceed to see whatever entries of a
// compare share *were* still found; omitted (or there's nothing left to
// show) when there's nothing to proceed to.
export default function ShareMissingModal({ message, missingRefs, onShowFound, onClose }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Geteilter Link nicht mehr verfügbar">
        <div className="modal-header">
          <h2>Geteilter Link nicht mehr verfügbar</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          <div className="table-error share-missing-warning">
            <AlertIcon /> {message}
          </div>

          {missingRefs?.length > 0 && (
            <ul className="share-missing-list">
              {missingRefs.map((ref, i) => (
                <li key={i}>
                  {ref.sourceName} · {ref.service} · <code>{ref.fileName}</code>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Schließen
          </button>
          {onShowFound && (
            <button type="button" onClick={onShowFound}>
              Verbleibende trotzdem anzeigen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
