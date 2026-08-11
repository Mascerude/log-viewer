import { useEffect, useRef, useState } from "react";
import { DownloadIcon } from "./icons";
import { usePdfJobs } from "../pdfJobsContext";

// "DD.MM.YYYY_HH-mm" — a hyphen rather than a colon in the time so the
// filename stays valid on Windows without needing extra sanitizing.
function exportTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

// Starts a background PDF-export job (see pdfJobsContext.jsx) for the
// current table. "Seite X bis Y" and "Alle Seiten" don't need the client to
// fetch anything extra anymore — the job is handed `exportQuery` (the exact
// same filter/sort params the table itself uses) plus the requested page
// range, and re-derives + paginates the entries itself server-side.
export default function ExportMenu({
  page,
  pageCount,
  pageSize,
  total,
  showSource,
  showService,
  title,
  filename,
  exportQuery,
  exportKind,
}) {
  const { startJob } = usePdfJobs();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("current");
  const [fromPage, setFromPage] = useState(page);
  const [toPage, setToPage] = useState(page);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setFromPage(page);
    setToPage(page);
  }, [open, page]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      let range = {};
      if (mode === "current") {
        range = { fromPage: page, toPage: page, pageSize };
      } else if (mode === "range") {
        const lo = Math.max(1, Math.min(fromPage, toPage));
        const hi = Math.min(pageCount, Math.max(fromPage, toPage));
        range = { fromPage: lo, toPage: hi, pageSize };
      }
      // mode === "all" sends no fromPage/toPage — the job returns everything.
      await startJob({
        kind: exportKind,
        title,
        filename: `${filename || title || "export"}_${exportTimestamp()}`,
        showSource,
        showService,
        ...exportQuery,
        ...range,
      });
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="export-menu" ref={rootRef}>
      <button type="button" className="settings-button" onClick={() => setOpen((o) => !o)}>
        <DownloadIcon /> Exportieren
      </button>
      {open && (
        <div className="export-menu-panel">
          <label className="export-mode-option">
            <input type="radio" checked={mode === "current"} onChange={() => setMode("current")} />
            Aktuelle Seite ({page} von {pageCount})
          </label>
          <label className="export-mode-option">
            <input type="radio" checked={mode === "range"} onChange={() => setMode("range")} />
            Seite
            <input
              type="number"
              min={1}
              max={pageCount}
              className="export-range-input"
              value={fromPage}
              onChange={(e) => {
                setMode("range");
                setFromPage(Number(e.target.value));
              }}
            />
            bis
            <input
              type="number"
              min={1}
              max={pageCount}
              className="export-range-input"
              value={toPage}
              onChange={(e) => {
                setMode("range");
                setToPage(Number(e.target.value));
              }}
            />
          </label>
          <label className="export-mode-option">
            <input type="radio" checked={mode === "all"} onChange={() => setMode("all")} />
            Alle Seiten ({total.toLocaleString("de-DE")} Einträge)
          </label>

          <button type="button" onClick={handleExport} disabled={exporting}>
            {exporting ? "Job wird gestartet..." : "Als PDF exportieren"}
          </button>
          {error && <div className="settings-result settings-error export-menu-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
