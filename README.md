# Log Viewer

Webapp zum visuellen Anzeigen und Filtern von Logs aus Textdateien (ein
Dateiname pro Tag), mit mehreren benannten Log-Quellen (z.B. Servern),
Quelle→Service-Navigation, Auto-Refresh und einer Startseite mit
24h-Fehlerübersicht.

- `server/` — Node/Express-Backend, liest & parst die Log-Dateien aus den
  konfigurierten Quellen-Ordnern
- `client/` — React/Vite-Frontend mit Sidebar, Startseite, Service-Ansicht
  und Einstellungen

## Erwartetes Log-Format

Dateiname: `<Service> - <YYYY-MM-DD> <HH-MM-SS-mmm>.log`
(z.B. `Service - 2026-03-21 03-17-16-469.log`)

Zusätzlich wird pro Service eine **undatierte** Datei `<Service>.log` erkannt
(das aktuelle, noch nicht rotierte Log) und automatisch mit einbezogen —
ihre Einträge werden anhand des Zeitstempels in der jeweiligen Zeile den
richtigen Tagen zugeordnet, nicht anhand des Dateinamens.

Zeilen:

```
I 21.03.2026 10:42:43.265 P14748 T05880    Suche nach Nachrichten...
E 21.03.2026 10:42:44.100 P14748 T05880    Fehlernachricht
Computer: HOST P:123 T:456 Source: ... - Trace suspended	at: 21.03.2026 10:42:44.100
```

`I`/`W`/`E`/`D`/`F` = Info/Warning/Error/Debug/Fatal. Zeilen, die nicht dem
Muster entsprechen (z.B. die `Computer: ... at:`-Zeile), werden als
Fortsetzung der vorherigen Nachricht behandelt (mehrzeilige Nachrichten).

## Einrichtung

### Schnellstart (Windows/PowerShell)

```powershell
.\start.ps1
```

Installiert bei Bedarf die Abhängigkeiten und öffnet Backend und Frontend
jeweils in einem eigenen PowerShell-Fenster mit Live-Ausgabe. Zum Beenden
einfach die Fenster schließen.

### Manuell

#### 1. Backend

```bash
cd server
npm install
npm start
```

Beim ersten Start wird automatisch eine Quelle "Standard" angelegt, die auf
`../sample-logs` zeigt (oder auf `LOG_DIR` aus `server/.env`, falls gesetzt).
Weitere Quellen fügst du direkt in der Weboberfläche unter **⚙ Einstellungen**
hinzu — kein Neustart nötig.

#### 2. Frontend

```bash
cd client
npm install
npm run dev
```

Öffne die angezeigte URL (i.d.R. http://localhost:5173). Der Vite-Dev-Server
leitet `/api`-Anfragen automatisch an das Backend auf Port 4000 weiter.

## Beispiel-Logs

`generate-sample-logs.mjs` erzeugt 14 Tage Beispiel-Logs im Format des echten
Systems unter `sample-logs/`, zum Ausprobieren ohne echte Logs:

```bash
node generate-sample-logs.mjs
```

## Log-Quellen (⚙ Einstellungen)

Jede Quelle ist ein benannter Ordner mit Log-Textdateien. In den
Einstellungen kannst du Quellen hinzufügen, umbenennen, den Pfad ändern und
entfernen. Der Sidebar-Punkt neben einer Quelle zeigt, ob ihr Ordner gerade
erreichbar ist.

Der Pfad lässt sich über **"Durchsuchen..."** direkt per Windows-Explorer
auswählen, statt ihn von Hand einzutippen — öffnet den echten nativen
"Ordner auswählen"-Dialog (Adressleiste, Suche, Seitenleiste, wie der normale
Explorer), nicht den kleinen alten Ordner-Baum-Dialog. Nur Ordner sind
auswählbar, der Bestätigen-Button heißt "Ordner auswählen". Implementiert in
`server/browse-folder.ps1` über die Windows `IFileOpenDialog`-API. Funktioniert
nur, wenn Server und Browser auf derselben Windows-Maschine laufen (lokale
Nutzung).

Alle Quellen werden gemeinsam über die Sidebar navigierbar: pro Quelle
werden die darin gefundenen Services (aus den Dateinamen geparst) als
Unterpunkte aufgelistet.

## Server (⚙ Einstellungen)

Server sind eine **eigenständige, von den Log-Quellen komplett unabhängige**
Liste zur Infrastruktur-Überwachung:

- Ein Server hat Name + Host/IP. Erreichbarkeit wird alle 30 Sekunden per
  ICMP-Ping geprüft.
- Auf jedem Server können beliebig viele **Services** angelegt werden:
  Anzeigename + der technische **Windows-Dienstname** (z.B. `Spooler`,
  `WinDefend`, `MSSQLSERVER` — der Name aus `sc query`, nicht der Anzeigename
  aus der Dienste-Verwaltung). Geprüft wird via `sc query <Dienstname>`
  (lokal) bzw. `sc \\host query <Dienstname>` (remote); ein Service gilt als
  online, wenn der Status `RUNNING` ist. Nur unter Windows verfügbar.
- Server/Services haben keinerlei Bezug zu den Log-Quellen oder den daraus
  abgeleiteten Services in der Sidebar; ein Pfadproblem einer Log-Quelle
  wirkt sich nie auf den Server-Status aus (und umgekehrt).

## Startseite

Zeigt die Gesamtzahl aller Fehler/Fatal-Einträge der letzten rollierenden
24 Stunden (Balkendiagramm pro Service), sowie den Server-Status aller
konfigurierten Server samt ihrer Services.

## Service-Ansicht

Klick auf einen Service in der Sidebar öffnet dessen Log-Tabelle und
Tages-Diagramm, gefiltert nach Zeitraum, Level, Volltext, PID/TID. Die
Ansicht aktualisiert sich automatisch im konfigurierbaren Intervall
(Einstellungen → "Automatische Aktualisierung", Standard 30s) und lässt
sich jederzeit manuell per Klick sofort neu laden.

## Features im Überblick

- Mehrere benannte Log-Quellen (Ordner), einzeln hinzufüg-/umbenenn-/
  entfernbar
- Eigenständige Server-Überwachung (Ping) mit beliebig vielen Services pro
  Server (TCP-Port-Check), komplett unabhängig von den Log-Quellen
- Sidebar-Navigation: Quelle → Service, direkt aus den vorhandenen
  Dateien abgeleitet
- Startseite: Fehler der letzten 24h gesamt + pro Service, Server-Status
- Modernes, für Light/Dark-Mode optimiertes Design
- Service-Ansicht: Tages-Diagramm, Tabelle, Filter (Zeitraum, Level, Suche,
  PID, TID), automatische + manuelle Aktualisierung
- Mehrzeilige Nachrichten (Stacktraces, Trace-Suspended-Footer) werden
  korrekt der zugehörigen Log-Zeile zugeordnet
- Änderungen an den Log-Dateien werden automatisch erkannt (Cache
  invalidiert sich über Dateigröße/Änderungsdatum)
