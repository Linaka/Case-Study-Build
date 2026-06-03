[CmdletBinding()]
param(
  [int]$Port = 3000,
  [string]$BindHost = "127.0.0.1",
  [string]$RuntimeDir = "",
  [switch]$NoInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot {
  $scriptRoot = $PSScriptRoot

  if ([string]::IsNullOrWhiteSpace($scriptRoot)) {
    $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
  }

  return (Resolve-Path (Join-Path $scriptRoot "..\..")).Path
}

function Invoke-Installer {
  param(
    [string]$InstallScript,
    [string]$RuntimeDir
  )

  $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $InstallScript)

  if (-not [string]::IsNullOrWhiteSpace($RuntimeDir)) {
    $arguments += @("-RuntimeDir", $RuntimeDir)
  }

  & powershell.exe @arguments

  if ($LASTEXITCODE -ne 0) {
    throw "Portable Windows setup failed with exit code $LASTEXITCODE."
  }
}

$root = Get-RepoRoot

if ([string]::IsNullOrWhiteSpace($RuntimeDir)) {
  $RuntimeDir = Join-Path $root ".runtime"
}

$runtime = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($RuntimeDir)
$nodeHome = Join-Path $runtime "node"
$nodeExe = Join-Path $nodeHome "node.exe"
$npmCache = Join-Path $runtime "npm-cache"
$browserDir = Join-Path $runtime "ms-playwright"
$installScript = Join-Path $root "scripts\windows\install.ps1"
$nodeModules = Join-Path $root "node_modules"

if ((-not (Test-Path $nodeExe)) -or (-not (Test-Path $nodeModules))) {
  if ($NoInstall) {
    throw "Portable runtime is missing. Run Install-Windows.cmd first, or run without -NoInstall."
  }

  Invoke-Installer -InstallScript $installScript -RuntimeDir $RuntimeDir
}

New-Item -ItemType Directory -Force -Path $npmCache, $browserDir | Out-Null

$env:Path = "$nodeHome;$env:Path"
$env:npm_config_cache = $npmCache
$env:npm_config_update_notifier = "false"
$env:npm_config_fund = "false"
$env:npm_config_audit = "false"
$env:PLAYWRIGHT_BROWSERS_PATH = $browserDir

if ([string]::IsNullOrWhiteSpace($env:HOST)) {
  $env:HOST = $BindHost
}

if ([string]::IsNullOrWhiteSpace($env:PORT)) {
  $env:PORT = [string]$Port
}

$browserHost = $env:HOST

if ($browserHost -eq "0.0.0.0") {
  $browserHost = "127.0.0.1"
}

$url = "http://$browserHost`:$($env:PORT)"

Write-Host ""
Write-Host "Starting Local-first case-study builder..." -ForegroundColor Cyan
Write-Host "Open $url"
Write-Host "Press Ctrl+C in this window to stop the app."
Write-Host ""

Push-Location $root

try {
  & $nodeExe (Join-Path $root "src\server.js")
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
