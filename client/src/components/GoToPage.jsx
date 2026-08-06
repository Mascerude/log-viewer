import { useEffect, useState } from "react";
import { useAppSettings } from "../settingsContext";

// "Seite [input] von Y" — lets the user jump straight to a page instead of
// clicking Zurück/Weiter repeatedly. Kept in sync with the current page via
// props, but tracks its own draft text while typing so a mid-edit value
// (e.g. an empty field) doesn't get clobbered before it commits. Committing
// happens on Enter/blur, or automatically after `goToPageDelaySeconds`
// (Einstellungen) of inactivity.
export default function GoToPage({ page, pageCount, onChange }) {
  const { goToPageDelaySeconds } = useAppSettings();
  const [draft, setDraft] = useState(String(page));

  useEffect(() => {
    setDraft(String(page));
  }, [page]);

  function commitValue(value) {
    const num = parseInt(value, 10);
    if (Number.isFinite(num)) {
      const clamped = Math.min(pageCount, Math.max(1, num));
      if (clamped !== page) onChange(clamped);
    } else {
      setDraft(String(page));
    }
  }

  // Skips scheduling once `draft` merely mirrors the current page again
  // (right after mount, or right after a commit synced it back), so it
  // doesn't keep re-firing onChange with the same value.
  useEffect(() => {
    if (draft === String(page)) return;
    if (goToPageDelaySeconds <= 0) {
      commitValue(draft);
      return;
    }
    const t = setTimeout(() => commitValue(draft), goToPageDelaySeconds * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, goToPageDelaySeconds]);

  function commit() {
    commitValue(draft);
  }

  return (
    <span className="pagination-goto">
      Seite
      <input
        type="number"
        className="goto-page-input"
        min={1}
        max={pageCount}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        aria-label="Gehe zu Seite"
      />
      von {pageCount}
    </span>
  );
}
