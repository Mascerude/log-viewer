import fs from "fs";
import path from "path";
import { listLogFiles } from "./parser.js";

// The tool's own error log — e.g. the "Skipping <file>" notices in
// parser.js, or an emergency-mode trigger — distinct from the log files
// under the user's configured sources, which are what the app displays/
// searches elsewhere. Only errors are kept (see Tool-Logs page); routine
// startup/info output isn't. Rotated to a new file every month so it never
// grows unbounded, same resolution convention as CONFIG_PATH in index.js
// (relative to the process's cwd).
const LOG_DIR = path.resolve("logs");
fs.mkdirSync(LOG_DIR, { recursive: true });

function pad(n, len = 2) {
  return String(n).padStart(len, "0");
}

function monthlyLogPath(date) {
  return path.join(LOG_DIR, `${date.getFullYear()}-${pad(date.getMonth() + 1)}.log`);
}

// Matches parser.js's LINE_RE ("I 21.03.2026 10:42:43.265 P14748 T05880
// message") so the existing log parsing/filtering/sorting pipeline
// (loadEntries/applyEntryFilters/sortEntries in index.js) can be reused as-is
// for the Tool-Logs page instead of duplicating it.
function formatLine(levelCode, message) {
  const d = new Date();
  const stamp = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  return `${levelCode} ${stamp} P${process.pid} T0    ${message}\n`;
}

function stringifyArg(arg) {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return arg.stack || arg.message;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

// Only errors are persisted (see Tool-Logs page) — console.log/info/warn
// keep going to the terminal only, same as before this feature existed.
export function installFileLogging() {
  const original = console.error.bind(console);
  console.error = (...args) => {
    original(...args);
    try {
      const message = args.map(stringifyArg).join(" ");
      fs.appendFileSync(monthlyLogPath(new Date()), formatLine("E", message));
    } catch {
      // Never let logging-to-disk itself take the app down.
    }
  };
}

// Exposes the monthly log files in the same shape listAllFiles() produces
// for a real source, so index.js's existing loadEntries/applyEntryFilters/
// sortEntries pipeline works on them unchanged (see /api/tool-logs).
export function listToolLogFiles() {
  if (!fs.existsSync(LOG_DIR)) return [];
  return listLogFiles(LOG_DIR).map((f) => ({
    ...f,
    service: "Tool",
    sourceId: "__tool__",
    sourceName: "Tool-Logs",
    fullPath: path.join(LOG_DIR, f.fileName),
  }));
}
