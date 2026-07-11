# Baut das Frontend als Produktions-Build und startet den Server, der
# Frontend und Backend zusammen auf einem einzigen Port ausliefert
# (http://localhost:4000) - kein zweites Fenster, kein Vite-Dev-Server nötig.
# Läuft im aktuellen Fenster im Vordergrund; zum Beenden Strg+C.

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

Write-Host "Baue Frontend (Produktions-Build)..."
Push-Location $clientDir
npm run build
Pop-Location

Write-Host ""
Write-Host "Starte Server (liefert Frontend + Backend zusammen aus)..."
Write-Host "  http://localhost:4000"
Write-Host "Zum Beenden: Strg+C"
Write-Host ""

Push-Location $serverDir
try {
    npm start
} finally {
    Pop-Location
}
