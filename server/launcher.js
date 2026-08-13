// V8's heap limit (--max-old-space-size) can only be set when the process
// starts — there's no API to resize it on a running process. So instead of
// hardcoding it in package.json, this tiny launcher reads the configured
// value from config.json (the same file/field the Server-Diagnose page's
// "Max. Heap-Größe" setting writes to — see PUT /api/settings in index.js)
// and re-execs node with it as a flag, before the real server starts. A
// value saved through the UI only takes effect on the next restart, since
// by definition it can't apply to the process that's already running.
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const DEFAULT_MAX_HEAP_MB = 6144;
const MIN_MAX_HEAP_MB = 512;

function readMaxHeapMB() {
  try {
    const raw = fs.readFileSync(path.resolve("config.json"), "utf-8");
    const parsed = JSON.parse(raw);
    if (Number.isFinite(parsed.maxHeapMB) && parsed.maxHeapMB >= MIN_MAX_HEAP_MB) {
      return Math.round(parsed.maxHeapMB);
    }
  } catch {
    // no config.json yet, or unreadable — fall back to the default below
  }
  return DEFAULT_MAX_HEAP_MB;
}

const maxHeapMB = readMaxHeapMB();
// Anything the npm script itself was given (e.g. --watch for `npm run dev`)
// is forwarded straight through to the real server process.
const extraArgs = process.argv.slice(2);

const child = spawn(
  process.execPath,
  ["--expose-gc", `--max-old-space-size=${maxHeapMB}`, ...extraArgs, "index.js"],
  { stdio: "inherit" }
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
