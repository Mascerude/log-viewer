import { useState } from "react";

// Shared toggle logic for sortable table headers: clicking the active column
// flips its direction; clicking a different column switches to it with a
// sensible starting direction (newest-first for the timestamp, smallest-first
// for numeric ids).
export default function useSort(defaultBy = "timestamp", defaultDir = "desc") {
  const [sortBy, setSortBy] = useState(defaultBy);
  const [sortDir, setSortDir] = useState(defaultDir);

  function toggleSort(column) {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir(column === "timestamp" ? "desc" : "asc");
    }
  }

  return { sortBy, sortDir, toggleSort };
}
