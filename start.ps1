# Startet Backend und Frontend des Log Viewers, jeweils in einem eigenen
# PowerShell-Fenster mit Live-Ausgabe. Zum Beenden einfach die Fenster schließen.

$ErrorActionPreference = "Stop"

# Node.js sicherstellen (auf manchen Systemen nicht im PATH)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $fallback = "C:\Program Files\nodejs"
    if (Test-Path "$fallback\node.exe") {
        $env:Path = "$fallback;$env:Path"
    } else {
        Write-Error "Node.js wurde nicht gefunden. Bitte installieren oder zum PATH hinzufügen."
        exit 1
    }
}

$root = $PSScriptRoot
$serverDir = Join-Path $root "server"
$clientDir = Join-Path $root "client"

foreach ($dir in @($serverDir, $clientDir)) {
    if (-not (Test-Path (Join-Path $dir "node_modules"))) {
        Write-Host "Installiere Abhängigkeiten in $dir ..."
        Push-Location $dir
        npm install
        Pop-Location
    }
}

Write-Host "Starte Backend (http://localhost:4000) in neuem Fenster..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$serverDir'; npm run dev"

Write-Host "Starte Frontend (http://localhost:5173) in neuem Fenster..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$clientDir'; npm run dev"

Write-Host ""
Write-Host "Beide Fenster wurden gestartet."
Write-Host "  Backend:  http://localhost:4000"
Write-Host "  Frontend: http://localhost:5173"
Write-Host "Zum Beenden einfach die jeweiligen Fenster schließen."
