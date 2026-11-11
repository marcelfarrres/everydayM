# EverydayM Studio — Instalador de acceso directo en el Escritorio
# Crea "EverydayM Studio.lnk" en el Escritorio del usuario apuntando a scripts/studio/EverydayM-Studio.ps1.

$ErrorActionPreference = "Stop"

$LauncherScript = (Resolve-Path (Join-Path $PSScriptRoot "EverydayM-Studio.ps1")).Path
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "EverydayM Studio.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-NoExit -ExecutionPolicy Bypass -File `"$LauncherScript`""
$Shortcut.WorkingDirectory = $RepoRoot
$Shortcut.Description = "EverydayM Studio — Panel local de ingesta y compresión de vídeos"
$Shortcut.Save()

Write-Host "Acceso directo creado correctamente en: $ShortcutPath" -ForegroundColor Green
