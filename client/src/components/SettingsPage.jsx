import { useState } from "react";
import {
  addSource,
  deleteSource,
  updateSource,
  reorderSources,
  addGroup,
  updateGroup,
  deleteGroup,
  reorderGroups,
  addServer,
  deleteServer,
  updateServer,
  reorderServers,
  addService,
  updateService,
  deleteService,
  updateSettings,
  browseFolder,
} from "../api";
import useReorderableList from "../useReorderableList";
import { GripIcon } from "./icons";

function PathInputWithBrowse({ value, onChange, id }) {
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState(null);

  async function handleBrowse() {
    setBrowsing(true);
    setError(null);
    try {
      const result = await browseFolder();
      if (result.path) onChange(result.path);
    } catch (err) {
      setError(err.message);
    } finally {
      setBrowsing(false);
    }
  }

  return (
    <div className="path-input-group">
      <input
        id={id}
        type="text"
        placeholder="Pfad, z.B. C:\Logs oder \\Server\Freigabe\Logs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      />
      <button type="button" className="secondary" onClick={handleBrowse} disabled={browsing}>
        {browsing ? "Öffnet..." : "Durchsuchen..."}
      </button>
      {error && <div className="settings-result settings-error path-browse-error">{error}</div>}
    </div>
  );
}

function formatExpiryDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// Wraps a row with a drag handle for reordering (see useReorderableList).
function DraggableRow({ id, isDragging, onDragStart, onDragOver, onDragEnd, children }) {
  return (
    <div className={`draggable-row${isDragging ? " dragging" : ""}`} onDragOver={(e) => onDragOver(id, e)}>
      <span
        className="drag-handle"
        draggable
        onDragStart={() => onDragStart(id)}
        onDragEnd={onDragEnd}
        title="Ziehen zum Umsortieren"
      >
        <GripIcon />
      </span>
      {children}
    </div>
  );
}

function SourceRow({ source, fileCount, groups, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(source.name);
  const [path, setPath] = useState(source.path);
  const [expiresAt, setExpiresAt] = useState(source.expiresAt || "");
  const [groupId, setGroupId] = useState(source.groupId || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateSource(source.id, { name, path, expiresAt, groupId });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Quelle "${source.name}" wirklich entfernen?`)) return;
    await deleteSource(source.id);
    onChanged();
  }

  const groupName = groups.find((g) => g.id === source.groupId)?.name;

  if (editing) {
    return (
      <form className="source-row source-row-editing" onSubmit={handleSave}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
        <PathInputWithBrowse value={path} onChange={setPath} />
        <label className="source-expiry-field" title="Optional. Macht die Quelle temporär, sie verschwindet danach automatisch.">
          Ablaufdatum (optional)
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </label>
        {groups.length > 0 && (
          <label className="source-expiry-field">
            Gruppe (optional)
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Keine Gruppe</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="source-row-actions">
          <button type="submit" disabled={saving}>
            {saving ? "Speichert..." : "Speichern"}
          </button>
          <button type="button" className="secondary" onClick={() => setEditing(false)}>
            Abbrechen
          </button>
        </div>
        {error && <div className="settings-result settings-error">{error}</div>}
      </form>
    );
  }

  return (
    <div className="source-row">
      <div className="source-info">
        <span className="source-name">
          {source.name}
          {groupName && <span className="group-badge">{groupName}</span>}
          {source.expiresAt && (
            <span className="expiry-badge" title="Läuft automatisch ab">
              läuft ab {formatExpiryDate(source.expiresAt)}
            </span>
          )}
        </span>
        <code className="source-path">{source.path}</code>
        <span className="source-meta">
          {source.exists ? (
            <>{fileCount ?? 0} Datei{fileCount === 1 ? "" : "en"}</>
          ) : (
            <span className="warn-badge">Verzeichnis nicht gefunden</span>
          )}
        </span>
      </div>
      <div className="source-row-actions">
        <button type="button" className="secondary" onClick={() => setEditing(true)}>
          Bearbeiten
        </button>
        <button type="button" className="danger" onClick={handleDelete}>
          Entfernen
        </button>
      </div>
    </div>
  );
}

function GroupRow({ group, sourceCount, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateGroup(group.id, { name });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Gruppe "${group.name}" wirklich entfernen? Enthaltene Quellen werden nicht gelöscht, nur aus der Gruppe entfernt.`
      )
    )
      return;
    await deleteGroup(group.id);
    onChanged();
  }

  if (editing) {
    return (
      <form className="source-row source-row-editing" onSubmit={handleSave}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
        <div className="source-row-actions">
          <button type="submit" disabled={saving}>
            {saving ? "Speichert..." : "Speichern"}
          </button>
          <button type="button" className="secondary" onClick={() => setEditing(false)}>
            Abbrechen
          </button>
        </div>
        {error && <div className="settings-result settings-error">{error}</div>}
      </form>
    );
  }

  return (
    <div className="source-row">
      <div className="source-info">
        <span className="source-name">{group.name}</span>
        <span className="source-meta">
          {sourceCount} Quelle{sourceCount === 1 ? "" : "n"}
        </span>
      </div>
      <div className="source-row-actions">
        <button type="button" className="secondary" onClick={() => setEditing(true)}>
          Bearbeiten
        </button>
        <button type="button" className="danger" onClick={handleDelete}>
          Entfernen
        </button>
      </div>
    </div>
  );
}

function GroupsCard({ groups, sources, onChanged }) {
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  const {
    orderedItems: orderedGroups,
    draggingId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  } = useReorderableList(groups, (order) => {
    reorderGroups(order)
      .catch((err) => console.error("Gruppen-Reihenfolge konnte nicht gespeichert werden:", err))
      .finally(onChanged);
  });

  async function handleAdd(e) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await addGroup({ name });
      setName("");
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="settings-card">
      <h2>Gruppen</h2>
      <p className="chart-subtitle">
        Fasse Log-Quellen zu aufklappbaren Gruppen in der Navigation links zusammen. Eine Quelle
        lässt sich beim Bearbeiten einer Gruppe zuordnen.
      </p>

      <div className="source-list">
        {groups.length === 0 && <p className="chart-subtitle">Noch keine Gruppe angelegt.</p>}
        {orderedGroups.map((g) => (
          <DraggableRow
            key={g.id}
            id={g.id}
            isDragging={draggingId === g.id}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <GroupRow
              group={g}
              sourceCount={sources.filter((s) => s.groupId === g.id).length}
              onChanged={onChanged}
            />
          </DraggableRow>
        ))}
      </div>

      <form onSubmit={handleAdd} className="settings-form source-add-form">
        <label htmlFor="group-name">Neue Gruppe hinzufügen</label>
        <div className="source-add-fields">
          <input
            id="group-name"
            type="text"
            placeholder="Name, z.B. Produktion"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button type="submit" disabled={adding}>
            {adding ? "Fügt hinzu..." : "Hinzufügen"}
          </button>
        </div>
      </form>

      {error && <div className="settings-result settings-error">{error}</div>}
    </div>
  );
}

function ServiceCheckRow({ serverId, service, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(service.name);
  const [serviceName, setServiceName] = useState(service.serviceName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateService(serverId, service.id, { name, serviceName });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Service "${service.name}" wirklich entfernen?`)) return;
    await deleteService(serverId, service.id);
    onChanged();
  }

  if (editing) {
    return (
      <form className="service-row service-row-editing" onSubmit={handleSave}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Anzeigename" required />
        <input
          value={serviceName}
          onChange={(e) => setServiceName(e.target.value)}
          placeholder="Windows-Dienstname"
          required
        />
        <div className="source-row-actions">
          <button type="submit" disabled={saving}>
            {saving ? "Speichert..." : "Speichern"}
          </button>
          <button type="button" className="secondary" onClick={() => setEditing(false)}>
            Abbrechen
          </button>
        </div>
        {error && <div className="settings-result settings-error">{error}</div>}
      </form>
    );
  }

  return (
    <div className="service-row">
      <span className={`status-dot ${service.online ? "status-online" : "status-offline"}`} aria-hidden="true" />
      <span className="service-row-name">{service.name}</span>
      <code className="service-row-port">{service.serviceName}</code>
      <span className={`status-pill ${service.online ? "status-pill-online" : "status-pill-offline"}`}>
        {service.online ? "Läuft" : "Gestoppt"}
      </span>
      <div className="source-row-actions">
        <button type="button" className="secondary" onClick={() => setEditing(true)}>
          Bearbeiten
        </button>
        <button type="button" className="danger" onClick={handleDelete}>
          Entfernen
        </button>
      </div>
    </div>
  );
}

function ServerRow({ server, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(server.name);
  const [host, setHost] = useState(server.host);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [svcName, setSvcName] = useState("");
  const [svcServiceName, setSvcServiceName] = useState("");
  const [addingSvc, setAddingSvc] = useState(false);
  const [svcError, setSvcError] = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateServer(server.id, { name, host });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Server "${server.name}" wirklich entfernen?`)) return;
    await deleteServer(server.id);
    onChanged();
  }

  async function handleAddService(e) {
    e.preventDefault();
    setAddingSvc(true);
    setSvcError(null);
    try {
      await addService(server.id, { name: svcName, serviceName: svcServiceName });
      setSvcName("");
      setSvcServiceName("");
      onChanged();
    } catch (err) {
      setSvcError(err.message);
    } finally {
      setAddingSvc(false);
    }
  }

  if (editing) {
    return (
      <form className="source-row source-row-editing" onSubmit={handleSave}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
        <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="Host / IP" required />
        <div className="source-row-actions">
          <button type="submit" disabled={saving}>
            {saving ? "Speichert..." : "Speichern"}
          </button>
          <button type="button" className="secondary" onClick={() => setEditing(false)}>
            Abbrechen
          </button>
        </div>
        {error && <div className="settings-result settings-error">{error}</div>}
      </form>
    );
  }

  return (
    <div className="source-row server-row">
      <div className="server-row-main">
        <div className="source-info">
          <span className="source-name">{server.name}</span>
          <code className="source-path">{server.host}</code>
          <span className="source-meta">
            <span className={`status-pill ${server.online ? "status-pill-online" : "status-pill-offline"}`}>
              {server.online ? "Online" : "Offline"}
            </span>
          </span>
        </div>
        <div className="source-row-actions">
          <button type="button" className="secondary" onClick={() => setEditing(true)}>
            Bearbeiten
          </button>
          <button type="button" className="danger" onClick={handleDelete}>
            Entfernen
          </button>
        </div>
      </div>

      <div className="service-list">
        {server.services.map((svc) => (
          <ServiceCheckRow key={svc.id} serverId={server.id} service={svc} onChanged={onChanged} />
        ))}
        {server.services.length === 0 && (
          <p className="chart-subtitle service-list-empty">Noch kein Service auf diesem Server.</p>
        )}
      </div>

      <form onSubmit={handleAddService} className="service-add-fields">
        <input
          type="text"
          placeholder="Anzeigename, z.B. Datenbank"
          value={svcName}
          onChange={(e) => setSvcName(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Windows-Dienstname, z.B. MSSQLSERVER oder Spooler"
          value={svcServiceName}
          onChange={(e) => setSvcServiceName(e.target.value)}
          required
        />
        <button type="submit" disabled={addingSvc}>
          {addingSvc ? "Fügt hinzu..." : "Service hinzufügen"}
        </button>
      </form>
      {svcError && <div className="settings-result settings-error">{svcError}</div>}
    </div>
  );
}

function ServersCard({ servers, onChanged }) {
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  const {
    orderedItems: orderedServers,
    draggingId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  } = useReorderableList(servers, (order) => {
    reorderServers(order)
      .catch((err) => console.error("Server-Reihenfolge konnte nicht gespeichert werden:", err))
      .finally(onChanged);
  });

  async function handleAdd(e) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await addServer({ name, host });
      setName("");
      setHost("");
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="settings-card">
      <h2>Server</h2>
      <p className="chart-subtitle">
        Eigenständige Server, unabhängig von den Log-Quellen. Erreichbarkeit wird per Ping
        geprüft; ob ein bestimmter Windows-Dienst darauf läuft, per <code>sc query</code>
        (alle 30s). Der Dienstname ist der technische Name (z.B. "Spooler"), nicht der
        Anzeigename aus der Dienste-Verwaltung.
      </p>

      <div className="source-list">
        {servers.length === 0 && <p className="chart-subtitle">Noch kein Server konfiguriert.</p>}
        {orderedServers.map((s) => (
          <DraggableRow
            key={s.id}
            id={s.id}
            isDragging={draggingId === s.id}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <ServerRow server={s} onChanged={onChanged} />
          </DraggableRow>
        ))}
      </div>

      <form onSubmit={handleAdd} className="settings-form source-add-form">
        <label htmlFor="server-name">Neuen Server hinzufügen</label>
        <div className="source-add-fields">
          <input
            id="server-name"
            type="text"
            placeholder="Name, z.B. Test-Server2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Host / IP, z.B. server01 oder 10.0.0.5"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            required
          />
          <button type="submit" disabled={adding}>
            {adding ? "Fügt hinzu..." : "Hinzufügen"}
          </button>
        </div>
      </form>

      {error && <div className="settings-result settings-error">{error}</div>}
    </div>
  );
}

function RefreshIntervalCard({ refreshIntervalSeconds, onChanged }) {
  const [value, setValue] = useState(refreshIntervalSeconds);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setResult(null);
    try {
      const updated = await updateSettings({ refreshIntervalSeconds: Number(value) });
      onChanged(updated.refreshIntervalSeconds);
      setResult({ type: "success", text: "Gespeichert." });
    } catch (err) {
      setResult({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-card">
      <h2>Automatische Aktualisierung</h2>
      <p className="chart-subtitle">
        Wie oft die Service-Ansicht Diagramm und Tabelle im Hintergrund neu lädt.
      </p>
      <form onSubmit={handleSave} className="settings-form">
        <label htmlFor="refresh-interval">Intervall (Sekunden)</label>
        <div className="source-add-fields">
          <input
            id="refresh-interval"
            type="number"
            min="5"
            step="5"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
          <button type="submit" disabled={saving}>
            {saving ? "Speichert..." : "Speichern"}
          </button>
        </div>
      </form>
      {result && <div className={`settings-result settings-${result.type}`}>{result.text}</div>}
    </div>
  );
}

export default function SettingsPage({
  sources,
  groups,
  fileCounts,
  servers,
  refreshIntervalSeconds,
  onChanged,
  onServersChanged,
  onRefreshIntervalChanged,
  onBack,
}) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [groupId, setGroupId] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  const {
    orderedItems: orderedSources,
    draggingId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  } = useReorderableList(sources, (order) => {
    reorderSources(order)
      .catch((err) => console.error("Quellen-Reihenfolge konnte nicht gespeichert werden:", err))
      .finally(onChanged);
  });

  async function handleAdd(e) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await addSource({ name, path, expiresAt, groupId });
      setName("");
      setPath("");
      setExpiresAt("");
      setGroupId("");
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-card">
        <h2>Log-Quellen</h2>
        <p className="chart-subtitle">
          Jede Quelle ist ein benannter Ordner mit Log-Textdateien (z.B. ein Server).
        </p>

        <div className="source-list">
          {sources.length === 0 && <p className="chart-subtitle">Noch keine Quelle konfiguriert.</p>}
          {orderedSources.map((s) => (
            <DraggableRow
              key={s.id}
              id={s.id}
              isDragging={draggingId === s.id}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <SourceRow source={s} fileCount={fileCounts[s.id]} groups={groups} onChanged={onChanged} />
            </DraggableRow>
          ))}
        </div>

        <form onSubmit={handleAdd} className="settings-form source-add-form">
          <label htmlFor="source-name">Neue Quelle hinzufügen</label>
          <div className="source-add-fields">
            <input
              id="source-name"
              type="text"
              placeholder="Name, z.B. Test-server1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <PathInputWithBrowse value={path} onChange={setPath} />
            <label
              className="source-expiry-inline"
              title="Optional. Macht die Quelle temporär, sie verschwindet danach automatisch."
            >
              Ablaufdatum
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </label>
            {groups.length > 0 && (
              <label className="source-expiry-inline">
                Gruppe
                <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  <option value="">Keine</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="submit" disabled={adding}>
              {adding ? "Fügt hinzu..." : "Hinzufügen"}
            </button>
          </div>
        </form>

        {error && <div className="settings-result settings-error">{error}</div>}
      </div>

      <GroupsCard groups={groups} sources={sources} onChanged={onChanged} />

      <ServersCard servers={servers} onChanged={onServersChanged} />

      <RefreshIntervalCard refreshIntervalSeconds={refreshIntervalSeconds} onChanged={onRefreshIntervalChanged} />

      <div className="settings-actions settings-page-actions">
        <button type="button" className="secondary" onClick={onBack}>
          Zurück zur Übersicht
        </button>
      </div>
    </div>
  );
}
