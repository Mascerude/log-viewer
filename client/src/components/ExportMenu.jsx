import { useEffect, useRef, useState } from "react";
import { DownloadIcon } from "./icons";
import { downloadLogEntriesPdf } from "../exportPdf";

// Exports the current table as a real PDF file, downloaded directly (see
// exportPdf.js). "Seite X bis Y" and "Alle Seiten" need pages beyond the one
// already loaded, so they re-fetch through `onFetchPage` — the same
// query/filters/sort the table is already showing, just a different page
// number — and concatenate the results before sending them off for export.
export default function ExportMenu({
  entries,
  page,
  pageCount,
  total,
  showSource,
  showService,
  title,
  filename,
  onFetchPage,
}) {
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

  async function fetchPages(lo, hi) {
    const chunks = [];
    for (let p = lo; p <= hi; p++) {
      chunks.push(await onFetchPage(p));
    }
    return chunks.flat();
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      let exportEntries;
      if (mode === "current") {
        exportEntries = entries;
      } else if (mode === "all") {
        exportEntries = await fetchPages(1, pageCount);
      } else {
        const lo = Math.max(1, Math.min(fromPage, toPage));
        const hi = Math.min(pageCount, Math.max(fromPage, toPage));
        exportEntries = await fetchPages(lo, hi);
      }
      await downloadLogEntriesPdf(exportEntries, { title, filename: filename || title, showSource, showService });
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
            {exporting ? "Lädt PDF herunter..." : "Als PDF herunterladen"}
          </button>
          {error && <div className="settings-result settings-error export-menu-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
