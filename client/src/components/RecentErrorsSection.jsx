import { useEffect, useMemo, useState } from "react";
import { getLogs } from "../api";
import LogTable from "./LogTable";
import CollapsibleSection from "./CollapsibleSection";
import useSort from "../useSort";

// The last N Error/Fatal entries across every source — collapsed by default
// so nothing is fetched until opened. Reuses LogTable wholesale (its own
// PageSizeSelect already offers 20/50/100/200/eigene, plus sorting, entry
// detail, compare, and PDF export for free).
export default function RecentErrorsSection({ refreshSignal }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { sortBy, sortDir, toggleSort } = useSort();
  const [results, setResults] = useState({ entries: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setPage(1);
  }, [pageSize, sortBy, sortDir]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    getLogs({ level: "E,F", sortBy, sortDir, page, pageSize })
      .then(setResults)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, page, pageSize, sortBy, sortDir, refreshSignal]);

  const exportQuery = useMemo(() => ({ level: "E,F", sortBy, sortDir }), [sortBy, sortDir]);

  return (
    <CollapsibleSection
      title="Letzte Fehler"
      subtitle="Die zuletzt aufgetretenen Fehler über alle Quellen hinweg."
      open={open}
      onToggle={() => setOpen((o) => !o)}
    >
      <LogTable
        title="Letzte Fehler"
        filename="Letzte-Fehler"
        entries={results.entries}
        total={results.total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        error={error}
        showSource
        showService
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={toggleSort}
        exportQuery={exportQuery}
      />
    </CollapsibleSection>
  );
}
