import { useState } from "react";
import { LEVEL_COLORS } from "../levelColors";
import FormattedMessage, { isStackTraceMessage } from "../stackTrace";
import { copyPlainText } from "../clipboard";
import { CopyIcon, CheckIcon } from "./icons";

function formatTimestamp(iso) {
  const [datePart, timePart] = iso.split("T");
  const [y, m, d] = datePart.split("-");
  return `${d}.${m}.${y} ${timePart}`;
}

function MessageCopyButton({ message }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await copyPlainText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      className="message-copy-button"
      onClick={handleCopy}
      title="Nachricht kopieren"
      aria-label="Nachricht kopieren"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

// The label/value grid + message block used to show one log entry's details.
// Shared by LogEntryModal (single entry, two columns) and CompareEntriesModal
// (one of these per side-by-side column, single column).
export default function EntryFields({ entry, singleColumn = false }) {
  return (
    <>
      <div className={`modal-grid${singleColumn ? " modal-grid-single" : ""}`}>
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
        <div className="modal-label-row">
          <span className="modal-label">Nachricht</span>
          <MessageCopyButton message={entry.message} />
        </div>
        <pre className={`modal-message${isStackTraceMessage(entry.message) ? " st-block" : ""}`}>
          <FormattedMessage message={entry.message} />
        </pre>
      </div>
    </>
  );
}
