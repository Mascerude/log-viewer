import { useEffect, useState } from "react";
import { LEVEL_COLORS } from "../levelColors";
import { CloseIcon, CopyIcon, CheckIcon } from "./icons";
import FormattedMessage, { isStackTraceMessage } from "../stackTrace";

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

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setCopied(false);
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
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Log-Eintrag Details">
        <div className="modal-header">
          <h2>Log-Eintrag</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-grid">
            <div className="modal-field">
              <span className="modal-label">Zeitstempel</span>
              <span className="modal-value modal-value-mono">{formatTimestamp(entry.timestamp)}</span>
            </div>
            <div className="modal-field">
              <span className="modal-label">Level</span>
              <span className="modal-value">
                <span className="level-badge" style={{ "--badge-color": LEVEL_COLORS[entry.levelName] }}>
                  <span className="level-dot" aria-hidden="true" />
                  {entry.levelName}
                </span>
              </span>
            </div>
            {entry.sourceName && (
              <div className="modal-field">
                <span className="modal-label">Quelle</span>
                <span className="modal-value">{entry.sourceName}</span>
              </div>
            )}
            {entry.service && (
              <div className="modal-field">
                <span className="modal-label">Service</span>
                <span className="modal-value">{entry.service}</span>
              </div>
            )}
            <div className="modal-field">
              <span className="modal-label">PID</span>
              <span className="modal-value modal-value-mono">{entry.pid}</span>
            </div>
            <div className="modal-field">
              <span className="modal-label">TID</span>
              <span className="modal-value modal-value-mono">{entry.tid}</span>
            </div>
            {entry.file && (
              <div className="modal-field modal-field-wide">
                <span className="modal-label">Datei</span>
                <span className="modal-value modal-value-mono">{entry.file}</span>
              </div>
            )}
          </div>

          <div className="modal-field modal-field-wide">
            <span className="modal-label">Nachricht</span>
            <pre className={`modal-message${isStackTraceMessage(entry.message) ? " st-block" : ""}`}>
              <FormattedMessage message={entry.message} />
            </pre>
          </div>
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
