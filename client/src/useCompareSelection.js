import { useEffect, useMemo, useState } from "react";

export const MAX_COMPARE = 5;

// Ctrl+click multi-select (up to MAX_COMPARE entries) + "compare" modal state,
// shared by LogTable and MessageOccurrences so both offer the same
// select-and-compare workflow. `initialEntries` lets a caller pre-seed the
// selection (e.g. the entry a detail popup is already showing).
export default function useCompareSelection(initialEntries = []) {
  const [selected, setSelected] = useState(() => new Map(initialEntries.map((e) => [e.id, e])));
  const [compareOpen, setCompareOpen] = useState(false);

  function toggle(entry) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(entry.id)) {
        next.delete(entry.id);
      } else {
        if (next.size >= MAX_COMPARE) return prev;
        next.set(entry.id, entry);
      }
      return next;
    });
  }

  function handleRowClick(e, entry) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    toggle(entry);
  }

  function clear() {
    setSelected(new Map());
  }

  // Enter opens the compare modal as long as at least two entries are marked
  // and the user isn't typing in a filter field at the time.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== "Enter" || selected.size < 2) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      setCompareOpen(true);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selected]);

  const compareEntries = useMemo(
    () => Array.from(selected.values()).sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1)),
    [selected]
  );

  return { selected, handleRowClick, clear, compareOpen, setCompareOpen, compareEntries };
}
