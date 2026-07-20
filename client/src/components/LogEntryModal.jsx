import { useEffect, useState } from "react";
import { CloseIcon, CopyIcon, CheckIcon, SearchIcon } from "./icons";
import MessageOccurrences from "./MessageOccurrences";
import EntryFields from "./EntryFields";

function formatTimestamp(iso) {
  const [datePart, timePart] = iso.split("T");
  const [y, m, d] = datePart.split("-");
  return `${d}.${m}.${y} ${timePart}`;
}

function buildTicketText(entry) {
  const lines = [
    `Zeitstempel: ${formatTimestamp(entry.timestamp)}`,
    `Level: ${entry.levelName}`,
  ];
  if (entry.sourceName) lines.push(`Quelle: ${entry.sourceName}`);
  if (entry.service) lines.push(`Service: ${entry.service}`);
  lines.push(`PID: ${entry.pid}`, `TID: ${entry.tid}`);
  if (entry.file) lines.push(`Datei: ${entry.file}`);
  lines.push("", "Nachricht:", entry.message);
  return lines.join("\n");
}

export default function LogEntryModal({ entry, onClose }) {
  const [copied, setCopied] = useState(false);
  const [showOccurrences, setShowOccurrences] = useState(false);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setCopied(false);
    setShowOccurrences(false);
  }, [entry]);

  if (!entry) return null;

  async function handleCopy() {
    const text = buildTicketText(entry);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`modal-card${showOccurrences ? " modal-card-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Log-Eintrag Details"
      >
        <div className="modal-header">
          <h2>Log-Eintrag</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          <EntryFields entry={entry} />

          {!showOccurrences && (
            <button
              type="button"
              className="occurrence-toggle"
              onClick={() => setShowOccurrences(true)}
            >
              <SearchIcon /> Nachricht suchen
            </button>
          )}

          {showOccurrences && (
            <MessageOccurrences message={entry.message} sourceId={entry.sourceId} service={entry.service} />
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Schließen
          </button>
          <button type="button" className="modal-copy-button" onClick={handleCopy}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Kopiert!" : "Für Support-Ticket kopieren"}
          </button>
        </div>
      </div>
    </div>
  );
}
