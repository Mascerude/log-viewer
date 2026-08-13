import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPdfJob, deleteAllPdfJobs, deletePdfJob, getPdfJobs, pdfJobDownloadUrl, stopPdfJob } from "./api";

const PdfJobsContext = createContext(null);

// Background PDF-export jobs live on the server (see server/index.js) so they
// keep running independent of the page/tab that started them. This provider
// polls for their progress and exposes actions to the rest of the app (the
// floating widget in the corner, and ExportMenu which starts new jobs).
export function PdfJobsProvider({ children }) {
  const [jobs, setJobs] = useState([]);

  const refreshJobs = useCallback(() => {
    return getPdfJobs()
      .then(setJobs)
      .catch(() => {});
  }, []);

  // Picks up any job already running server-side on first load, e.g. after a
  // page reload while an export was still in progress.
  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  const hasRunning = jobs.some((j) => j.status === "running" || j.status === "stopping");

  // Only polls while something is actually in flight — restarts the interval
  // when that flips true/false rather than on every poll response, so the
  // cadence stays steady instead of resetting on each tick.
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(refreshJobs, 1200);
    return () => clearInterval(id);
  }, [hasRunning, refreshJobs]);

  const startJob = useCallback(
    async (payload) => {
      const job = await createPdfJob(payload);
      setJobs((prev) => [job, ...prev]);
      refreshJobs();
      return job;
    },
    [refreshJobs]
  );

  const stopJob = useCallback(
    async (id) => {
      const job = await stopPdfJob(id);
      setJobs((prev) => prev.map((j) => (j.id === id ? job : j)));
    },
    []
  );

  const deleteJob = useCallback(async (id) => {
    await deletePdfJob(id);
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const deleteAllJobs = useCallback(async () => {
    await deleteAllPdfJobs();
    setJobs([]);
  }, []);

  const downloadJob = useCallback((job) => {
    const a = document.createElement("a");
    a.href = pdfJobDownloadUrl(job.id);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const value = useMemo(
    () => ({ jobs, startJob, stopJob, deleteJob, deleteAllJobs, downloadJob, refreshJobs }),
    [jobs, startJob, stopJob, deleteJob, deleteAllJobs, downloadJob, refreshJobs]
  );

  return <PdfJobsContext.Provider value={value}>{children}</PdfJobsContext.Provider>;
}

export function usePdfJobs() {
  const ctx = useContext(PdfJobsContext);
  if (!ctx) throw new Error("usePdfJobs must be used within a PdfJobsProvider");
  return ctx;
}
