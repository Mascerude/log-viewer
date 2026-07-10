import { useState } from "react";
import {
  addSource,
  deleteSource,
  updateSource,
  addServer,
  deleteServer,
  updateServer,
  addService,
  updateService,
  deleteService,
  updateSettings,
  browseFolder,
} from "../api";

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

function SourceRow({ source, fileCount, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(source.name);
  const [path, setPath] = useState(source.path);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateSource(source.id, { name, path });
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

  if (editing) {
    return (
      <form className="source-row source-row-editing" onSubmit={handleSave}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
        <PathInputWithBrowse value={path} onChange={setPath} />
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
        <span className="source-name">{source.name}</span>
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
        {servers.map((s) => (
          <ServerRow key={s.id} server={s} onChanged={onChanged} />
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
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  async function handleAdd(e) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await addSource({ name, path });
      setName("");
      setPath("");
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
          {sources.map((s) => (
            <SourceRow key={s.id} source={s} fileCount={fileCounts[s.id]} onChanged={onChanged} />
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
            <button type="submit" disabled={adding}>
              {adding ? "Fügt hinzu..." : "Hinzufügen"}
            </button>
          </div>
        </form>

        {error && <div className="settings-result settings-error">{error}</div>}
      </div>

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
