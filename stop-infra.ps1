# Extinction quotidienne de l'infrastructure Securium (Docker Compose, dossier infra/).
# Usage, depuis la racine du projet : .\stop-infra.ps1
# Arrête les conteneurs sans les supprimer : réseaux et volumes sont conservés.

$ErrorActionPreference = "Stop"

Write-Host "Extinction de l'usine Securium..." -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker est introuvable : aucun conteneur à arrêter." -ForegroundColor Red
    exit 1
}

Push-Location (Join-Path $PSScriptRoot "infra")
try {
    docker compose stop
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Échec de l'arrêt (code $LASTEXITCODE)." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    $running = @(docker compose ps --status running -q)
    if ($running.Count -gt 0) {
        Write-Host "Attention : $($running.Count) conteneur(s) encore actif(s)." -ForegroundColor Red
        exit 1
    }

    Write-Host "Usine arrêtée : aucun conteneur actif. Réseaux et volumes conservés." -ForegroundColor Green
}
finally {
    Pop-Location
}
