import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { execFile } from "child_process";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import PDFDocument from "pdfkit";
import { listLogFiles, parseLogFile } from "./parser.js";

dotenv.config();

const app = express();
app.use(cors());
// Raised above the 100kb default: a full-export PDF request bundles every
// matched entry (including long multi-line stack traces) in one JSON body.
app.use(express.json({ limit: "50mb" }));

const PORT = process.env.PORT || 4000;
const CONFIG_PATH = path.resolve("config.json");
const SAVED_SEARCHES_PATH = path.resolve("saved-searches.json");
const DEFAULT_REFRESH_SECONDS = 30;
const DEFAULT_GOTO_PAGE_DELAY_SECONDS = 1.5;
const MONITOR_INTERVAL_MS = 30_000;

// Production build of the client (created by `npm run build` in client/), served
// alongside the API so the app runs as a single process on a single port —
// the client's relative /api fetches then just work, no dev-server proxy needed.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");
const CLIENT_BUILD_EXISTS = fs.existsSync(path.join(CLIENT_DIST, "index.html"));
if (CLIENT_BUILD_EXISTS) app.use(express.static(CLIENT_DIST));

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    let loadedSources = null;
    if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
      loadedSources = parsed.sources;
    } else if (parsed.logDir) {
      // migrate legacy single-folder config ({ logDir })
      loadedSources = [{ id: crypto.randomUUID(), name: "Standard", path: parsed.logDir }];
    }
    return {
      sources: loadedSources,
      groups: Array.isArray(parsed.groups) ? parsed.groups : null,
      servers: Array.isArray(parsed.servers) ? parsed.servers : null,
      // Only read here for one-time migration below — saved searches now
      // live in their own file, config.json no longer stores or writes this.
      legacySavedSearches: Array.isArray(parsed.savedSearches) ? parsed.savedSearches : null,
      refreshIntervalSeconds:
        typeof parsed.refreshIntervalSeconds === "number" ? parsed.refreshIntervalSeconds : null,
      goToPageDelaySeconds:
        typeof parsed.goToPageDelaySeconds === "number" ? parsed.goToPageDelaySeconds : null,
    };
  } catch {
    // no config.json yet, or unreadable — fall through to defaults
  }
  return {
    sources: null,
    groups: null,
    servers: null,
    legacySavedSearches: null,
    refreshIntervalSeconds: null,
    goToPageDelaySeconds: null,
  };
}

function saveConfig() {
  fs.writeFileSync(
    CONFIG_PATH,
    JSON.stringify({ sources, groups, servers, refreshIntervalSeconds, goToPageDelaySeconds }, null, 2),
    "utf-8"
  );
}

function loadSavedSearchesFile() {
  try {
    const raw = fs.readFileSync(SAVED_SEARCHES_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      searches: Array.isArray(parsed.searches) ? parsed.searches : [],
    };
  } catch {
    return null; // no saved-searches.json yet, or unreadable
  }
}

function saveSavedSearchesFile() {
  fs.writeFileSync(
    SAVED_SEARCHES_PATH,
    JSON.stringify({ folders: savedSearchFolders, searches: savedSearches }, null, 2),
    "utf-8"
  );
}

const loaded = loadConfig();
let sources =
  loaded.sources || [
    {
      id: crypto.randomUUID(),
      name: "Standard",
      path: process.env.LOG_DIR ? path.resolve(process.env.LOG_DIR) : path.resolve("../sample-logs"),
    },
  ];
// Drop any leftover ping config from a previous version — sources are just name+path now.
for (const s of sources) delete s.host;
let groups = loaded.groups || [];
let servers = loaded.servers || [];
for (const s of servers) if (!Array.isArray(s.services)) s.services = [];
let refreshIntervalSeconds = loaded.refreshIntervalSeconds || DEFAULT_REFRESH_SECONDS;
let goToPageDelaySeconds = loaded.goToPageDelaySeconds ?? DEFAULT_GOTO_PAGE_DELAY_SECONDS;

const loadedSavedSearches = loadSavedSearchesFile();
let savedSearchFolders = loadedSavedSearches?.folders || [];
let savedSearches = loadedSavedSearches?.searches || [];
// One-time migration: saved searches used to live inside config.json.
if (!loadedSavedSearches && Array.isArray(loaded.legacySavedSearches) && loaded.legacySavedSearches.length > 0) {
  savedSearches = loaded.legacySavedSearches.map((s) => ({ ...s, folderId: s.folderId || null }));
  saveSavedSearchesFile();
}

pruneExpiredSources();
saveConfig();

// Re-check periodically so a temporary source disappears shortly after
// midnight on its expiry date without requiring a server restart.
setInterval(() => {
  if (pruneExpiredSources()) saveConfig();
}, MONITOR_INTERVAL_MS);

function sourceInfo(s) {
  return {
    id: s.id,
    name: s.name,
    path: s.path,
    exists: fs.existsSync(s.path),
    expiresAt: s.expiresAt || null,
    groupId: s.groupId || null,
    refreshIntervalSeconds: s.refreshIntervalSeconds ?? null,
    serviceRefreshIntervals: s.serviceRefreshIntervals || {},
  };
}

function groupInfo(g) {
  return { id: g.id, name: g.name };
}

// Reorders `list` to match `order` (an array of ids). Ids not present in the
// list are ignored; items whose id isn't in `order` keep their relative
// position, appended after the reordered ones. Used for drag & drop reorder
// of sources/servers in Settings.
function reorderById(list, order) {
  const byId = new Map(list.map((item) => [item.id, item]));
  const seen = new Set();
  const reordered = [];
  for (const id of order) {
    const item = byId.get(id);
    if (item && !seen.has(id)) {
      reordered.push(item);
      seen.add(id);
    }
  }
  for (const item of list) {
    if (!seen.has(item.id)) reordered.push(item);
  }
  return reordered;
}

// Temporary sources (expiresAt set) quietly disappear once their date has
// passed — treated exactly like a deleted source everywhere else, since
// resolveSources()/listAllFiles() only ever see what's left in `sources`.
function pruneExpiredSources() {
  const today = new Date().toISOString().slice(0, 10);
  const before = sources.length;
  sources = sources.filter((s) => !s.expiresAt || s.expiresAt >= today);
  return sources.length !== before;
}

// ---- Servers: standalone infrastructure monitoring, entirely independent of
// the log sources. A server's reachability is checked by pinging its host; a
// service on a server is a named Windows Service, checked via `sc query`
// (queried remotely as `sc \\host query <name>` unless the host is local). ----

function pingHost(host) {
  return new Promise((resolve) => {
    const args =
      process.platform === "win32" ? ["-n", "1", "-w", "1000", host] : ["-c", "1", "-W", "1", host];
    execFile("ping", args, { timeout: 3000 }, (err) => resolve(!err));
  });
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "."]);

function checkWindowsService(host, serviceName) {
  return new Promise((resolve) => {
    if (process.platform !== "win32" || !serviceName) return resolve(false);
    const isLocal = !host || LOCAL_HOSTS.has(host.toLowerCase());
    const args = isLocal ? ["query", serviceName] : [`\\\\${host}`, "query", serviceName];
    execFile("sc", args, { timeout: 5000 }, (_err, stdout) => {
      resolve(/STATE\s*:\s*\d+\s*RUNNING/i.test(stdout || ""));
    });
  });
}

const onlineStatus = new Map(); // serverId -> { online, checkedAt }
const serviceStatus = new Map(); // serviceId -> { online, checkedAt }

async function checkServerOnline(server) {
  const online = await pingHost(server.host);
  onlineStatus.set(server.id, { online, checkedAt: Date.now() });
  return online;
}

async function checkServiceOnline(server, service) {
  const online = await checkWindowsService(server.host, service.serviceName);
  serviceStatus.set(service.id, { online, checkedAt: Date.now() });
  return online;
}

async function refreshMonitoring() {
  for (const s of servers) {
    await checkServerOnline(s);
    for (const svc of s.services) {
      await checkServiceOnline(s, svc);
    }
  }
}

refreshMonitoring();
setInterval(refreshMonitoring, MONITOR_INTERVAL_MS);

function serviceInfo(svc) {
  const status = serviceStatus.get(svc.id);
  return { id: svc.id, name: svc.name, serviceName: svc.serviceName, online: status ? status.online : false };
}

function serverInfo(s) {
  const status = onlineStatus.get(s.id);
  return {
    id: s.id,
    name: s.name,
    host: s.host,
    online: status ? status.online : false,
    services: s.services.map(serviceInfo),
  };
}

function resolveSources(sourceParam) {
  if (!sourceParam) return sources;
  const ids = String(sourceParam).split(",").filter(Boolean);
  return sources.filter((s) => ids.includes(s.id));
}

function listAllFiles(sourceParam) {
  const active = resolveSources(sourceParam);
  const files = [];
  for (const s of active) {
    if (!fs.existsSync(s.path)) continue;
    for (const f of listLogFiles(s.path)) {
      files.push({
        ...f,
        sourceId: s.id,
        sourceName: s.name,
        fullPath: path.join(s.path, f.fileName),
      });
    }
  }
  files.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return files;
}

function getFilesInRange(from, to, sourceParam) {
  return listAllFiles(sourceParam).filter((f) => {
    // Undated files (the current/active log per service, not yet rotated
    // into a dated file) can't be pre-filtered by filename — always include
    // them and let entry-level date filtering sort out what's relevant.
    if (!f.date) return true;
    if (from && f.date < from) return false;
    if (to && f.date > to) return false;
    return true;
  });
}

// Combines the date-range boundaries with a time-of-day, so e.g. "20.03. –
// 21.03." with "08:00 – 17:00" excludes entries outside office hours on both
// boundary days while leaving any full days in between untouched. Comparing
// full ISO timestamps as strings works because ISO 8601 sorts lexicographically.
function filterEntriesByDate(entries, from, to, fromTime, toTime) {
  const fromDT = from ? `${from}T${fromTime || "00:00"}:00.000` : null;
  const toDT = to ? `${to}T${toTime || "23:59"}:59.999` : null;
  return entries.filter((e) => (!fromDT || e.timestamp >= fromDT) && (!toDT || e.timestamp <= toDT));
}

// Shared by /api/logs and /api/stats so the chart always reflects the same
// level/search/exclude/pid/tid filters as the table.
function applyEntryFilters(entries, { level, pid, tid, search, exclude, excludeMode } = {}) {
  let result = entries;
  if (level) {
    const levels = String(level).split(",").filter(Boolean);
    result = result.filter((e) => levels.includes(e.level));
  }
  if (pid) result = result.filter((e) => e.pid === pid);
  if (tid) result = result.filter((e) => e.tid === tid);
  if (search) {
    const needle = String(search).toLowerCase();
    result = result.filter((e) => e.message.toLowerCase().includes(needle));
  }
  if (exclude) {
    // A JSON-encoded array of terms — arbitrarily many, added one at a time
    // as chips in the filter bar. Malformed input is ignored rather than
    // erroring, since this feeds a best-effort display filter.
    let terms = [];
    try {
      const parsed = JSON.parse(exclude);
      if (Array.isArray(parsed)) terms = parsed.filter(Boolean).map((t) => String(t).toLowerCase());
    } catch {
      // ignore
    }
    if (terms.length > 0) {
      result = result.filter((e) => {
        const message = e.message.toLowerCase();
        return !terms.some((needle) =>
          excludeMode === "exact" ? message === needle : message.includes(needle)
        );
      });
    }
  }
  return result;
}

const SORTABLE_FIELDS = new Set(["timestamp", "pid", "tid"]);

// pid/tid are stored as strings (straight regex captures) but need numeric
// comparison — "9" would otherwise sort after "10". timestamp is ISO 8601
// and sorts correctly as a plain string.
function sortEntries(entries, sortBy, sortDir) {
  const field = SORTABLE_FIELDS.has(sortBy) ? sortBy : "timestamp";
  const factor = sortDir === "asc" ? 1 : -1;
  const numeric = field === "pid" || field === "tid";
  return entries.slice().sort((a, b) => {
    const av = numeric ? Number(a[field]) : a[field];
    const bv = numeric ? Number(b[field]) : b[field];
    if (av < bv) return -factor;
    if (av > bv) return factor;
    return 0;
  });
}

function loadEntries(files) {
  const entries = [];
  for (const f of files) {
    try {
      const parsed = parseLogFile(f.fullPath, f.fileName);
      for (const e of parsed) {
        entries.push({ ...e, id: `${f.sourceId}:${e.id}`, service: f.service, sourceId: f.sourceId, sourceName: f.sourceName });
      }
    } catch (err) {
      console.error(`Failed to parse ${f.fileName}:`, err.message);
    }
  }
  return entries;
}

// Validates an optional per-source/service refresh-interval override:
// null/undefined/"" clears it (falls back to the next level up), otherwise
// it must be a number >= 1s (same floor as the global setting), rounded to
// one decimal place.
function parseOptionalInterval(value) {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1) return { ok: false, value: null };
  return { ok: true, value: Math.round(num * 10) / 10 };
}

// ---- Sources (named log folders) ----

app.get("/api/sources", (req, res) => {
  res.json(sources.map(sourceInfo));
});

app.post("/api/sources", (req, res) => {
  const { name, path: rawPath, expiresAt, groupId } = req.body || {};
  if (!name || !name.trim() || !rawPath || !rawPath.trim()) {
    return res.status(400).json({ error: "Name und Pfad sind erforderlich." });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (expiresAt && expiresAt.trim() && expiresAt.trim() <= today) {
    return res.status(400).json({ error: "Ablaufdatum muss in der Zukunft liegen." });
  }
  if (groupId && !groups.some((g) => g.id === groupId)) {
    return res.status(400).json({ error: "Gruppe nicht gefunden." });
  }
  const source = {
    id: crypto.randomUUID(),
    name: name.trim(),
    path: path.resolve(rawPath.trim()),
    ...(expiresAt && expiresAt.trim() ? { expiresAt: expiresAt.trim() } : {}),
    ...(groupId ? { groupId } : {}),
  };
  sources.push(source);
  saveConfig();
  res.status(201).json(sourceInfo(source));
});

// Registered before /api/sources/:id so "reorder" isn't swallowed as an id.
app.put("/api/sources/reorder", (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: "order muss ein Array von IDs sein." });
  sources = reorderById(sources, order);
  saveConfig();
  res.json(sources.map(sourceInfo));
});

app.put("/api/sources/:id", (req, res) => {
  const source = sources.find((s) => s.id === req.params.id);
  if (!source) return res.status(404).json({ error: "Quelle nicht gefunden." });
  const body = req.body || {};
  if (body.name && body.name.trim()) source.name = body.name.trim();
  if (body.path && body.path.trim()) source.path = path.resolve(body.path.trim());
  if ("expiresAt" in body) {
    const trimmed = body.expiresAt && body.expiresAt.trim();
    if (trimmed) {
      const today = new Date().toISOString().slice(0, 10);
      if (trimmed <= today) {
        return res.status(400).json({ error: "Ablaufdatum muss in der Zukunft liegen." });
      }
      source.expiresAt = trimmed;
    } else {
      delete source.expiresAt;
    }
  }
  if ("groupId" in body) {
    if (body.groupId) {
      if (!groups.some((g) => g.id === body.groupId)) {
        return res.status(400).json({ error: "Gruppe nicht gefunden." });
      }
      source.groupId = body.groupId;
    } else {
      delete source.groupId;
    }
  }
  if ("refreshIntervalSeconds" in body) {
    const parsed = parseOptionalInterval(body.refreshIntervalSeconds);
    if (!parsed.ok) {
      return res.status(400).json({ error: "Das Intervall muss mindestens 5 Sekunden betragen." });
    }
    if (parsed.value === null) delete source.refreshIntervalSeconds;
    else source.refreshIntervalSeconds = parsed.value;
  }
  saveConfig();
  res.json(sourceInfo(source));
});

// Per-service override of the auto-refresh interval — services aren't a
// persisted entity (they're derived from filenames), so this is keyed by
// name directly rather than through a services sub-resource with its own ids.
app.put("/api/sources/:id/service-settings", (req, res) => {
  const source = sources.find((s) => s.id === req.params.id);
  if (!source) return res.status(404).json({ error: "Quelle nicht gefunden." });
  const { service, refreshIntervalSeconds } = req.body || {};
  if (!service || !String(service).trim()) {
    return res.status(400).json({ error: "service ist erforderlich." });
  }
  const parsed = parseOptionalInterval(refreshIntervalSeconds);
  if (!parsed.ok) {
    return res.status(400).json({ error: "Das Intervall muss mindestens 5 Sekunden betragen." });
  }
  if (parsed.value === null) {
    if (source.serviceRefreshIntervals) {
      delete source.serviceRefreshIntervals[service];
      if (Object.keys(source.serviceRefreshIntervals).length === 0) delete source.serviceRefreshIntervals;
    }
  } else {
    if (!source.serviceRefreshIntervals) source.serviceRefreshIntervals = {};
    source.serviceRefreshIntervals[service] = parsed.value;
  }
  saveConfig();
  res.json(sourceInfo(source));
});

app.delete("/api/sources/:id", (req, res) => {
  const idx = sources.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Quelle nicht gefunden." });
  sources.splice(idx, 1);
  saveConfig();
  res.status(204).end();
});

// ---- Groups (collapsible folders for sources in the sidebar) ----

app.get("/api/groups", (req, res) => {
  res.json(groups.map(groupInfo));
});

app.post("/api/groups", (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Name ist erforderlich." });
  const group = { id: crypto.randomUUID(), name: name.trim() };
  groups.push(group);
  saveConfig();
  res.status(201).json(groupInfo(group));
});

// Registered before /api/groups/:id so "reorder" isn't swallowed as an id.
app.put("/api/groups/reorder", (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: "order muss ein Array von IDs sein." });
  groups = reorderById(groups, order);
  saveConfig();
  res.json(groups.map(groupInfo));
});

app.put("/api/groups/:id", (req, res) => {
  const group = groups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "Gruppe nicht gefunden." });
  const { name } = req.body || {};
  if (name && name.trim()) group.name = name.trim();
  saveConfig();
  res.json(groupInfo(group));
});

app.delete("/api/groups/:id", (req, res) => {
  const idx = groups.findIndex((g) => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Gruppe nicht gefunden." });
  groups.splice(idx, 1);
  // Sources in the deleted group aren't removed, just ungrouped.
  for (const s of sources) if (s.groupId === req.params.id) delete s.groupId;
  saveConfig();
  res.status(204).end();
});

// Opens a native Windows folder-browser dialog on the machine running the
// server (only meaningful for local use, where server and browser are on the
// same machine) and returns the chosen path.
app.get("/api/browse-folder", (req, res) => {
  if (process.platform !== "win32") {
    return res.status(400).json({ error: "Ordnerauswahl ist nur unter Windows verfügbar." });
  }
  const scriptPath = path.resolve("browse-folder.ps1");
  execFile(
    "powershell.exe",
    ["-NoProfile", "-STA", "-File", scriptPath],
    { timeout: 300000 },
    (err, stdout) => {
      if (err) {
        return res.status(500).json({ error: "Ordnerauswahl konnte nicht geöffnet werden." });
      }
      const selected = (stdout || "").trim();
      res.json({ path: selected || null });
    }
  );
});

// ---- Servers (standalone infrastructure monitoring) ----

app.get("/api/servers", (req, res) => {
  res.json(servers.map(serverInfo));
});

app.post("/api/servers", async (req, res) => {
  const { name, host } = req.body || {};
  if (!name || !name.trim() || !host || !host.trim()) {
    return res.status(400).json({ error: "Name und Host sind erforderlich." });
  }
  const server = { id: crypto.randomUUID(), name: name.trim(), host: host.trim(), services: [] };
  servers.push(server);
  saveConfig();
  await checkServerOnline(server);
  res.status(201).json(serverInfo(server));
});

// Registered before /api/servers/:id so "reorder" isn't swallowed as an id.
app.put("/api/servers/reorder", (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: "order muss ein Array von IDs sein." });
  servers = reorderById(servers, order);
  saveConfig();
  res.json(servers.map(serverInfo));
});

app.put("/api/servers/:id", async (req, res) => {
  const server = servers.find((s) => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: "Server nicht gefunden." });
  const { name, host } = req.body || {};
  if (name && name.trim()) server.name = name.trim();
  if (host && host.trim()) server.host = host.trim();
  saveConfig();
  await checkServerOnline(server);
  for (const svc of server.services) await checkServiceOnline(server, svc);
  res.json(serverInfo(server));
});

app.delete("/api/servers/:id", (req, res) => {
  const idx = servers.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Server nicht gefunden." });
  const [removed] = servers.splice(idx, 1);
  onlineStatus.delete(removed.id);
  for (const svc of removed.services) serviceStatus.delete(svc.id);
  saveConfig();
  res.status(204).end();
});

// ---- Services (per server, checked via `sc query` against a Windows
// Service name on that host) ----

app.post("/api/servers/:id/services", async (req, res) => {
  const server = servers.find((s) => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: "Server nicht gefunden." });
  const { name, serviceName } = req.body || {};
  if (!name || !name.trim() || !serviceName || !serviceName.trim()) {
    return res.status(400).json({ error: "Anzeigename und Windows-Dienstname sind erforderlich." });
  }
  const service = { id: crypto.randomUUID(), name: name.trim(), serviceName: serviceName.trim() };
  server.services.push(service);
  saveConfig();
  await checkServiceOnline(server, service);
  res.status(201).json(serviceInfo(service));
});

app.put("/api/servers/:id/services/:serviceId", async (req, res) => {
  const server = servers.find((s) => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: "Server nicht gefunden." });
  const service = server.services.find((svc) => svc.id === req.params.serviceId);
  if (!service) return res.status(404).json({ error: "Service nicht gefunden." });
  const { name, serviceName } = req.body || {};
  if (name && name.trim()) service.name = name.trim();
  if (serviceName && serviceName.trim()) service.serviceName = serviceName.trim();
  saveConfig();
  await checkServiceOnline(server, service);
  res.json(serviceInfo(service));
});

app.delete("/api/servers/:id/services/:serviceId", (req, res) => {
  const server = servers.find((s) => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: "Server nicht gefunden." });
  const idx = server.services.findIndex((svc) => svc.id === req.params.serviceId);
  if (idx === -1) return res.status(404).json({ error: "Service nicht gefunden." });
  const [removed] = server.services.splice(idx, 1);
  serviceStatus.delete(removed.id);
  saveConfig();
  res.status(204).end();
});

// ---- App settings ----

app.get("/api/settings", (req, res) => {
  res.json({ refreshIntervalSeconds, goToPageDelaySeconds });
});

app.put("/api/settings", (req, res) => {
  const body = req.body || {};
  if ("refreshIntervalSeconds" in body) {
    const value = body.refreshIntervalSeconds;
    if (!Number.isFinite(value) || value < 1) {
      return res.status(400).json({ error: "Das Intervall muss mindestens 1 Sekunde betragen." });
    }
    refreshIntervalSeconds = Math.round(value);
  }
  if ("goToPageDelaySeconds" in body) {
    const value = body.goToPageDelaySeconds;
    if (!Number.isFinite(value) || value < 0 || value > 30) {
      return res.status(400).json({ error: "Die Verzögerung muss zwischen 0 und 30 Sekunden liegen." });
    }
    goToPageDelaySeconds = Math.round(value * 100) / 100;
  }
  saveConfig();
  res.json({ refreshIntervalSeconds, goToPageDelaySeconds });
});

// ---- Saved searches (global search page) ----
//
// Kept in their own file (saved-searches.json), not config.json — a separate
// concern from the server's own setup, and likely to grow independently.
// Stores the source/service names alongside their ids (not just the ids) so
// that a saved search whose source or service has since been deleted can
// still show a meaningful name in the "no longer exists" warning — looking
// it up in the current sources/files list wouldn't work anymore by then.

function savedSearchFolderInfo(f) {
  return { id: f.id, name: f.name };
}

function buildSavedSearch(body, existing) {
  const { name, folderId, query, sources: srcList, services: svcList, filters, refreshIntervalSeconds } = body || {};
  return {
    id: existing?.id || crypto.randomUUID(),
    name: name.trim(),
    folderId: folderId || null,
    query: typeof query === "string" ? query : "",
    sources: Array.isArray(srcList)
      ? srcList.filter((s) => s && s.id).map((s) => ({ id: s.id, name: s.name || s.id }))
      : [],
    services: Array.isArray(svcList)
      ? svcList
          .filter((s) => s && s.sourceId && s.service)
          .map((s) => ({ sourceId: s.sourceId, sourceName: s.sourceName || s.sourceId, service: s.service }))
      : [],
    filters: {
      levels: Array.isArray(filters?.levels) ? filters.levels : [],
      pid: filters?.pid || "",
      tid: filters?.tid || "",
      excludeList: Array.isArray(filters?.excludeList) ? filters.excludeList : [],
      excludeMode: filters?.excludeMode === "exact" ? "exact" : "contains",
      from: filters?.from || "",
      to: filters?.to || "",
      fromTime: filters?.fromTime || "00:00",
      toTime: filters?.toTime || "23:59",
    },
    // 0 (or absent) means "off", matching the search page's own convention.
    refreshIntervalSeconds: Number.isFinite(refreshIntervalSeconds) && refreshIntervalSeconds > 0
      ? refreshIntervalSeconds
      : 0,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: existing ? new Date().toISOString() : undefined,
  };
}

app.get("/api/saved-search-folders", (req, res) => {
  res.json(savedSearchFolders.map(savedSearchFolderInfo));
});

app.post("/api/saved-search-folders", (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Name ist erforderlich." });
  const folder = { id: crypto.randomUUID(), name: name.trim() };
  savedSearchFolders.push(folder);
  saveSavedSearchesFile();
  res.status(201).json(savedSearchFolderInfo(folder));
});

app.delete("/api/saved-search-folders/:id", (req, res) => {
  const idx = savedSearchFolders.findIndex((f) => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Ordner nicht gefunden." });
  savedSearchFolders.splice(idx, 1);
  // Searches in the deleted folder aren't removed, just moved back to the root.
  for (const s of savedSearches) if (s.folderId === req.params.id) s.folderId = null;
  saveSavedSearchesFile();
  res.status(204).end();
});

app.get("/api/saved-searches", (req, res) => {
  res.json(savedSearches);
});

app.post("/api/saved-searches", (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Name ist erforderlich." });
  const savedSearch = buildSavedSearch(req.body);
  savedSearches.push(savedSearch);
  saveSavedSearchesFile();
  res.status(201).json(savedSearch);
});

// Full overwrite of an existing saved search — used when the client confirms
// replacing one that already has the same name in the same folder.
app.put("/api/saved-searches/:id", (req, res) => {
  const idx = savedSearches.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Gespeicherte Suche nicht gefunden." });
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Name ist erforderlich." });
  const updated = buildSavedSearch(req.body, savedSearches[idx]);
  savedSearches[idx] = updated;
  saveSavedSearchesFile();
  res.json(updated);
});

app.delete("/api/saved-searches/:id", (req, res) => {
  const idx = savedSearches.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Gespeicherte Suche nicht gefunden." });
  savedSearches.splice(idx, 1);
  saveSavedSearchesFile();
  res.status(204).end();
});

// ---- Log data ----

app.get("/api/files", (req, res) => {
  res.json(listAllFiles(req.query.source));
});

app.get("/api/logs", (req, res) => {
  const {
    from,
    to,
    fromTime,
    toTime,
    level,
    search,
    exclude,
    excludeMode,
    pid,
    tid,
    service,
    source,
    servicePairs,
    sortBy = "timestamp",
    sortDir = "desc",
    page = "1",
    pageSize = "200",
  } = req.query;

  const services = service ? String(service).split(",").filter(Boolean) : null;

  // Distinct from `service`: an exact (sourceId, service) allowlist, needed
  // because two different sources can happen to run a same-named service —
  // filtering by name alone would blend their entries together.
  let pairFilter = null;
  if (servicePairs) {
    let parsed;
    try {
      parsed = JSON.parse(servicePairs);
    } catch {
      return res.status(400).json({ error: "servicePairs ist kein gültiges JSON." });
    }
    if (!Array.isArray(parsed)) {
      return res.status(400).json({ error: "servicePairs muss ein Array sein." });
    }
    pairFilter = new Set(parsed.map(([sourceId, svc]) => `${sourceId}::${svc}`));
  }

  const files = getFilesInRange(from, to, source).filter((f) => {
    if (services && !services.includes(f.service)) return false;
    if (pairFilter && !pairFilter.has(`${f.sourceId}::${f.service}`)) return false;
    return true;
  });
  let entries = filterEntriesByDate(loadEntries(files), from, to, fromTime, toTime);
  entries = applyEntryFilters(entries, { level, pid, tid, search, exclude, excludeMode });
  entries = sortEntries(entries, sortBy, sortDir);

  const total = entries.length;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.min(1000, Math.max(1, parseInt(pageSize, 10) || 200));
  const start = (pageNum - 1) * size;
  const pageEntries = entries.slice(start, start + size);

  res.json({ entries: pageEntries, total, page: pageNum, pageSize: size });
});

function countSince(entries, daysAgo) {
  const sinceIso = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return entries.filter((e) => e.timestamp >= sinceIso).length;
}

// Collapses every run of digits to a single placeholder so messages that only
// differ by an embedded id/count/date ("VS11 für 4001329,4002403 ...") are
// recognized as the same underlying message template.
function normalizeMessage(message) {
  return message.replace(/\d+/g, "#");
}

// Finds every other occurrence of one entry's message, scoped to the same
// service, the same source ("Quelle"), or globally across all sources — used
// by the "Nachricht suchen" button in the entry detail modal. mode=exact
// requires an identical message; mode=similar matches on the normalized
// template (numbers ignored) so recurring messages with different ids/counts
// are grouped together too.
app.get("/api/message-occurrences", (req, res) => {
  const {
    message,
    scope = "service",
    mode = "exact",
    sourceId,
    service,
    sortBy = "timestamp",
    sortDir = "desc",
    page = "1",
    pageSize = "50",
  } = req.query;
  if (!message) return res.status(400).json({ error: "message ist erforderlich." });

  let files;
  if (scope === "global") {
    files = listAllFiles();
  } else if (scope === "source") {
    if (!sourceId) return res.status(400).json({ error: "sourceId ist erforderlich für scope=source." });
    files = listAllFiles(sourceId);
  } else {
    if (!sourceId || !service) {
      return res.status(400).json({ error: "sourceId und service sind erforderlich für scope=service." });
    }
    files = listAllFiles(sourceId).filter((f) => f.service === service);
  }

  const normalizedTarget = mode === "similar" ? normalizeMessage(message) : null;
  let entries = loadEntries(files).filter((e) =>
    mode === "similar" ? normalizeMessage(e.message) === normalizedTarget : e.message === message
  );
  entries = sortEntries(entries, sortBy, sortDir);

  const counts = {
    last24h: countSince(entries, 1),
    last3d: countSince(entries, 3),
    last7d: countSince(entries, 7),
    total: entries.length,
  };

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));
  const start = (pageNum - 1) * size;
  const pageEntries = entries.slice(start, start + size);

  res.json({ entries: pageEntries, counts, page: pageNum, pageSize: size });
});

const PDF_LEVEL_COLORS = {
  Fatal: { bg: "#fde2e1", fg: "#9b1c1c" },
  Error: { bg: "#fde2e1", fg: "#b3261e" },
  Warning: { bg: "#fff2cc", fg: "#8a6100" },
  Info: { bg: "#e3f3e6", fg: "#1e7a34" },
  Debug: { bg: "#eeeeee", fg: "#555555" },
};

function formatTimestampForPdf(iso) {
  const [datePart, timePart] = iso.split("T");
  const [y, m, d] = datePart.split("-");
  return `${d}.${m}.${y} ${timePart}`;
}

// Builds the table by hand (pdfkit has no built-in table support): fixed
// column widths, the message column takes whatever width is left, rows are
// measured up front so a tall wrapped message can push a page break before
// it's drawn, and the header re-draws itself on every new page.
function drawEntriesTable(doc, entries, { title, showSource, showService }) {
  const left = doc.page.margins.left;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottomLimit = doc.page.height - doc.page.margins.bottom;

  const columns = [{ key: "timestamp", label: "Zeitstempel", width: 95 }, { key: "levelName", label: "Level", width: 55 }];
  if (showSource) columns.push({ key: "sourceName", label: "Quelle", width: 90 });
  if (showService) columns.push({ key: "service", label: "Service", width: 110 });
  columns.push({ key: "pid", label: "PID", width: 42 });
  columns.push({ key: "tid", label: "TID", width: 42 });
  const fixedWidth = columns.reduce((sum, c) => sum + c.width, 0);
  columns.push({ key: "message", label: "Nachricht", width: Math.max(150, usableWidth - fixedWidth) });
  const tableWidth = fixedWidth + columns[columns.length - 1].width;

  function colX(index) {
    let x = left;
    for (let i = 0; i < index; i++) x += columns[i].width;
    return x;
  }

  function drawHeader(y) {
    doc.rect(left, y, tableWidth, 18).fill("#f2f2f2");
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#555");
    columns.forEach((col, i) => {
      doc.text(col.label.toUpperCase(), colX(i) + 4, y + 6, { width: col.width - 8 });
    });
    return y + 18;
  }

  doc.font("Helvetica-Bold").fontSize(16).fillColor("#111").text(title, left, doc.y);
  doc.moveDown(0.2);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#555")
    .text(`${entries.length.toLocaleString("de-DE")} Einträge · exportiert am ${new Date().toLocaleString("de-DE")}`);
  doc.moveDown(0.6);

  let y = drawHeader(doc.y);

  entries.forEach((e, rowIndex) => {
    // Standard PDF fonts (WinAnsiEncoding) don't render raw tab characters
    // correctly - the "Trace ended/suspended ... at: ..." footer lines use a
    // literal tab, which without this would draw as garbled glyphs.
    const message = String(e.message ?? "").replace(/\t/g, "    ");
    const messageWidth = columns[columns.length - 1].width - 8;
    doc.font("Courier").fontSize(8);
    const messageHeight = doc.heightOfString(message, { width: messageWidth });
    const rowHeight = Math.max(20, messageHeight + 10);

    if (y + rowHeight > bottomLimit && y > doc.page.margins.top + 18) {
      doc.addPage();
      y = drawHeader(doc.page.margins.top);
    }

    if (rowIndex % 2 === 1) doc.rect(left, y, tableWidth, rowHeight).fill("#fafafa");

    columns.forEach((col, i) => {
      const cx = colX(i);
      if (col.key === "levelName") {
        const colors = PDF_LEVEL_COLORS[e.levelName] || { bg: "#eee", fg: "#555" };
        doc.roundedRect(cx + 4, y + 5, col.width - 12, 12, 6).fill(colors.bg);
        doc
          .font("Helvetica-Bold")
          .fontSize(7)
          .fillColor(colors.fg)
          .text(e.levelName, cx + 4, y + 8, { width: col.width - 12, align: "center" });
      } else if (col.key === "message") {
        doc.font("Courier").fontSize(8).fillColor("#111").text(message, cx + 4, y + 5, { width: messageWidth });
      } else {
        const mono = col.key === "timestamp" || col.key === "pid" || col.key === "tid";
        const value = col.key === "timestamp" ? formatTimestampForPdf(e.timestamp) : String(e[col.key] ?? "");
        doc
          .font(mono ? "Courier" : "Helvetica")
          .fontSize(8)
          .fillColor("#111")
          .text(value, cx + 4, y + 6, { width: col.width - 8 });
      }
    });

    doc.strokeColor("#ddd").lineWidth(0.5);
    let vx = left;
    columns.forEach((col) => {
      doc.moveTo(vx, y).lineTo(vx, y + rowHeight).stroke();
      vx += col.width;
    });
    doc.moveTo(vx, y).lineTo(vx, y + rowHeight).stroke();
    doc.moveTo(left, y + rowHeight).lineTo(left + tableWidth, y + rowHeight).stroke();

    y += rowHeight;
  });
}

// Renders the exact set of entries the client already assembled (current
// page / a page range / everything — see ExportMenu.jsx) into a real PDF
// file streamed back as a download, rather than relying on the browser's
// print-to-PDF dialog.
app.post("/api/export-pdf", (req, res) => {
  const { title, filename, showSource, showService, entries } = req.body || {};
  if (!Array.isArray(entries)) {
    return res.status(400).json({ error: "entries muss ein Array sein." });
  }

  const safeTitle = String(title || "Log-Export");
  const safeFilename = String(filename || safeTitle);
  const asciiName = safeFilename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "") || "export";
  const encodedName = encodeURIComponent(safeFilename);

  const doc = new PDFDocument({ margin: 28, size: "A4", layout: "landscape" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiName}.pdf"; filename*=UTF-8''${encodedName}.pdf`
  );
  doc.pipe(res);
  drawEntriesTable(doc, entries, { title: safeTitle, showSource: !!showSource, showService: !!showService });
  doc.end();
});

app.get("/api/stats", (req, res) => {
  const { from, to, fromTime, toTime, source, service, level, search, exclude, excludeMode, pid, tid } = req.query;
  const files = getFilesInRange(from, to, source).filter((f) => !service || f.service === service);
  let entries = filterEntriesByDate(loadEntries(files), from, to, fromTime, toTime);
  entries = applyEntryFilters(entries, { level, pid, tid, search, exclude, excludeMode });

  const byDate = new Map();
  for (const f of files) {
    if (!f.date) continue; // undated file's entries land in buckets by their own date below
    if (!byDate.has(f.date)) {
      byDate.set(f.date, { date: f.date, Info: 0, Warning: 0, Error: 0, Debug: 0, Fatal: 0, total: 0 });
    }
  }
  for (const e of entries) {
    if (!byDate.has(e.date)) {
      byDate.set(e.date, { date: e.date, Info: 0, Warning: 0, Error: 0, Debug: 0, Fatal: 0, total: 0 });
    }
    const bucket = byDate.get(e.date);
    bucket[e.levelName] = (bucket[e.levelName] || 0) + 1;
    bucket.total += 1;
  }

  const result = Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  res.json(result);
});

// Rolling last-24h error summary + per-service breakdown, for the home page.
app.get("/api/summary", (req, res) => {
  const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();
  const sinceDate = sinceIso.slice(0, 10);

  const files = getFilesInRange(sinceDate, undefined);
  const entries = loadEntries(files);
  const recentErrors = entries.filter((e) => e.timestamp >= sinceIso && (e.level === "E" || e.level === "F"));

  const byService = new Map();
  for (const e of recentErrors) {
    const key = `${e.sourceId}::${e.service || ""}`;
    if (!byService.has(key)) {
      byService.set(key, { sourceId: e.sourceId, sourceName: e.sourceName, service: e.service || "(unbekannt)", count: 0 });
    }
    byService.get(key).count += 1;
  }

  res.json({
    totalErrorsLast24h: recentErrors.length,
    byService: Array.from(byService.values()).sort((a, b) => b.count - a.count),
    servers: servers.map(serverInfo),
  });
});

// SPA fallback: any non-API route serves the client's index.html so client-side
// navigation (and hard-reloading a deep link) works. Must stay last so it
// never shadows an /api route above.
if (CLIENT_BUILD_EXISTS) {
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Log-Viewer Server läuft auf http://localhost:${PORT}`);
  console.log(
    CLIENT_BUILD_EXISTS
      ? "  Frontend: Produktions-Build wird mit ausgeliefert (client/dist)"
      : "  Frontend: kein Produktions-Build gefunden (client/dist) — nur die API läuft"
  );
  for (const s of sources) {
    console.log(`  Quelle "${s.name}": ${s.path} (existiert: ${fs.existsSync(s.path)})`);
  }
  for (const s of servers) {
    console.log(`  Server "${s.name}": ${s.host} (${s.services.length} Service(s))`);
  }
});
