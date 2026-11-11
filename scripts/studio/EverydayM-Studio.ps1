# EverydayM Studio — Lanzador local
# Inicia el servidor de desarrollo de Next.js con STUDIO_ENABLED=true y abre http://localhost:3000/admin cuando está listo.

$ErrorActionPreference = "Stop"

# Resolver la raíz del repositorio (dos niveles por encima de scripts/studio)
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $RepoRoot

$env:STUDIO_ENABLED = "true"
$StudioUrl = "http://localhost:3000/admin"

Write-Host "========================================" -ForegroundColor Green
Write-Host "  EverydayM Studio (Modo Local)" -ForegroundColor Green
Write-Host "  Repositorio: $RepoRoot" -ForegroundColor DarkGray
Write-Host "========================================" -ForegroundColor Green

# Lanzar un trabajo en segundo plano que espere a que el servidor responda y abra el navegador
Start-Job -ScriptBlock {
  param($Url)
  $maxAttempts = 60
  for ($i = 0; $i -lt $maxAttempts; $i++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        Start-Process $Url
        break
      }
    } catch {
      # Todavía arrancando
    }
    Start-Sleep -Seconds 1
  }
} -ArgumentList $StudioUrl | Out-Null

Write-Host "Arrancando servidor Next.js (npm run dev)... El navegador se abrirá automáticamente en $StudioUrl" -ForegroundColor Cyan
npm run dev
