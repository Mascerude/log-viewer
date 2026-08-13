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

export function updateSource(id, { name, path, expiresAt, groupId, refreshIntervalSeconds }) {
  return send("PUT", `/sources/${id}`, { name, path, expiresAt, groupId, refreshIntervalSeconds });
}

export function deleteSource(id) {
  return send("DELETE", `/sources/${id}`);
}

export function reorderSources(order) {
  return send("PUT", "/sources/reorder", { order });
}

export function updateServiceRefreshInterval(sourceId, { service, refreshIntervalSeconds }) {
  return send("PUT", `/sources/${sourceId}/service-settings`, { service, refreshIntervalSeconds });
}

export function getGroups() {
  return get("/groups");
}

export function addGroup({ name, parentGroupId, expiresAt }) {
  return send("POST", "/groups", { name, parentGroupId, expiresAt });
}

export function updateGroup(id, { name, parentGroupId, expiresAt }) {
  return send("PUT", `/groups/${id}`, { name, parentGroupId, expiresAt });
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

export function getStats({
  from,
  to,
  fromTime,
  toTime,
  source,
  service,
  level,
  search,
  exclude,
  excludeMode,
  pid,
  tid,
} = {}) {
  return get("/stats", { from, to, fromTime, toTime, source, service, level, search, exclude, excludeMode, pid, tid });
}

export function getLogs({
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
  excludeServicePairs,
  sortBy,
  sortDir,
  page,
  pageSize,
} = {}) {
  return get("/logs", {
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
    excludeServicePairs,
    sortBy,
    sortDir,
    page,
    pageSize,
  });
}

export function getSummary() {
  return get("/summary");
}

export function getErrorCounts({ hours } = {}) {
  return get("/error-counts", { hours });
}

export function getMessageOccurrences({ message, scope, mode, sourceId, service, sortBy, sortDir, page, pageSize } = {}) {
  return get("/message-occurrences", { message, scope, mode, sourceId, service, sortBy, sortDir, page, pageSize });
}

export function getSavedSearchFolders() {
  return get("/saved-search-folders");
}

export function createSavedSearchFolder({ name }) {
  return send("POST", "/saved-search-folders", { name });
}

export function deleteSavedSearchFolder(id) {
  return send("DELETE", `/saved-search-folders/${id}`);
}

export function getSavedSearches() {
  return get("/saved-searches");
}

export function getSavedSearch(id) {
  return get(`/saved-searches/${id}`);
}

export function createSavedSearch({
  name,
  folderId,
  query,
  sources,
  services,
  excludedServices,
  filters,
  refreshIntervalSeconds,
}) {
  return send("POST", "/saved-searches", {
    name,
    folderId,
    query,
    sources,
    services,
    excludedServices,
    filters,
    refreshIntervalSeconds,
  });
}

export function updateSavedSearch(
  id,
  { name, folderId, query, sources, services, excludedServices, filters, refreshIntervalSeconds }
) {
  return send("PUT", `/saved-searches/${id}`, {
    name,
    folderId,
    query,
    sources,
    services,
    excludedServices,
    filters,
    refreshIntervalSeconds,
  });
}

export function deleteSavedSearch(id) {
  return send("DELETE", `/saved-searches/${id}`);
}

export function getSettings() {
  return get("/settings");
}

export function updateSettings({
  refreshIntervalSeconds,
  goToPageDelaySeconds,
  errorWarningThreshold,
  errorCriticalThreshold,
}) {
  return send("PUT", "/settings", {
    refreshIntervalSeconds,
    goToPageDelaySeconds,
    errorWarningThreshold,
    errorCriticalThreshold,
  });
}

export function createPdfJob(payload) {
  return send("POST", "/pdf-jobs", payload);
}

export function getPdfJobs() {
  return get("/pdf-jobs");
}

export function stopPdfJob(id) {
  return send("POST", `/pdf-jobs/${id}/stop`);
}

export function deletePdfJob(id) {
  return send("DELETE", `/pdf-jobs/${id}`);
}

export function pdfJobDownloadUrl(id) {
  return `/api/pdf-jobs/${id}/download`;
}
