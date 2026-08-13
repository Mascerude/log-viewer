import { useEffect, useRef, useState } from "react";
import { getFiles } from "../api";
import { RefreshIcon } from "./icons";

// Same precedence as ServiceView.jsx's effectiveRefreshIntervalSeconds, minus
// the service level — this page is explicitly per-source.
function effectiveIntervalSeconds(source, globalRefreshIntervalSeconds) {
  return source.refreshIntervalSeconds ?? globalRefreshIntervalSeconds;
}

function ReloadRow({ source, fileCount, globalRefreshIntervalSeconds, now, state, onReloadNow }) {
  const intervalSeconds = effectiveIntervalSeconds(source, globalRefreshIntervalSeconds);
  const intervalMs = intervalSeconds * 1000;
  const elapsedMs = Math.max(0, now - state.lastReloadAt);
  const remainingSeconds = Math.max(0, Math.ceil((intervalMs - elapsedMs) / 1000));
  const hasOwnInterval = source.refreshIntervalSeconds != null;

  return (
    <div className="source-row reload-row">
      <div className="source-info">
        <span className="source-name">
          {source.name}
          {hasOwnInterval ? (
            <span className="refresh-badge" title="Eigenes Aktualisierungsintervall für diese Quelle">
              alle {intervalSeconds}s
            </span>
          ) : (
            <span className="refresh-badge refresh-badge-global" title="Globales Standard-Intervall (kein eigenes gesetzt)">
              alle {intervalSeconds}s (global)
            </span>
          )}
        </span>
        <code className="source-path">{source.path}</code>
        <span className="source-meta">
          {source.exists ? (
            <>
              {fileCount ?? 0} Datei{fileCount === 1 ? "" : "en"}
            </>
          ) : (
            <span className="warn-badge">Verzeichnis nicht gefunden</span>
          )}
          {" · zuletzt geladen um "}
          {new Date(state.lastReloadAt).toLocaleTimeString("de-DE")}
        </span>
      </div>

      <div className="reload-progress-area">
        <div className="reload-progress-track">
          <div
            className="reload-progress-fill"
            style={{ width: `${state.stages ? (state.stage / state.stages) * 100 : 0}%` }}
          />
        </div>
        <span className="reload-countdown">
          {state.reloading ? "wird geladen..." : `nächster Reload in ${remainingSeconds}s`}
        </span>
      </div>

      <div className="source-row-actions">
        <button type="button" onClick={() => onReloadNow(source.id)} disabled={state.reloading}>
          <RefreshIcon className={state.reloading ? "icon-spin" : undefined} /> Jetzt neu laden
        </button>
      </div>
    </div>
  );
}

// Per-source background reload cycle: each source gets its own clock running
// at its effective interval (own override, else the global default from
// Einstellungen — see effectiveIntervalSeconds above). When a source's timer
// elapses its file list is actually re-fetched (not just a visual
// countdown), and the result is reported up via onSourceReloaded so the rest
// of the app (sidebar file counts, etc.) sees the same fresh data.
export default function ReloadOverviewPage({ sources, fileCounts, refreshIntervalSeconds, onSourceReloaded }) {
  const [now, setNow] = useState(() => Date.now());
  const [reloadState, setReloadState] = useState({});
  const inFlightRef = useRef(new Set());

  // Seeds a fresh cycle (starting "now") for any source we don't have state
  // for yet — initial mount, or a source added while this page is open — and
  // drops state for sources removed while it was open.
  useEffect(() => {
    setReloadState((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const s of sources) {
        if (!next[s.id]) {
          next[s.id] = { lastReloadAt: Date.now(), reloading: false };
          changed = true;
        }
      }
      for (const id of Object.keys(next)) {
        if (!sources.some((s) => s.id === id)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [sources]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function reload(sourceId) {
    if (inFlightRef.current.has(sourceId)) return;
    inFlightRef.current.add(sourceId);

    // A file-list fetch is one request with no real per-file signal to
    // report — so progress here is a coarse, cosmetic step sequence sized to
    // how many files this source had last time (more files → more/finer
    // steps), not a measured percentage. It never claims to finish early:
    // the real fetch below is always what actually ends the cycle.
    const knownCount = fileCounts[sourceId] || 0;
    const stages = Math.max(3, Math.min(knownCount || 5, 20));
    let stage = 1;
    setReloadState((prev) => ({ ...prev, [sourceId]: { ...prev[sourceId], reloading: true, stage, stages } }));
    const stepTimer = setInterval(() => {
      if (stage >= stages - 1) return;
      stage += 1;
      setReloadState((prev) =>
        prev[sourceId]?.reloading ? { ...prev, [sourceId]: { ...prev[sourceId], stage } } : prev
      );
    }, 90);

    try {
      const sourceFiles = await getFiles({ source: sourceId });
      onSourceReloaded(sourceId, sourceFiles);
    } catch {
      // Still reset the cycle below even on failure (e.g. a missing folder)
      // so it retries next interval instead of getting stuck.
    } finally {
      clearInterval(stepTimer);
      inFlightRef.current.delete(sourceId);
      setReloadState((prev) => ({ ...prev, [sourceId]: { lastReloadAt: Date.now(), reloading: false } }));
    }
  }

  // Checked once per second (see the `now` ticker above) — any source whose
  // cycle has elapsed and isn't already reloading gets kicked off.
  useEffect(() => {
    for (const s of sources) {
      const state = reloadState[s.id];
      if (!state || state.reloading) continue;
      const intervalMs = effectiveIntervalSeconds(s, refreshIntervalSeconds) * 1000;
      if (now - state.lastReloadAt >= intervalMs) reload(s.id);
    }
    // Only `now` should drive this check — reload()/reloadState/sources are
    // read fresh from the closure each time it fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  return (
    <div className="home-page">
      <div className="chart-card">
        <div className="chart-header">
          <div>
            <h2>Reload-Übersicht</h2>
            <p className="chart-subtitle">
              Zeigt für jede Quelle, wann ihre Dateiliste als Nächstes automatisch neu geladen wird.
            </p>
          </div>
        </div>

        <div className="source-list">
          {sources.length === 0 && <p className="chart-subtitle">Noch keine Quelle konfiguriert.</p>}
          {sources.map((s) => (
            <ReloadRow
              key={s.id}
              source={s}
              fileCount={fileCounts[s.id]}
              globalRefreshIntervalSeconds={refreshIntervalSeconds}
              now={now}
              state={reloadState[s.id] || { lastReloadAt: now, reloading: false }}
              onReloadNow={reload}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
