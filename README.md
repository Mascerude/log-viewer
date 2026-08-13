# Log Viewer

Webapp zum visuellen Anzeigen und Filtern von Logs aus Textdateien (ein
Dateiname pro Tag), mit mehreren benannten Log-Quellen (z.B. Servern),
Quelle→Service-Navigation, Auto-Refresh und einer Startseite mit
Fehlerübersicht (24h-Diagramm, konfigurierbare "Fehler pro Quelle"-Ampel,
letzte Fehler über alle Quellen). PDF-Exporte laufen als Hintergrund-Job
weiter, während man normal weiterarbeitet.

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
jeweils in einem eigenen PowerShell-Fenster mit Live-Ausgabe (Vite-Dev-Server,
mit Hot-Reload). Zum Beenden einfach die Fenster schließen.

### Produktions-Build (`deploy.ps1`)

```powershell
.\deploy.ps1
```

Installiert bei Bedarf die Abhängigkeiten, baut das Frontend als
Produktions-Build (`client/dist`) und startet danach den Server — der liefert
Frontend **und** Backend zusammen über einen einzigen Port aus
(http://localhost:4000), kein Vite-Dev-Server nötig. Läuft im aktuellen
Fenster im Vordergrund; zum Beenden Strg+C. Nach Frontend-Änderungen einfach
erneut ausführen, um den Build zu aktualisieren.

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

Quellen lassen sich außerdem zu **Gruppen** zusammenfassen (aufklappbar in
der Sidebar), und Gruppen können selbst wieder Mitglied einer anderen
Gruppe sein — beliebig tief verschachtelbar (mit Schutz vor zirkulären
Zuordnungen). Sowohl Quellen als auch Gruppen lassen sich per Drag & Drop
umsortieren. Eine Quelle kann ein **Ablaufdatum** bekommen — praktisch für
temporäre Einsätze, sie verschwindet danach automatisch (aus Sidebar,
Suche, allem) ohne Serverneustart. **Gruppen** können ebenfalls ein
Ablaufdatum bekommen; läuft eine Gruppe ab, werden alle darin enthaltenen
Quellen und Untergruppen automatisch mitgelöscht (nicht nur ausgruppiert
wie beim manuellen Löschen einer Gruppe). Optional lässt sich pro Quelle
und sogar pro einzelnem Service ein **eigenes** Aktualisierungsintervall
setzen, das den globalen Wert überschreibt (siehe unten,
"Automatische Aktualisierung") — die **Reload-Übersicht** (eigener
Sidebar-Punkt) zeigt für jede Quelle live, wann ihre Dateiliste als
Nächstes automatisch neu geladen wird, mit Fortschrittsanzeige und
manuellem Sofort-Reload-Button.

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
24 Stunden (Balkendiagramm pro Service, Klick auf einen Balken öffnet den
Service), sowie den Server-Status aller konfigurierten Server samt ihrer
Services.

Darunter zwei ausklappbare Abschnitte (klappen erst bei Bedarf auf, laden
also nicht ungefragt Daten nach):

- **Letzte Fehler** — die zuletzt aufgetretenen Fehler/Fatal-Einträge über
  alle Quellen hinweg, wählbare Anzahl (20/50/100/200/eigener Wert) —
  technisch dieselbe Tabelle wie in der Service-Ansicht, inkl. Sortierung,
  Mehrfachauswahl/Vergleich, Detailansicht und PDF-Export.
- **Fehler pro Quelle** — Fehleranzahl je Quelle über einen wählbaren
  Zeitraum (24h/48h/72h/1 Woche/eigene Stundenzahl), mit einer
  Ampel-Einfärbung der Zahl selbst (grün/gelb/rot). Die Schwellenwerte, ab
  wann gelb bzw. rot angezeigt wird, sind unter Einstellungen →
  "Fehler-Schwellenwerte" konfigurierbar (Standard: gelb ab 1, rot ab 10).

## Suche (globale Suche)

Eigener Sidebar-Punkt oberhalb von "Einstellungen": durchsucht **alle**
Quellen und Services auf einmal per Volltextsuche, ohne Zeitraumbegrenzung.
Wahlweise auf bestimmte Quellen und/oder Services einschränken (die
Auswahl-Chips brechen bei Platzmangel automatisch in eine neue Zeile um).
Heißt ein Service in mehreren Quellen gleich, wird der Quellenname in
Klammern ergänzt, damit die Auswahl eindeutig bleibt — die Filterung
selbst bleibt dabei exakt auf die jeweilige Quelle+Service-Kombination
beschränkt.

Services lassen sich nicht nur ein-, sondern auch **ausschließen**: ein
Umschalter ("Einschließen"/"Ausschließen") bestimmt, ob ein Klick auf einen
Service-Chip ihn in die Ergebnisse aufnimmt oder gezielt daraus entfernt —
praktisch, um z.B. einen bekannt lauten Service auszublenden, ohne alle
anderen einzeln auswählen zu müssen. Ein Service ist dabei immer nur
eingeschlossen, ausgeschlossen oder neutral, nie beides gleichzeitig.

Suchen (inkl. Filter, Quellen-/Service-Auswahl und Ausschlüsse) lassen sich
benannt **speichern** und in Ordnern organisieren, jederzeit wieder laden
und per Link teilen (`?savedSearch=<id>`); fehlt beim Laden eine
zwischenzeitlich gelöschte Quelle/ein gelöschter Service, warnt ein Hinweis
statt die Auswahl still zu verfälschen.

Sobald mindestens eine Quelle oder ein Service ausgewählt ist, werden auch
ohne Suchbegriff sofort alle deren Nachrichten angezeigt — nützlich, um
einfach nur den gesamten Verlauf einer Auswahl durchzublättern. Für das
Suchergebnis lässt sich zusätzlich ein eigenes Aktualisierungsintervall in
Sekunden setzen ("Auto-Aktualisierung"); es gilt nur für diese Suche und
wird nirgends gespeichert — beim Verlassen der Seite oder Neuladen ist es
wieder aus.

Über den Schalter "Filter anzeigen" lässt sich zusätzlich dieselbe
Filterleiste wie in der Service-Ansicht einblenden (Zeitraum inkl. Uhrzeit,
Level, PID, TID, Ausschließen) — ausgeblendet, bleibt die Suchseite
aufgeräumt; eingeblendet lässt sich die globale Suche genauso präzise
eingrenzen wie eine einzelne Service-Ansicht. Auch ein gesetzter Filter
allein (ganz ohne Suchbegriff oder Quellen-/Service-Auswahl) zeigt bereits
alle passenden Ergebnisse an.

## Service-Ansicht

Klick auf einen Service in der Sidebar öffnet dessen Log-Tabelle und
Tages-Diagramm (bidirektional synchron: Filter ändert das Diagramm, Klick
auf einen Balken setzt Tag & Level als Filter). Verfügbare Filter:

- **Zeitraum** inklusive Uhrzeit (von/bis), in einem gemeinsamen Popover
- **Level** (Debug/Info/Warning/Error/Fatal)
- **PID** / **TID**
- **Suche** (Volltext, enthält)
- **Ausschließen** — beliebig viele Begriffe als Chips, je nach Modus
  "Enthält" oder "Exakt"

Die Log-Tabelle:

- Spalten **Zeitstempel/PID/TID sortierbar** (auf-/absteigend)
- **Seitengröße** frei wählbar (20/50/100/200 oder eigener Wert)
- **"Gehe zu Seite"**-Feld, springt automatisch nach einer konfigurierbaren
  Pause ohne weitere Eingabe (Einstellungen → "Manuelle Seitenauswahl",
  bis zu 2 Nachkommastellen, Standard 1,5s)
- **Mehrfachauswahl** (Strg/Ctrl+Klick, bis zu 5 Einträge) zum
  Nebeneinander-Vergleichen aller Felder — zwei unabhängige Schalter im
  Vergleichsfenster: einer hebt abweichende Felder farblich hervor
  (Zeitstempel, Level, Quelle, Service, PID, TID, Datei, Nachricht,
  standardmäßig aktiv), der andere vergleicht die Nachrichtentexte
  wortweise miteinander und markiert genau die abweichenden Wörter
  (standardmäßig aus)
- **"Nachricht suchen"** je Eintrag: findet weitere Vorkommen derselben
  Nachricht (exakt oder "ähnlich" — Zahlen/IDs ignoriert), wahlweise
  beschränkt auf denselben Service, dieselbe Quelle oder global, inkl.
  24h/3-Tage/7-Tage/Gesamt-Zählung; Treffer lassen sich direkt vergleichen
- **Kopieren**: "Für Support-Ticket kopieren" (formatiert für Azure DevOps
  oder als Klartext) sowie ein eigener Button nur für die Nachricht
- **Als PDF exportieren**: aktuelle Seite, ein Seitenbereich oder alle
  Treffer — läuft als Hintergrund-Job (siehe unten), Tabelle bleibt
  sofort weiter bedienbar

Die Ansicht aktualisiert sich automatisch im konfigurierbaren Intervall und
lässt sich jederzeit manuell per Klick sofort neu laden. Das Intervall gilt
global (Einstellungen → "Automatische Aktualisierung", Standard 30s,
mindestens 1s, bis zu 2 Nachkommastellen), lässt sich aber pro Quelle und
sogar pro einzelnem Service überschreiben — Priorität: Service-Override >
Quellen-Override > globaler Wert.

## PDF-Export (Hintergrund-Job)

Ein Klick auf "Als PDF exportieren" (Service-Ansicht, Suche oder
"Nachricht suchen") startet einen **Job auf dem Server**, statt die
Oberfläche blockierend auf die fertige Datei warten zu lassen — beliebig
viele Exporte lassen sich gleichzeitig anstoßen, auch während man
weiterklickt oder die Seite wechselt. Ein Icon unten rechts zeigt einen
Fortschrittsring, solange mindestens ein Export läuft; Klick öffnet ein
Fenster mit allen Jobs:

- **Fortschrittsbalken** je Job (Dateien laden → filtern/sortieren →
  PDF erstellen)
- **Stoppen** eines laufenden Jobs, **Löschen** (räumt auch das
  Zwischenergebnis auf) und **Herunterladen** des fertigen PDFs
- Jobs überleben einen Seiten-Reload (laufen serverseitig weiter), aber
  nicht einen Server-Neustart
- Dateiname automatisch aus Quelle/Service/Levels/Zeitraum bzw. dem Namen
  der geladenen gespeicherten Suche zusammengesetzt, plus Zeitstempel des
  Exports (`Name_TT.MM.JJJJ_HH-MM.pdf`) — mehrere Exporte überschreiben
  sich beim Herunterladen also nie gegenseitig
- Fertige PDFs liegen serverseitig als Datei (nicht im Arbeitsspeicher) und
  werden automatisch aufgeräumt — sowohl beim Löschen eines Jobs als auch
  automatisch, sobald mehr als ~20 abgeschlossene Jobs angesammelt sind

## Features im Überblick

- Mehrere benannte Log-Quellen (Ordner), einzeln hinzufüg-/umbenenn-/
  entfernbar, per Drag & Drop sortierbar, zu (beliebig tief verschachtelbaren)
  Gruppen zusammenfassbar, optional mit Ablaufdatum (temporäre Quellen und
  Gruppen — bei Gruppen kaskadiert das Löschen auf den kompletten Inhalt)
- Reload-Übersicht: eigener Sidebar-Punkt, zeigt je Quelle das effektive
  Aktualisierungsintervall, einen Countdown/Fortschritt bis zum nächsten
  automatischen Neuladen der Dateiliste und einen Sofort-Reload-Button
- Eigenständige Server-Überwachung (Ping) mit beliebig vielen Services pro
  Server (`sc query`), komplett unabhängig von den Log-Quellen
- Sidebar-Navigation: Quelle → Service, direkt aus den vorhandenen
  Dateien abgeleitet, scrollbar und einklappbar
- Startseite: Fehler der letzten 24h gesamt + pro Service (Diagramm),
  Server-Status, sowie zwei ausklappbare Abschnitte — "Letzte Fehler"
  (wählbare Anzahl über alle Quellen) und "Fehler pro Quelle" (wählbarer
  Zeitraum, Ampel-Indikator mit konfigurierbaren Schwellenwerten)
- Globale Suche über alle Quellen/Services hinweg, mit Ein- **und**
  Ausschließen einzelner Services sowie automatischer
  Namens-Disambiguierung bei Kollisionen; zeigt bei reiner
  Quellen-/Service-Auswahl auch ohne Suchbegriff alle Nachrichten an, mit
  eigenem, nicht gespeichertem Aktualisierungsintervall für das Ergebnis;
  optional ein-/ausblendbare Filterleiste (Zeitraum, Level, PID, TID,
  Ausschließen) wie in der Service-Ansicht; Suchen lassen sich benannt
  speichern, in Ordnern organisieren und per Link teilen
- Modernes, für Light/Dark-Mode optimiertes Design
- Service-Ansicht: Tages-Diagramm (bidirektional mit Filtern synchron),
  Tabelle, Filter (Zeitraum inkl. Uhrzeit, Level, PID, TID, Suche,
  Ausschließen), sortierbare Spalten, wählbare Seitengröße,
  "Gehe zu Seite", automatische + manuelle Aktualisierung
- Automatisches Aktualisierungsintervall global, pro Quelle oder pro
  Service einstellbar (mit Fallback-Kette und Nachkommastellen)
- "Nachricht suchen": weitere Vorkommen derselben (oder ähnlichen)
  Nachricht finden, mit Zeitfenster-Statistik
- Mehrfachauswahl & Seite-an-Seite-Vergleich von bis zu 5 Log-Einträgen, mit
  optionaler farblicher Hervorhebung der abweichenden Felder sowie
  wortweisem Vergleich der Nachrichtentexte
- Kopieren für Support-Tickets (Azure DevOps-formatiert oder Klartext)
- PDF-Export der Log-Tabelle (aktuelle Seite/Bereich/alle Treffer) als
  Hintergrund-Job — mehrere gleichzeitig, Fortschritt/Stop/Download über
  ein globales Icon, übersteht einen Seiten-Reload
- Mehrzeilige Nachrichten (Stacktraces, Trace-Suspended-Footer) werden
  korrekt der zugehörigen Log-Zeile zugeordnet und farblich hervorgehoben
- UTF-16LE-Dateien (mit oder ohne BOM) werden automatisch erkannt
- Änderungen an den Log-Dateien werden automatisch erkannt (Cache
  invalidiert sich über Dateigröße/Änderungsdatum)

## Präsentation

`praesentation.html` ist eine eigenständige, offline lauffähige
Präsentation zur Vorstellung des Tools (mit echten Screenshots) — einfach
im Browser öffnen, mit Pfeiltasten/Leertaste/Klick durchblättern.
