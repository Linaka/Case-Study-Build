[CmdletBinding()]
param(
  [string]$NodeVersion = "22.16.0",
  [string]$RuntimeDir = "",
  [string]$NodeDistBaseUrl = "https://nodejs.org/dist",
  [switch]$SkipBrowserInstall,
  [switch]$SkipPreflight
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Step {
  param([string]$Message)

  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-RepoRoot {
  $scriptRoot = $PSScriptRoot

  if ([string]::IsNullOrWhiteSpace($scriptRoot)) {
    $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
  }

  return (Resolve-Path (Join-Path $scriptRoot "..\..")).Path
}

function Get-NodeArch {
  $architecture = $env:PROCESSOR_ARCHITEW6432

  if ([string]::IsNullOrWhiteSpace($architecture)) {
    $architecture = $env:PROCESSOR_ARCHITECTURE
  }

  switch ($architecture) {
    "AMD64" { return "x64" }
    "ARM64" { return "arm64" }
    default {
      throw "Unsupported Windows CPU architecture '$architecture'. Use a 64-bit Intel/AMD or ARM64 Windows machine."
    }
  }
}

function Invoke-Native {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  & $FilePath @Arguments

  if ($LASTEXITCODE -ne 0) {
    $command = "$FilePath $($Arguments -join ' ')"
    throw "Command failed with exit code $LASTEXITCODE`: $command"
  }
}

$root = Get-RepoRoot

if ([string]::IsNullOrWhiteSpace($RuntimeDir)) {
  $RuntimeDir = Join-Path $root ".runtime"
}

$runtime = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($RuntimeDir)
$nodeHome = Join-Path $runtime "node"
$nodeExe = Join-Path $nodeHome "node.exe"
$npmCmd = Join-Path $nodeHome "npm.cmd"
$downloadDir = Join-Path $runtime "downloads"
$npmCache = Join-Path $runtime "npm-cache"
$browserDir = Join-Path $runtime "ms-playwright"

New-Item -ItemType Directory -Force -Path $runtime, $downloadDir, $npmCache, $browserDir | Out-Null

if (-not (Test-Path $nodeExe)) {
  $nodeArch = Get-NodeArch
  $versionTag = $NodeVersion

  if (-not $versionTag.StartsWith("v")) {
    $versionTag = "v$versionTag"
  }

  $zipName = "node-$versionTag-win-$nodeArch.zip"
  $zipPath = Join-Path $downloadDir $zipName
  $downloadUrl = "$NodeDistBaseUrl/$versionTag/$zipName"
  $extractDir = Join-Path $downloadDir "extract-$versionTag-$nodeArch"
  $expandedNodeDir = Join-Path $extractDir "node-$versionTag-win-$nodeArch"

  Write-Step "Downloading portable Node.js $versionTag for Windows $nodeArch"

  if (-not (Test-Path $zipPath)) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $request = @{
      Uri = $downloadUrl
      OutFile = $zipPath
    }

    if ($PSVersionTable.PSVersion.Major -lt 6) {
      $request.UseBasicParsing = $true
    }

    Invoke-WebRequest @request
  } else {
    Write-Host "Using cached download $zipPath"
  }

  Write-Step "Extracting Node.js into .runtime"

  if (Test-Path $extractDir) {
    Remove-Item -Recurse -Force $extractDir
  }

  Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

  if (-not (Test-Path $expandedNodeDir)) {
    throw "Downloaded Node.js archive did not contain $expandedNodeDir."
  }

  if (Test-Path $nodeHome) {
    Remove-Item -Recurse -Force $nodeHome
  }

  Move-Item -Path $expandedNodeDir -Destination $nodeHome
  Remove-Item -Recurse -Force $extractDir
} else {
  Write-Step "Using portable Node.js already installed in .runtime"
}

if (-not (Test-Path $npmCmd)) {
  throw "npm was not found at $npmCmd. Delete .runtime and run Install-Windows.cmd again."
}

$nodeVersionOutput = (& $nodeExe --version).Trim()
Write-Host "Node.js $nodeVersionOutput"

$env:Path = "$nodeHome;$env:Path"
$env:npm_config_cache = $npmCache
$env:npm_config_update_notifier = "false"
$env:npm_config_fund = "false"
$env:npm_config_audit = "false"
$env:PLAYWRIGHT_BROWSERS_PATH = $browserDir

Push-Location $root

try {
  Write-Step "Installing npm dependencies locally"

  if (Test-Path (Join-Path $root "package-lock.json")) {
    Invoke-Native $npmCmd @("ci", "--no-audit", "--no-fund")
  } else {
    Invoke-Native $npmCmd @("install", "--no-audit", "--no-fund")
  }

  if (-not $SkipBrowserInstall) {
    $playwrightCli = Join-Path $root "node_modules\playwright\cli.js"

    if (-not (Test-Path $playwrightCli)) {
      throw "Playwright CLI was not found after npm install. Expected $playwrightCli."
    }

    Write-Step "Installing Playwright Chromium locally"
    Invoke-Native $nodeExe @($playwrightCli, "install", "chromium")

    if (-not $SkipPreflight) {
      Write-Step "Checking the local browser renderer"
      Invoke-Native $nodeExe @((Join-Path $root "scripts\render-preflight.js"))
    }
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Portable Windows setup is ready." -ForegroundColor Green
Write-Host "Run Run-Windows.cmd to start the app."
