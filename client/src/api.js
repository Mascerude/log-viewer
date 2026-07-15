async function get(url, params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, value);
    }
  }
  const query = search.toString();
  const res = await fetch(`/api${url}${query ? `?${query}` : ""}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Anfrage fehlgeschlagen (${res.status})`);
  }
  return res.json();
}

async function send(method, url, payload) {
  const res = await fetch(`/api${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Anfrage fehlgeschlagen (${res.status})`);
  }
  return body;
}

export function getSources() {
  return get("/sources");
}

export function addSource({ name, path }) {
  return send("POST", "/sources", { name, path });
}

export function updateSource(id, { name, path }) {
  return send("PUT", `/sources/${id}`, { name, path });
}

export function deleteSource(id) {
  return send("DELETE", `/sources/${id}`);
}

export function browseFolder() {
  return get("/browse-folder");
}

export function getServers() {
  return get("/servers");
}

export function addServer({ name, host }) {
  return send("POST", "/servers", { name, host });
}

export function updateServer(id, { name, host }) {
  return send("PUT", `/servers/${id}`, { name, host });
}

export function deleteServer(id) {
  return send("DELETE", `/servers/${id}`);
}

export function addService(serverId, { name, serviceName }) {
  return send("POST", `/servers/${serverId}/services`, { name, serviceName });
}

export function updateService(serverId, serviceId, { name, serviceName }) {
  return send("PUT", `/servers/${serverId}/services/${serviceId}`, { name, serviceName });
}

export function deleteService(serverId, serviceId) {
  return send("DELETE", `/servers/${serverId}/services/${serviceId}`);
}

export function getFiles({ source } = {}) {
  return get("/files", { source });
}

export function getStats({ from, to, source, service, level, search, pid, tid } = {}) {
  return get("/stats", { from, to, source, service, level, search, pid, tid });
}

export function getLogs({ from, to, level, search, pid, tid, service, source, page, pageSize } = {}) {
  return get("/logs", { from, to, level, search, pid, tid, service, source, page, pageSize });
}

export function getSummary() {
  return get("/summary");
}

export function getSettings() {
  return get("/settings");
}

export function updateSettings({ refreshIntervalSeconds }) {
  return send("PUT", "/settings", { refreshIntervalSeconds });
}
