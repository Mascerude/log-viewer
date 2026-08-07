import { useEffect, useState } from "react";
import { CloseIcon, AlertIcon, FolderIcon, ChevronRightIcon, SearchIcon, CheckIcon } from "./icons";
import {
  getSavedSearchFolders,
  createSavedSearchFolder,
  deleteSavedSearchFolder,
  getSavedSearches,
  createSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
} from "../api";

function NamePromptModal({ title, label, placeholder, onSave, onClose, children }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(name.trim());
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">
          <div className="filter-group">
            <label htmlFor="name-prompt-input">{label}</label>
            <input
              id="name-prompt-input"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder={placeholder}
            />
          </div>
          {children}
          {error && <div className="settings-result settings-error">{error}</div>}
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Speichert..." : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Path picker: pick which folder (or none) a search gets saved into — a flat
// list of folders styled like the folder view, with a checkmark on the
// current pick, plus a way to create a new folder on the spot.
function FolderPickerModal({ folders, selectedFolderId, onSelect, onCreateFolder, onClose }) {
  const [creating, setCreating] = useState(false);

  function renderOption(id, name) {
    const isSelected = (selectedFolderId || null) === id;
    return (
      <button
        key={id || "__root__"}
        type="button"
        className={`folder-picker-option${isSelected ? " selected" : ""}`}
        onClick={() => onSelect(id)}
      >
        <FolderIcon className="folder-view-folder-icon" />
        <span className="folder-view-folder-name">{name}</span>
        {isSelected && <CheckIcon className="folder-picker-check" />}
      </button>
    );
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-label="Ordner auswählen">
        <div className="modal-header">
          <h2>Ordner auswählen</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">
          <div className="folder-view">
            {renderOption(null, "Kein Ordner")}
            {folders.map((f) => renderOption(f.id, f.name))}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="settings-button" onClick={() => setCreating(true)}>
            + Neuer Ordner
          </button>
        </div>
      </div>

      {creating && (
        <NamePromptModal
          title="Ordner erstellen"
          label="Name"
          placeholder="z. B. Tagesabschluss-Checks"
          onSave={async (name) => {
            const folder = await onCreateFolder(name);
            setCreating(false);
            onSelect(folder.id);
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

// Standalone "save the current search" flow — fetches its own folders/
// existing-searches (so it works whether opened directly from the search
// page or from inside the browse modal), lets the destination folder be
// picked via FolderPickerModal, and routes into the overwrite-confirmation
// modal when the name already exists in that folder.
export function SaveSearchModal({ open, onClose, savePayload, onSaved }) {
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState(null);
  const [folders, setFolders] = useState([]);
  const [searches, setSearches] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingOverwrite, setPendingOverwrite] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setFolderId(null);
    setError(null);
    getSavedSearchFolders()
      .then(setFolders)
      .catch(() => {});
    getSavedSearches()
      .then(setSearches)
      .catch(() => {});
  }, [open]);

  async function handleCreateFolder(folderName) {
    const folder = await createSavedSearchFolder({ name: folderName });
    setFolders((prev) => [...prev, folder]);
    return folder;
  }

  async function doSave() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    const existing = searches.find((s) => s.name === trimmed && (s.folderId || null) === (folderId || null));
    if (existing) {
      setPendingOverwrite({ existing, name: trimmed, folderId });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createSavedSearch({ name: trimmed, folderId, ...savePayload });
      onSaved?.(created);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmOverwrite() {
    const { existing, name: overwriteName, folderId: overwriteFolderId } = pendingOverwrite;
    const updated = await updateSavedSearch(existing.id, { name: overwriteName, folderId: overwriteFolderId, ...savePayload });
    setPendingOverwrite(null);
    onSaved?.(updated);
    onClose();
  }

  if (!open) return null;

  const folderName = folderId ? folders.find((f) => f.id === folderId)?.name || "…" : "Kein Ordner";

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-label="Suche speichern">
        <div className="modal-header">
          <h2>Suche speichern</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">
          <div className="filter-group">
            <label htmlFor="save-search-name-input">Name</label>
            <input
              id="save-search-name-input"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSave()}
              placeholder="z. B. Fehler Polis Nachrichtendienst"
            />
          </div>
          <div className="filter-group">
            <label>Ordner</label>
            <button type="button" className="folder-picker-trigger" onClick={() => setPickerOpen(true)}>
              <FolderIcon className="folder-view-folder-icon" />
              {folderName}
            </button>
          </div>
          {error && <div className="settings-result settings-error">{error}</div>}
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" onClick={doSave} disabled={saving || !name.trim()}>
            {saving ? "Speichert..." : "Speichern"}
          </button>
        </div>
      </div>

      {pickerOpen && (
        <FolderPickerModal
          folders={folders}
          selectedFolderId={folderId}
          onSelect={(id) => {
            setFolderId(id);
            setPickerOpen(false);
          }}
          onCreateFolder={handleCreateFolder}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {pendingOverwrite && (
        <OverwriteDiffModal
          oldSearch={pendingOverwrite.existing}
          newSearch={{ name: pendingOverwrite.name, folderId: pendingOverwrite.folderId, ...savePayload }}
          onConfirm={confirmOverwrite}
          onCancel={() => setPendingOverwrite(null)}
        />
      )}
    </div>
  );
}

// Shown after loading a saved search whose source(s)/service(s) no longer
// exist — those get silently left out of the applied selection, and this
// tells the user which ones and why.
export function MissingItemsModal({ searchName, missingSources, missingServices, onClose }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal-card modal-card-narrow"
        role="dialog"
        aria-modal="true"
        aria-label="Warnung: nicht mehr vorhandene Auswahl"
      >
        <div className="modal-header">
          <h2 className="modal-title-with-icon">
            <AlertIcon className="modal-warning-icon" /> Nicht mehr vorhanden
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">
          <p>
            Bei der gespeicherten Suche „{searchName}“ gibt es Quellen oder Services, die nicht mehr
            existieren. Sie wurden nicht übernommen:
          </p>
          {missingSources.length > 0 && (
            <div className="missing-items-group">
              <span className="modal-label">Quellen</span>
              <ul className="missing-items-list">
                {missingSources.map((s, i) => (
                  <li key={i}>{s.name}</li>
                ))}
              </ul>
            </div>
          )}
          {missingServices.length > 0 && (
            <div className="missing-items-group">
              <span className="modal-label">Services</span>
              <ul className="missing-items-list">
                {missingServices.map((s, i) => (
                  <li key={i}>
                    {s.service} <span className="chip-source-hint">({s.sourceName})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

const SUMMARY_FIELDS = [
  ["query", "Suchtext"],
  ["sources", "Quellen"],
  ["services", "Services"],
  ["zeitraum", "Zeitraum"],
  ["level", "Level"],
  ["pid", "PID"],
  ["tid", "TID"],
  ["exclude", "Ausschließen"],
  ["refresh", "Auto-Aktualisierung"],
];

// Human-readable, comparable snapshot of a saved search's content — used
// only to render/diff the overwrite-confirmation modal below.
function summarize(s) {
  const f = s.filters || {};
  const zeitraum =
    f.from || f.to ? `${f.from || "…"} ${f.fromTime || ""} – ${f.to || "…"} ${f.toTime || ""}`.trim() : "—";
  return {
    query: s.query?.trim() ? s.query : "—",
    sources: (s.sources || []).map((x) => x.name).join(", ") || "—",
    services: (s.services || []).map((x) => `${x.service} (${x.sourceName})`).join(", ") || "—",
    zeitraum,
    level: f.levels && f.levels.length > 0 && f.levels.length < 5 ? f.levels.join(", ") : "Alle",
    pid: f.pid || "—",
    tid: f.tid || "—",
    exclude: (f.excludeList || []).length
      ? `${f.excludeList.join(", ")} (${f.excludeMode === "exact" ? "Exakt" : "Enthält"})`
      : "—",
    refresh: s.refreshIntervalSeconds > 0 ? `alle ${s.refreshIntervalSeconds}s` : "aus",
  };
}

// Confirmation before overwriting an existing saved search of the same name
// (in the same folder) — old on the left, new on the right, differing rows
// highlighted the same amber used for entry comparison elsewhere.
function OverwriteDiffModal({ oldSearch, newSearch, onConfirm, onCancel }) {
  const oldSummary = summarize(oldSearch);
  const newSummary = summarize(newSearch);
  const diffKeys = new Set(SUMMARY_FIELDS.filter(([key]) => oldSummary[key] !== newSummary[key]).map(([key]) => key));

  function renderColumn(summary, label) {
    return (
      <div className="compare-column">
        <div className="compare-column-header">{label}</div>
        {SUMMARY_FIELDS.map(([key, fieldLabel]) => (
          <div key={key} className={`modal-field${diffKeys.has(key) ? " modal-field-diff" : ""}`}>
            <span className="modal-label">{fieldLabel}</span>
            <span className="modal-value">{summary[key]}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-card modal-card-diff" role="dialog" aria-modal="true" aria-label="Gespeicherte Suche überschreiben">
        <div className="modal-header">
          <h2>„{newSearch.name}“ existiert bereits</h2>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="Schließen">
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">
          <p>Im gewählten Ordner gibt es bereits eine gespeicherte Suche mit diesem Namen. Überschreiben?</p>
          <div className="compare-columns">
            {renderColumn(oldSummary, "Alt")}
            {renderColumn(newSummary, "Neu")}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="button" onClick={onConfirm}>
            Überschreiben
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal for loading/deleting saved searches (grouped by folder), plus
// folder management and the "save current search" flow. `savePayload` is
// the current query/selection/filters/refresh-interval snapshot, built
// fresh by the caller on every render.
export default function SavedSearchesModal({ open, onClose, savePayload, onLoad }) {
  const [folders, setFolders] = useState([]);
  const [searches, setSearches] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(() => new Set());
  const [saveOpen, setSaveOpen] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);

  function refetch() {
    getSavedSearchFolders()
      .then((data) => {
        // A newly-created folder (e.g. from the save flow) should show up
        // open; folders the user already toggled keep their state.
        setFolders((prevFolders) => {
          const oldIds = new Set(prevFolders.map((f) => f.id));
          const newIds = data.filter((f) => !oldIds.has(f.id)).map((f) => f.id);
          if (newIds.length) setExpandedFolders((prevExpanded) => new Set([...prevExpanded, ...newIds]));
          return data;
        });
      })
      .catch(() => {});
    getSavedSearches()
      .then(setSearches)
      .catch(() => {});
  }

  useEffect(() => {
    if (!open) return;
    getSavedSearchFolders()
      .then((data) => {
        setFolders(data);
        // Start with every folder open — this is an explicit "browse" view,
        // not a sidebar you leave collapsed most of the time.
        setExpandedFolders(new Set(data.map((f) => f.id)));
      })
      .catch(() => {});
    getSavedSearches()
      .then(setSearches)
      .catch(() => {});
  }, [open]);

  function toggleFolder(id) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreateFolder(name) {
    const folder = await createSavedSearchFolder({ name });
    setFolders((prev) => [...prev, folder]);
    setFolderModalOpen(false);
  }

  async function handleDeleteFolder(id) {
    await deleteSavedSearchFolder(id);
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setSearches((prev) => prev.map((s) => (s.folderId === id ? { ...s, folderId: null } : s)));
  }

  async function handleDeleteSearch(id) {
    await deleteSavedSearch(id);
    setSearches((prev) => prev.filter((s) => s.id !== id));
  }

  function handleLoad(s) {
    onLoad(s);
    onClose();
  }

  function renderItem(s) {
    return (
      <div key={s.id} className="folder-view-item">
        <button type="button" className="folder-view-item-name" onClick={() => handleLoad(s)}>
          <SearchIcon className="folder-view-item-icon" />
          {s.name}
        </button>
        <button
          type="button"
          className="saved-search-delete"
          onClick={() => handleDeleteSearch(s.id)}
          aria-label={`„${s.name}“ löschen`}
          title="Löschen"
        >
          <CloseIcon />
        </button>
      </div>
    );
  }

  if (!open) return null;

  const rootSearches = searches.filter((s) => !s.folderId);
  const isEmpty = folders.length === 0 && searches.length === 0;

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-label="Gespeicherte Suchen">
        <div className="modal-header">
          <h2>Gespeicherte Suchen</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">
          {isEmpty && <p className="chart-empty">Noch keine gespeicherten Suchen.</p>}

          <div className="folder-view">
            {folders.map((folder) => {
              const items = searches.filter((s) => s.folderId === folder.id);
              const isExpanded = expandedFolders.has(folder.id);
              return (
                <div key={folder.id} className="folder-view-folder">
                  <div className="folder-view-folder-header">
                    <button
                      type="button"
                      className="folder-view-folder-toggle"
                      onClick={() => toggleFolder(folder.id)}
                      aria-expanded={isExpanded}
                    >
                      <ChevronRightIcon className={`folder-view-chevron${isExpanded ? " open" : ""}`} />
                      <FolderIcon className="folder-view-folder-icon" />
                      <span className="folder-view-folder-name">{folder.name}</span>
                      <span className="folder-view-count">{items.length}</span>
                    </button>
                    <button
                      type="button"
                      className="saved-search-delete"
                      onClick={() => handleDeleteFolder(folder.id)}
                      aria-label={`Ordner „${folder.name}“ löschen`}
                      title="Ordner löschen"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="folder-view-items">
                      {items.length === 0 && <div className="folder-view-empty">Leer</div>}
                      {items.map(renderItem)}
                    </div>
                  )}
                </div>
              );
            })}

            {(folders.length === 0 || rootSearches.length > 0) && (
              <div className="folder-view-folder">
                {folders.length > 0 && <div className="folder-view-root-label">Ohne Ordner</div>}
                <div className="folder-view-items folder-view-items-root">{rootSearches.map(renderItem)}</div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="settings-button" onClick={() => setFolderModalOpen(true)}>
            + Ordner erstellen
          </button>
          <button type="button" onClick={() => setSaveOpen(true)}>
            + Aktuelle Suche speichern
          </button>
        </div>
      </div>

      <SaveSearchModal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        savePayload={savePayload}
        onSaved={refetch}
      />

      {folderModalOpen && (
        <NamePromptModal
          title="Ordner erstellen"
          label="Name"
          placeholder="z. B. Tagesabschluss-Checks"
          onSave={handleCreateFolder}
          onClose={() => setFolderModalOpen(false)}
        />
      )}
    </div>
  );
}
