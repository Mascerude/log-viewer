import { useEffect, useState } from "react";
import { usePdfJobs } from "../pdfJobsContext";
import { CloseIcon, DownloadIcon } from "./icons";

const RING_RADIUS = 16;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function statusLabel(job) {
  switch (job.status) {
    case "running":
      return job.phase || "Läuft...";
    case "stopping":
      return "Wird gestoppt...";
    case "stopped":
      return "Gestoppt";
    case "done":
      return job.entryCount != null ? `Fertig · ${job.entryCount.toLocaleString("de-DE")} Einträge` : "Fertig";
    case "error":
      return `Fehler: ${job.error || "Unbekannter Fehler"}`;
    default:
      return job.status;
  }
}

function PdfJobRow({ job, onStop, onDelete, onDownload }) {
  const isRunning = job.status === "running" || job.status === "stopping";
  return (
    <li className={`pdf-job-row pdf-job-row-${job.status}`}>
      <div className="pdf-job-row-main">
        <span className="pdf-job-row-title">{job.title}</span>
        <span className="pdf-job-row-status">{statusLabel(job)}</span>
      </div>
      <div className="pdf-job-progress-track">
        <div className="pdf-job-progress-fill" style={{ width: `${job.progress}%` }} />
      </div>
      <div className="pdf-job-row-actions">
        {job.status === "running" && (
          <button type="button" onClick={() => onStop(job.id)}>
            Stoppen
          </button>
        )}
        {job.status === "done" && (
          <button type="button" onClick={() => onDownload(job)}>
            <DownloadIcon /> Herunterladen
          </button>
        )}
        <button type="button" className="danger" disabled={isRunning} onClick={() => onDelete(job.id)}>
          Löschen
        </button>
      </div>
    </li>
  );
}

// Floating icon (bottom-right) reflecting all background PDF-export jobs —
// a progress ring while any are running, a static badge once they're just
// waiting to be downloaded/cleaned up. Clicking it opens the job list.
export default function PdfJobsWidget() {
  const { jobs, stopJob, deleteJob, downloadJob } = usePdfJobs();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (jobs.length === 0) return null;

  const runningJobs = jobs.filter((j) => j.status === "running" || j.status === "stopping");
  const hasRunning = runningJobs.length > 0;
  const avgProgress = hasRunning
    ? Math.round(runningJobs.reduce((sum, j) => sum + j.progress, 0) / runningJobs.length)
    : 0;
  const offset = RING_CIRCUMFERENCE * (1 - avgProgress / 100);

  return (
    <>
      <button
        type="button"
        className="pdf-jobs-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label="PDF-Exporte"
        title="PDF-Exporte"
      >
        {hasRunning ? (
          <>
            <svg viewBox="0 0 40 40" className="pdf-jobs-fab-ring" aria-hidden="true">
              <circle cx="20" cy="20" r={RING_RADIUS} className="pdf-jobs-fab-ring-track" />
              <circle
                cx="20"
                cy="20"
                r={RING_RADIUS}
                className="pdf-jobs-fab-ring-progress"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={offset}
              />
            </svg>
            <span className="pdf-jobs-fab-percent">{avgProgress}%</span>
          </>
        ) : (
          <DownloadIcon />
        )}
        <span className="pdf-jobs-fab-badge">{jobs.length}</span>
      </button>

      {open && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-label="PDF-Exporte">
            <div className="modal-header">
              <h2>PDF-Exporte</h2>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Schließen">
                <CloseIcon />
              </button>
            </div>
            <div className="modal-body">
              <ul className="pdf-jobs-list">
                {jobs.map((job) => (
                  <PdfJobRow key={job.id} job={job} onStop={stopJob} onDelete={deleteJob} onDownload={downloadJob} />
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
