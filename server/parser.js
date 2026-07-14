import fs from "fs";
import path from "path";

// Filename pattern, e.g. "Service - 2026-03-21 03-17-16-469.log"
const FILENAME_RE =
  /^(?<service>.*?)\s*-\s*(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})\s+(?<hh>\d{2})-(?<mm>\d{2})-(?<ss>\d{2})-(?<ms>\d{3})\.log$/i;

// Each service also keeps one undated file (its current/active log before it
// gets rotated into a dated one), e.g. "Service.log".
const UNDATED_FILENAME_RE = /^(?<service>.+)\.log$/i;

// Log line, e.g. "I 21.03.2026 10:42:43.265 P14748 T05880    Suche nach Nachrichten..."
const LINE_RE =
  /^(?<level>[IEWDF])\s+(?<day>\d{2})\.(?<month>\d{2})\.(?<year>\d{4})\s+(?<hh>\d{2}):(?<mm>\d{2}):(?<ss>\d{2})\.(?<ms>\d{3})\s+P(?<pid>\d+)\s+T(?<tid>\d+)\s*(?<message>.*)$/;

const LEVEL_NAMES = {
  I: "Info",
  W: "Warning",
  E: "Error",
  D: "Debug",
  F: "Fatal",
};

export function parseFileName(fileName) {
  const dated = FILENAME_RE.exec(fileName);
  if (dated) {
    const { service, year, month, day, hh, mm, ss, ms } = dated.groups;
    return {
      service: service.trim(),
      date: `${year}-${month}-${day}`,
      createdAt: `${year}-${month}-${day}T${hh}:${mm}:${ss}.${ms}`,
    };
  }
  const undated = UNDATED_FILENAME_RE.exec(fileName);
  if (undated) {
    return { service: undated.groups.service.trim(), date: null, createdAt: null };
  }
  return null;
}

export function parseLogContent(content, fileName) {
  const lines = content.split(/\r\n|\n|\r/);
  const entries = [];
  let current = null;
  let seq = 0;

  for (const rawLine of lines) {
    const match = LINE_RE.exec(rawLine);
    if (match) {
      if (current) entries.push(current);
      const { level, day, month, year, hh, mm, ss, ms, pid, tid, message } =
        match.groups;
      const timestamp = `${year}-${month}-${day}T${hh}:${mm}:${ss}.${ms}`;
      current = {
        id: `${fileName}:${seq++}`,
        file: fileName,
        date: `${year}-${month}-${day}`,
        timestamp,
        level,
        levelName: LEVEL_NAMES[level] || level,
        pid,
        tid,
        message: message.trimEnd(),
      };
    } else if (current) {
      // Continuation of the previous (possibly multi-line) message
      const trimmed = rawLine.trimEnd();
      if (trimmed.length > 0) {
        current.message += "\n" + trimmed;
      }
    }
  }
  if (current) entries.push(current);
  return entries;
}

// mtimeMs+size keyed cache so files are only re-parsed after they change
const cache = new Map();

// Detects UTF-16LE, with or without a BOM. Many Windows trace loggers write
// UTF-16LE without ever emitting the FF FE BOM, so we also sniff for the
// "every other byte is 0x00" pattern that ASCII-range UTF-16LE text produces.
function isUtf16LE(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return true;
  const sampleLength = Math.min(buffer.length, 200);
  if (sampleLength < 4) return false;
  let zeroInOddPos = 0;
  for (let i = 1; i < sampleLength; i += 2) {
    if (buffer[i] === 0x00) zeroInOddPos++;
  }
  return zeroInOddPos / (sampleLength / 2) > 0.7;
}

function readLogFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (isUtf16LE(buffer)) {
    const hasBom = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe;
    return buffer.toString("utf16le", hasBom ? 2 : 0);
  }
  return buffer.toString("utf-8");
}

export function parseLogFile(filePath, fileName) {
  const stat = fs.statSync(filePath);
  const cacheKey = filePath;
  const cached = cache.get(cacheKey);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.entries;
  }
  const content = readLogFile(filePath);
  const entries = parseLogContent(content, fileName);
  cache.set(cacheKey, { mtimeMs: stat.mtimeMs, size: stat.size, entries });
  return entries;
}

export function listLogFiles(dir) {
  const names = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".log"));
  const files = [];
  for (const name of names) {
    const meta = parseFileName(name);
    const stat = fs.statSync(path.join(dir, name));
    files.push({
      fileName: name,
      service: meta?.service ?? null,
      date: meta?.date ?? null,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
    });
  }
  files.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return files;
}
