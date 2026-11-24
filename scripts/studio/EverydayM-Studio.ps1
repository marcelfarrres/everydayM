# EverydayM Studio — Lanzador local (PC + móvil por WiFi)
# Inicia Next.js con STUDIO_ENABLED=true, escuchando en la red local, y abre http://localhost:3000/admin.
# El Studio pide siempre el PIN (también en el PC) y no abre sin STUDIO_LAN_PIN (6+ caracteres) y
# STUDIO_SESSION_SECRET (32+ caracteres) en .env.local. Con PIN, muestra también la dirección para el móvil.

$ErrorActionPreference = "Stop"

# Raíz del repositorio (dos niveles por encima de scripts/studio)
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $RepoRoot

$env:STUDIO_ENABLED = "true"
$Port = 3000
$StudioUrl = "http://localhost:$Port/admin"

# ¿Hay PIN? Sin él el Studio no abre (solo se comprueba que exista; nunca se muestra)
$LanPinConfigured = $false
$EnvFile = Join-Path $RepoRoot ".env.local"
if (Test-Path $EnvFile) {
  $LanPinConfigured = [bool](Select-String -Path $EnvFile -Pattern '^\s*STUDIO_LAN_PIN\s*=\s*\S{6,}' -Quiet)
}

# IPs privadas de este PC (WiFi / Ethernet)
$LanIps = @()
try {
  $LanIps = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
    Where-Object {
      $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)' -and
      $_.PrefixOrigin -ne 'WellKnown'
    } |
    Select-Object -ExpandProperty IPAddress
} catch {
  $LanIps = @()
}

Write-Host "========================================" -ForegroundColor Green
Write-Host "  EverydayM Studio" -ForegroundColor Green
Write-Host "  Repositorio: $RepoRoot" -ForegroundColor DarkGray
Write-Host "========================================" -ForegroundColor Green
Write-Host "  PC:    $StudioUrl" -ForegroundColor Cyan

if ($LanPinConfigured -and $LanIps.Count -gt 0) {
  foreach ($ip in $LanIps) {
    Write-Host "  MOVIL: http://${ip}:$Port/admin   (misma WiFi + PIN)" -ForegroundColor Yellow
  }
  Write-Host "  Si Windows pregunta por el Firewall, permite Node.js solo en 'Redes privadas'." -ForegroundColor DarkGray
} elseif (-not $LanPinConfigured) {
  Write-Host "  Falta STUDIO_LAN_PIN en .env.local: sin el, el Studio NO abre (tampoco en el PC)." -ForegroundColor Yellow
  Write-Host "  Anade STUDIO_LAN_PIN (min. 6 caracteres) y STUDIO_SESSION_SECRET (min. 32) y vuelve a lanzarlo." -ForegroundColor Yellow
}
if ($LanPinConfigured) {
  Write-Host "  El Studio pide el PIN siempre (tambien en el PC) y necesita STUDIO_SESSION_SECRET (min. 32 caracteres)." -ForegroundColor DarkGray
}
Write-Host "========================================" -ForegroundColor Green

# Abrir el navegador cuando el servidor responda
Start-Job -ScriptBlock {
  param($Url)
  for ($i = 0; $i -lt 60; $i++) {
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

# Escuchar en todas las interfaces (acceso desde el móvil) solo si hay PIN
if ($LanPinConfigured) {
  npm run dev -- -H 0.0.0.0 -p $Port
} else {
  npm run dev -- -H localhost -p $Port
}
