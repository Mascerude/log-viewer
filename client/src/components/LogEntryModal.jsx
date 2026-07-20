import { useEffect, useRef, useState } from "react";
import { CloseIcon, CopyIcon, CheckIcon, SearchIcon, ChevronDownIcon } from "./icons";
import MessageOccurrences from "./MessageOccurrences";
import EntryFields from "./EntryFields";
import { copyPlainText, copyRichText } from "../clipboard";

function formatTimestamp(iso) {
  const [datePart, timePart] = iso.split("T");
  const [y, m, d] = datePart.split("-");
  return `${d}.${m}.${y} ${timePart}`;
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function ticketFields(entry) {
  const fields = [
    ["Zeitstempel", formatTimestamp(entry.timestamp)],
    ["Level", entry.levelName],
  ];
  if (entry.sourceName) fields.push(["Quelle", entry.sourceName]);
  if (entry.service) fields.push(["Service", entry.service]);
  fields.push(["PID", entry.pid], ["TID", entry.tid]);
  if (entry.file) fields.push(["Datei", entry.file]);
  return fields;
}

function buildTicketText(entry) {
  const lines = ticketFields(entry).map(([label, value]) => `${label}: ${value}`);
  lines.push("", "Nachricht:", entry.message);
  return lines.join("\n");
}

// Self-contained HTML (inline styles only — the target editor won't load our
// CSS) so pasting into a rich text field like an Azure DevOps work item
// keeps bold field labels and a monospaced, line-broken message block.
function buildTicketHtml(entry) {
  const rows = ticketFields(entry)
    .map(([label, value]) => `<p style="margin:0 0 4px;"><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</p>`)
    .join("");
  const message = `<pre style="margin:0;padding:8px 10px;background:#f3f3f3;border:1px solid #ddd;border-radius:4px;font-family:Consolas,'Courier New',monospace;font-size:12.5px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(entry.message)}</pre>`;
  return `<div>${rows}<p style="margin:12px 0 4px;"><b>Nachricht:</b></p>${message}</div>`;
}

function CopyTicketMenu({ entry }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(null); // "devops" | "plain" | null
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleCopyDevOps() {
    await copyRichText(buildTicketHtml(entry), buildTicketText(entry));
    setOpen(false);
    setCopied("devops");
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleCopyPlain() {
    await copyPlainText(buildTicketText(entry));
    setOpen(false);
    setCopied("plain");
    setTimeout(() => setCopied(null), 2000);
  }

  const label =
    copied === "devops" ? "Für Azure DevOps kopiert!" : copied === "plain" ? "Kopiert!" : "Für Support-Ticket kopieren";

  return (
    <div className="copy-menu" ref={rootRef}>
      <button type="button" className="modal-copy-button" onClick={() => setOpen((o) => !o)}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {label}
        <ChevronDownIcon className="copy-menu-chevron" />
      </button>
      {open && (
        <div className="copy-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={handleCopyDevOps}>
            Für Azure DevOps kopieren
          </button>
          <button type="button" role="menuitem" onClick={handleCopyPlain}>
            In Zwischenablage kopieren
          </button>
        </div>
      )}
    </div>
  );
}

export default function LogEntryModal({ entry, onClose }) {
  const [showOccurrences, setShowOccurrences] = useState(false);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setShowOccurrences(false);
  }, [entry]);

  if (!entry) return null;

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
            <MessageOccurrences entry={entry} />
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Schließen
          </button>
          <CopyTicketMenu entry={entry} />
        </div>
      </div>
    </div>
  );
}
