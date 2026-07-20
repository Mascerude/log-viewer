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

export function addSource({ name, path, expiresAt, groupId }) {
  return send("POST", "/sources", { name, path, expiresAt, groupId });
}

export function updateSource(id, { name, path, expiresAt, groupId }) {
  return send("PUT", `/sources/${id}`, { name, path, expiresAt, groupId });
}

export function deleteSource(id) {
  return send("DELETE", `/sources/${id}`);
}

export function reorderSources(order) {
  return send("PUT", "/sources/reorder", { order });
}

export function getGroups() {
  return get("/groups");
}

export function addGroup({ name }) {
  return send("POST", "/groups", { name });
}

export function updateGroup(id, { name }) {
  return send("PUT", `/groups/${id}`, { name });
}

export function deleteGroup(id) {
  return send("DELETE", `/groups/${id}`);
}

export function reorderGroups(order) {
  return send("PUT", "/groups/reorder", { order });
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

export function reorderServers(order) {
  return send("PUT", "/servers/reorder", { order });
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

export function getMessageOccurrences({ message, scope, mode, sourceId, service, page, pageSize } = {}) {
  return get("/message-occurrences", { message, scope, mode, sourceId, service, page, pageSize });
}

export function getSettings() {
  return get("/settings");
}

export function updateSettings({ refreshIntervalSeconds }) {
  return send("PUT", "/settings", { refreshIntervalSeconds });
}
