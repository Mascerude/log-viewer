import { useCallback, useEffect, useState } from "react";
import { getDiagnostics, forceGc, clearParseCache, updateSettings } from "../api";
import { usePdfJobs } from "../pdfJobsContext";
import { PdfJobRow } from "./PdfJobsWidget";
import { RefreshIcon } from "./icons";

const POLL_MS = 4000;

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Live view of the server process's memory (process.memoryUsage(), see
// GET /api/diagnostics in server/index.js) plus the PDF-job list with
// delete/delete-all — added after a couple of production OOM crashes so
// there's somewhere to actually watch memory behave and intervene (stop a
// runaway export, clear finished jobs, force a GC pass) instead of only
// finding out from a crash log.
export default function ServerDiagnosticsPage() {
  const { jobs, stopJob, deleteJob, deleteAllJobs, downloadJob, refreshJobs } = usePdfJobs();
  const [diag, setDiag] = useState(null);
  const [error, setError] = useState(null);
  const [gcRunning, setGcRunning] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [maxHeapDraft, setMaxHeapDraft] = useState(null);
  const [savingMaxHeap, setSavingMaxHeap] = useState(false);
  const [maxHeapResult, setMaxHeapResult] = useState(null);
  const [warningPctDraft, setWarningPctDraft] = useState(null);
  const [savingWarningPct, setSavingWarningPct] = useState(false);
  const [warningPctResult, setWarningPctResult] = useState(null);

  const load = useCallback(() => {
    getDiagnostics()
      .then((d) => {
        setDiag(d);
        setError(null);
        // Only seed once — don't clobber an in-progress edit on later polls.
        setMaxHeapDraft((prev) => (prev === null ? d.configuredMaxHeapMB : prev));
        setWarningPctDraft((prev) => (prev === null ? d.heapWarningPct : prev));
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
    refreshJobs();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load, refreshJobs]);

  async function handleSaveMaxHeap(e) {
    e.preventDefault();
    setSavingMaxHeap(true);
    setMaxHeapResult(null);
    try {
      const updated = await updateSettings({ maxHeapMB: Number(maxHeapDraft) });
      setDiag((prev) => (prev ? { ...prev, configuredMaxHeapMB: updated.maxHeapMB } : prev));
      setMaxHeapResult({ type: "success", text: "Gespeichert — wird beim nächsten Server-Neustart wirksam." });
    } catch (err) {
      setMaxHeapResult({ type: "error", text: err.message });
    } finally {
      setSavingMaxHeap(false);
    }
  }

  async function handleSaveWarningPct(e) {
    e.preventDefault();
    setSavingWarningPct(true);
    setWarningPctResult(null);
    try {
      const updated = await updateSettings({ heapWarningPct: Number(warningPctDraft) });
      setDiag((prev) => (prev ? { ...prev, heapWarningPct: updated.heapWarningPct } : prev));
      setWarningPctResult({ type: "success", text: "Gespeichert — gilt sofort." });
    } catch (err) {
      setWarningPctResult({ type: "error", text: err.message });
    } finally {
      setSavingWarningPct(false);
    }
  }

  async function handleGc() {
    setGcRunning(true);
    try {
      const result = await forceGc();
      setDiag((prev) => (prev ? { ...prev, memory: result.memory } : prev));
    } catch (err) {
      setError(err.message);
    } finally {
      setGcRunning(false);
    }
  }

  async function handleDeleteAll() {
    if (!window.confirm("Alle PDF-Jobs wirklich löschen? Auch fertige, noch nicht heruntergeladene Exporte gehen dabei verloren.")) {
      return;
    }
    await deleteAllJobs();
  }

  async function handleClearCache() {
    if (
      !window.confirm(
        "Datei-Cache wirklich leeren? Als Nächstes angefragte Dateien werden dann einmalig neu von der Festplatte gelesen."
      )
    ) {
      return;
    }
    setClearingCache(true);
    try {
      await clearParseCache();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setClearingCache(false);
    }
  }

  const mem = diag?.memory;
  const heapOfLimitPct =
    mem && mem.heapSizeLimitMB > 0 ? Math.min(100, Math.round((mem.heapTotalMB / mem.heapSizeLimitMB) * 100)) : 0;
  const cache = diag?.cache;
  const cachePct =
    cache && cache.maxCachedEntries > 0 ? Math.min(100, Math.round((cache.cachedEntries / cache.maxCachedEntries) * 100)) : 0;
  const rssSegments = mem
    ? [
        { label: "Heap", valueMB: mem.heapTotalMB, className: "rss-seg-heap" },
        { label: "External", valueMB: mem.externalMB, className: "rss-seg-external" },
        { label: "Sonstiges", valueMB: mem.rssOtherMB, className: "rss-seg-other" },
      ]
    : [];

  return (
    <div className="home-page">
      <div className="chart-card">
        <div className="chart-header">
          <div>
            <h2>Server-Diagnose</h2>
            <p className="chart-subtitle">
              Speicherverbrauch des Server-Prozesses, aktualisiert alle {POLL_MS / 1000}s.
            </p>
          </div>
          <div className="refresh-info">
            <button type="button" className="settings-button" onClick={load}>
              <RefreshIcon /> Jetzt aktualisieren
            </button>
          </div>
        </div>

        {error && <div className="table-error">{error}</div>}

        {mem && (
          <>
            <div className="stat-tile-row">
              <div className="stat-tile">
                <div className="stat-tile-label">Heap benutzt</div>
                <div className="stat-tile-value">{mem.heapUsedMB.toLocaleString("de-DE")} MB</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-label">Heap gesamt</div>
                <div className="stat-tile-value">{mem.heapTotalMB.toLocaleString("de-DE")} MB</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-label">Heap-Limit</div>
                <div className="stat-tile-value">{mem.heapSizeLimitMB.toLocaleString("de-DE")} MB</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-label">RSS</div>
                <div className="stat-tile-value">{mem.rssMB.toLocaleString("de-DE")} MB</div>
              </div>
            </div>

            <div className="diagnostics-heap-bar">
              <div className="reload-progress-track">
                <div className="reload-progress-fill" style={{ width: `${heapOfLimitPct}%` }} />
              </div>
              <span className="reload-countdown">
                {heapOfLimitPct}% des Heap-Limits belegt (Heap gesamt von {mem.heapSizeLimitMB.toLocaleString("de-DE")} MB) —
                bei ~100% droht ein Absturz wie im Crash-Log
              </span>
            </div>

            <p className="chart-subtitle diagnostics-section-label">
              Was im RSS steckt (dem tatsächlich vom Betriebssystem belegten Speicher):
            </p>
            <div className="diagnostics-rss-bar">
              {rssSegments.map((s) => (
                <div
                  key={s.label}
                  className={`diagnostics-rss-segment ${s.className}`}
                  style={{ width: `${mem.rssMB > 0 ? (s.valueMB / mem.rssMB) * 100 : 0}%` }}
                  title={`${s.label}: ${s.valueMB.toLocaleString("de-DE")} MB`}
                />
              ))}
            </div>
            <div className="diagnostics-rss-legend">
              {rssSegments.map((s) => (
                <span key={s.label} className="diagnostics-rss-legend-item">
                  <span className={`diagnostics-rss-dot ${s.className}`} aria-hidden="true" />
                  {s.label}: {s.valueMB.toLocaleString("de-DE")} MB
                </span>
              ))}
            </div>

            {diag.heapSpaces?.length > 0 && (
              <>
                <p className="chart-subtitle diagnostics-section-label">Heap-Bereiche (V8):</p>
                <div className="table-scroll">
                  <table className="log-table">
                    <thead>
                      <tr>
                        <th>Bereich</th>
                        <th>Benutzt</th>
                        <th>Zugewiesen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diag.heapSpaces.map((s) => (
                        <tr key={s.name}>
                          <td>
                            <code>{s.name}</code>
                          </td>
                          <td>{s.usedMB.toLocaleString("de-DE")} MB</td>
                          <td>{s.sizeMB.toLocaleString("de-DE")} MB</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <p className="chart-subtitle">
              Laufzeit: {formatUptime(diag.uptimeSeconds)} · PDF-Jobs: {diag.pdfJobsCount} ({diag.pdfJobsRunning} laufend),{" "}
              {diag.pdfJobsDiskUsageMB.toLocaleString("de-DE")} MB auf Disk
            </p>

            {diag.gcAvailable ? (
              <button type="button" className="settings-button" onClick={handleGc} disabled={gcRunning}>
                <RefreshIcon className={gcRunning ? "icon-spin" : undefined} />
                {gcRunning ? "Läuft..." : "Garbage Collection jetzt ausführen"}
              </button>
            ) : (
              <p className="chart-subtitle">
                Garbage Collection lässt sich nur erzwingen, wenn der Server mit <code>--expose-gc</code> gestartet
                wurde.
              </p>
            )}
          </>
        )}
      </div>

      <div className="chart-card">
        <h2>Heap-Warnschwelle</h2>
        <p className="chart-subtitle">
          Ab diesem Anteil des Heap-Limits zeigt die Startseite den Warnhinweis. Gilt sofort, ohne
          Neustart. Der Notfallmodus greift unabhängig davon fest ab 95%.
        </p>
        {warningPctDraft !== null && (
          <form onSubmit={handleSaveWarningPct} className="settings-form">
            <label htmlFor="heap-warning-pct">Warnschwelle (%, 1–94)</label>
            <div className="source-add-fields">
              <input
                id="heap-warning-pct"
                type="number"
                min="1"
                max="94"
                value={warningPctDraft}
                onChange={(e) => setWarningPctDraft(e.target.value)}
                required
              />
              <button type="submit" disabled={savingWarningPct}>
                {savingWarningPct ? "Speichert..." : "Speichern"}
              </button>
            </div>
          </form>
        )}
        {warningPctResult && (
          <div className={`settings-result settings-${warningPctResult.type}`}>{warningPctResult.text}</div>
        )}
      </div>

      <div className="chart-card">
        <h2>Max. Heap-Größe</h2>
        <p className="chart-subtitle">
          Legt V8s Heap-Limit fest (<code>--max-old-space-size</code>). Lässt sich nicht am laufenden Prozess
          ändern — der Server liest den Wert beim Start neu ein (<code>server/launcher.js</code>), eine
          Änderung wirkt also erst nach einem manuellen Neustart. Aktuell laufend mit{" "}
          {mem ? `${mem.heapSizeLimitMB.toLocaleString("de-DE")} MB` : "…"}.
        </p>
        {maxHeapDraft !== null && (
          <form onSubmit={handleSaveMaxHeap} className="settings-form">
            <label htmlFor="max-heap">Konfigurierter Wert (MB, mindestens 512)</label>
            <div className="source-add-fields">
              <input
                id="max-heap"
                type="number"
                min="512"
                step="256"
                value={maxHeapDraft}
                onChange={(e) => setMaxHeapDraft(e.target.value)}
                required
              />
              <button type="submit" disabled={savingMaxHeap}>
                {savingMaxHeap ? "Speichert..." : "Speichern"}
              </button>
            </div>
          </form>
        )}
        {maxHeapResult && <div className={`settings-result settings-${maxHeapResult.type}`}>{maxHeapResult.text}</div>}
      </div>

      <div className="chart-card">
        <div className="chart-header">
          <div>
            <h2>Datei-Cache</h2>
            <p className="chart-subtitle">
              Bereits geparste Log-Dateien bleiben im Speicher, bis sich die Datei ändert oder der
              Cache voll wird (älteste zuerst verdrängt) — hier die größten Verbraucher gerade.
            </p>
          </div>
          {cache && cache.cachedFiles > 0 && (
            <button type="button" className="settings-button danger" onClick={handleClearCache} disabled={clearingCache}>
              {clearingCache ? "Leert..." : "Cache leeren"}
            </button>
          )}
        </div>

        {cache && (
          <>
            <div className="diagnostics-heap-bar">
              <div className="reload-progress-track">
                <div className="reload-progress-fill" style={{ width: `${cachePct}%` }} />
              </div>
              <span className="reload-countdown">
                {cache.cachedEntries.toLocaleString("de-DE")} von {cache.maxCachedEntries.toLocaleString("de-DE")}{" "}
                zwischengespeicherten Einträgen ({cache.cachedFiles.toLocaleString("de-DE")} Dateien)
              </span>
            </div>

            {cache.topFiles.length === 0 ? (
              <p className="chart-subtitle">Cache ist leer.</p>
            ) : (
              <div className="table-scroll">
                <table className="log-table">
                  <thead>
                    <tr>
                      <th>Quelle</th>
                      <th>Service</th>
                      <th>Datei</th>
                      <th>Einträge</th>
                      <th>Größe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cache.topFiles.map((f) => (
                      <tr key={`${f.sourceName}:${f.fileName}`}>
                        <td>{f.sourceName || "—"}</td>
                        <td>{f.service || "—"}</td>
                        <td>
                          <code>{f.fileName}</code>
                        </td>
                        <td>{f.entryCount.toLocaleString("de-DE")}</td>
                        <td>{formatBytes(f.sizeBytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <div className="chart-card">
        <div className="chart-header">
          <div>
            <h2>PDF-Jobs</h2>
            <p className="chart-subtitle">
              Laufende und abgeschlossene Hintergrund-Exporte — hier gezielt aufräumen, wenn sich etwas ansammelt.
            </p>
          </div>
          {jobs.length > 0 && (
            <button type="button" className="settings-button danger" onClick={handleDeleteAll}>
              Alle löschen
            </button>
          )}
        </div>

        {jobs.length === 0 ? (
          <p className="chart-subtitle">Keine PDF-Jobs.</p>
        ) : (
          <ul className="pdf-jobs-list">
            {jobs.map((job) => (
              <PdfJobRow key={job.id} job={job} onStop={stopJob} onDelete={deleteJob} onDownload={downloadJob} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
