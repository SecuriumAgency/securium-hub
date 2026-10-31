# Redémarrage complet de l'infrastructure Securium (Docker Compose, dossier infra/). À utiliser en cas de blocage.
# Usage, depuis la racine du projet : .\reboot-infra.ps1
# docker compose down supprime les conteneurs et les réseaux, mais pas les volumes : les données sont conservées.

$ErrorActionPreference = "Stop"

Write-Host "Redémarrage complet de l'usine Securium (conteneurs et réseaux recréés, volumes conservés)..." -ForegroundColor Yellow

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker est introuvable. Installez Docker Desktop, lancez-le, puis relancez ce script." -ForegroundColor Red
    exit 1
}

Push-Location (Join-Path $PSScriptRoot "infra")
try {
    docker compose down
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Échec de docker compose down (code $LASTEXITCODE). Redémarrage annulé." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    docker compose up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Échec de docker compose up -d (code $LASTEXITCODE)." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    docker compose ps
}
finally {
    Pop-Location
}
