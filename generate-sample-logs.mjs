import fs from "fs";
import path from "path";

const outDir = path.resolve("sample-logs");
fs.mkdirSync(outDir, { recursive: true });

const services = ["Polis Nachrichten Service"];
const infoMessages = [
  "Suche nach Nachrichten...",
  "Verbindung zur Datenbank hergestellt.",
  "Verarbeite Nachricht #{n}.",
  "Nachricht erfolgreich versendet.",
  "Heartbeat OK.",
  "Konfiguration neu geladen.",
];
const warnMessages = [
  "Verbindung langsam, Wiederholungsversuch.",
  "Cache-Eintrag abgelaufen.",
  "Ungewöhnlich hohe Antwortzeit: {n}ms.",
  "Warteschlange nähert sich dem Limit ({n} Einträge).",
];
const errorMessages = [
  "Fehler beim Senden der Nachricht an Empfänger {n}.",
  "Datenbankverbindung verloren.",
  "Timeout beim Abrufen der Konfiguration.",
  "Unbehandelte Ausnahme in Verarbeitungsschleife.",
  "Zugriff verweigert für Ressource #{n}.",
];

function pad(n, len = 2) {
  return String(n).padStart(len, "0");
}

function fmtDate(d) {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function fmtTime(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(
    d.getMilliseconds(),
    3
  )}`;
}
function fmtFileStamp(d) {
  return `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}-${pad(
    d.getMilliseconds(),
    3
  )}`;
}
function fmtFileDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildLine(level, d, pid, tid, message) {
  return `${level} ${fmtDate(d)} ${fmtTime(d)} P${pid} T${tid}                                          ${message}`;
}

const days = 14;
const today = new Date();

for (let i = days - 1; i >= 0; i--) {
  const day = new Date(today);
  day.setDate(today.getDate() - i);
  day.setHours(0, 0, 1, 0);

  const service = services[0];
  const pid = 10000 + Math.floor(Math.random() * 9000);
  const lines = [];

  const infoCount = 40 + Math.floor(Math.random() * 60);
  const warnCount = Math.floor(Math.random() * 8);
  // Trend: more errors on some days to make the chart interesting
  const errorCount = i % 5 === 0 ? 10 + Math.floor(Math.random() * 15) : Math.floor(Math.random() * 5);

  const events = [];
  for (let n = 0; n < infoCount; n++) events.push({ level: "I", msgs: infoMessages, n });
  for (let n = 0; n < warnCount; n++) events.push({ level: "W", msgs: warnMessages, n });
  for (let n = 0; n < errorCount; n++) events.push({ level: "E", msgs: errorMessages, n });
  events.sort(() => Math.random() - 0.5);

  let cursor = new Date(day);
  const tid = 5000 + Math.floor(Math.random() * 4000);

  for (const ev of events) {
    cursor = new Date(cursor.getTime() + Math.floor(Math.random() * 60000) + 500);
    const msg = pick(ev.msgs).replace("{n}", String(100 + Math.floor(Math.random() * 900)));
    lines.push(buildLine(ev.level, cursor, pid, tid, msg));

    if (ev.level === "E" && Math.random() < 0.4) {
      lines.push(
        `Computer: POLISSYSDB2 P:${pid} T:${tid} Source: ${service} - Trace suspended - changing Log History\tat: ${fmtDate(
          cursor
        )} ${fmtTime(cursor)}`
      );
    }
  }

  const fileName = `${service} - ${fmtFileDate(day)} ${fmtFileStamp(day)}.log`;
  fs.writeFileSync(path.join(outDir, fileName), lines.join("\n") + "\n", "utf-8");
  console.log(`Erstellt: ${fileName} (${lines.length} Zeilen)`);
}
