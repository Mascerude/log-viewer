import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { execFile } from "child_process";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { listLogFiles, parseLogFile } from "./parser.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const CONFIG_PATH = path.resolve("config.json");
const DEFAULT_REFRESH_SECONDS = 30;
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
      servers: Array.isArray(parsed.servers) ? parsed.servers : null,
      refreshIntervalSeconds:
        typeof parsed.refreshIntervalSeconds === "number" ? parsed.refreshIntervalSeconds : null,
    };
  } catch {
    // no config.json yet, or unreadable — fall through to defaults
  }
  return { sources: null, servers: null, refreshIntervalSeconds: null };
}

function saveConfig() {
  fs.writeFileSync(
    CONFIG_PATH,
    JSON.stringify({ sources, servers, refreshIntervalSeconds }, null, 2),
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
let servers = loaded.servers || [];
for (const s of servers) if (!Array.isArray(s.services)) s.services = [];
let refreshIntervalSeconds = loaded.refreshIntervalSeconds || DEFAULT_REFRESH_SECONDS;
saveConfig();

function sourceInfo(s) {
  return { id: s.id, name: s.name, path: s.path, exists: fs.existsSync(s.path) };
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

function filterEntriesByDate(entries, from, to) {
  return entries.filter((e) => (!from || e.date >= from) && (!to || e.date <= to));
}

// Shared by /api/logs and /api/stats so the chart always reflects the same
// level/search/pid/tid filters as the table.
function applyEntryFilters(entries, { level, pid, tid, search } = {}) {
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
  return result;
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

// ---- Sources (named log folders) ----

app.get("/api/sources", (req, res) => {
  res.json(sources.map(sourceInfo));
});

app.post("/api/sources", (req, res) => {
  const { name, path: rawPath } = req.body || {};
  if (!name || !name.trim() || !rawPath || !rawPath.trim()) {
    return res.status(400).json({ error: "Name und Pfad sind erforderlich." });
  }
  const source = { id: crypto.randomUUID(), name: name.trim(), path: path.resolve(rawPath.trim()) };
  sources.push(source);
  saveConfig();
  res.status(201).json(sourceInfo(source));
});

app.put("/api/sources/:id", (req, res) => {
  const source = sources.find((s) => s.id === req.params.id);
  if (!source) return res.status(404).json({ error: "Quelle nicht gefunden." });
  const body = req.body || {};
  if (body.name && body.name.trim()) source.name = body.name.trim();
  if (body.path && body.path.trim()) source.path = path.resolve(body.path.trim());
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
  res.json({ refreshIntervalSeconds });
});

app.put("/api/settings", (req, res) => {
  const { refreshIntervalSeconds: value } = req.body || {};
  if (!Number.isFinite(value) || value < 5) {
    return res.status(400).json({ error: "Das Intervall muss mindestens 5 Sekunden betragen." });
  }
  refreshIntervalSeconds = Math.round(value);
  saveConfig();
  res.json({ refreshIntervalSeconds });
});

// ---- Log data ----

app.get("/api/files", (req, res) => {
  res.json(listAllFiles(req.query.source));
});

app.get("/api/logs", (req, res) => {
  const {
    from,
    to,
    level,
    search,
    pid,
    tid,
    service,
    source,
    page = "1",
    pageSize = "200",
  } = req.query;

  const files = getFilesInRange(from, to, source).filter((f) => !service || f.service === service);
  let entries = filterEntriesByDate(loadEntries(files), from, to);
  entries = applyEntryFilters(entries, { level, pid, tid, search });

  entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));

  const total = entries.length;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.min(1000, Math.max(1, parseInt(pageSize, 10) || 200));
  const start = (pageNum - 1) * size;
  const pageEntries = entries.slice(start, start + size);

  res.json({ entries: pageEntries, total, page: pageNum, pageSize: size });
});

app.get("/api/stats", (req, res) => {
  const { from, to, source, service, level, search, pid, tid } = req.query;
  const files = getFilesInRange(from, to, source).filter((f) => !service || f.service === service);
  let entries = filterEntriesByDate(loadEntries(files), from, to);
  entries = applyEntryFilters(entries, { level, pid, tid, search });

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
