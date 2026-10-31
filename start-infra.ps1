# Allumage quotidien de l'infrastructure Securium (Docker Compose, dossier infra/).
# Usage, depuis la racine du projet : .\start-infra.ps1
# Rallume les conteneurs existants sans les recréer. Si le démarrage échoue ou qu'aucun conteneur n'est actif,
# lance docker compose up -d.

$ErrorActionPreference = "Stop"

Write-Host "Démarrage de l'usine Securium..." -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker est introuvable. Installez Docker Desktop, lancez-le, puis relancez ce script." -ForegroundColor Red
    exit 1
}

Push-Location (Join-Path $PSScriptRoot "infra")
try {
    docker compose start
    $startCode = $LASTEXITCODE

    $running = @(docker compose ps --status running -q)
    if ($startCode -ne 0 -or $running.Count -eq 0) {
        Write-Host "Démarrage direct impossible ou aucun conteneur actif : création avec docker compose up -d..." -ForegroundColor Yellow
        docker compose up -d
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Échec du démarrage (code $LASTEXITCODE)." -ForegroundColor Red
            exit $LASTEXITCODE
        }
    }

    Write-Host "Conteneurs de l'usine :" -ForegroundColor Green
    docker compose ps
}
finally {
    Pop-Location
}
