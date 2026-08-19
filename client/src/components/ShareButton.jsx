import { useState } from "react";
import { LinkIcon, CheckIcon } from "./icons";
import { createShare } from "../api";
import { copyPlainText } from "../clipboard";
import { buildShareLink } from "../shareLink";

// Stores just enough to re-locate the entry later (see resolveSharedEntryRef
// in server/index.js), never a content snapshot — that's what lets opening
// the link later detect the entry no longer existing.
function shareEntryRef(e) {
  return { id: e.id, sourceId: e.sourceId, sourceName: e.sourceName, service: e.service, fileName: e.file };
}

// Used by both LogEntryModal (kind="entry", one entry) and
// CompareEntriesModal (kind="compare", 2+ entries) — creates a share link on
// the server and copies it to the clipboard, mirroring SavedSearches.jsx's
// own copy-link button.
export default function ShareButton({ kind, entries, label = "Teilen" }) {
  const [state, setState] = useState("idle"); // idle | sharing | copied | error
  const [error, setError] = useState(null);

  async function handleShare() {
    setState("sharing");
    setError(null);
    try {
      const share = await createShare({ kind, entries: entries.map(shareEntryRef) });
      await copyPlainText(buildShareLink(share.id));
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch (err) {
      setError(err.message);
      setState("error");
    }
  }

  return (
    <div className="share-button-wrap">
      <button type="button" className="modal-copy-button" onClick={handleShare} disabled={state === "sharing"}>
        {state === "copied" ? <CheckIcon /> : <LinkIcon />}
        {state === "copied" ? "Link kopiert!" : state === "sharing" ? "Teilt..." : label}
      </button>
      {state === "error" && <div className="settings-result settings-error">{error}</div>}
    </div>
  );
}
