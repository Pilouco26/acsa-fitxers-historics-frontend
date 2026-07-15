# Generates locally-trusted TLS certs with mkcert for Docker nginx HTTPS.
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/setup-mkcert.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/setup-mkcert.ps1 -ExtraHosts 192.168.61.66,myhost.local
#
# Then: docker compose up -d --build
# Open: https://localhost:8443  or  https://<lan-ip>:8443

param(
  [string]$ExtraHosts = "",
  [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $OutDir) {
  $OutDir = Join-Path $Root "certs"
}

function Refresh-Path {
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
    [System.Environment]::GetEnvironmentVariable("Path", "User")
}

function Resolve-Mkcert {
  $cmd = Get-Command mkcert -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\mkcert.exe"),
    (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\FiloSottile.mkcert_Microsoft.Winget.Source_8wekyb3d8bbwe\mkcert.exe")
  )
  Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages") -Filter "mkcert.exe" -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 3 |
    ForEach-Object { $candidates += $_.FullName }

  foreach ($p in $candidates) {
    if ($p -and (Test-Path $p)) { return $p }
  }
  return $null
}

Write-Host "==> Ensuring mkcert is installed..."
Refresh-Path
$mkcertExe = Resolve-Mkcert
if (-not $mkcertExe) {
  Write-Host "    Installing FiloSottile.mkcert via winget (may prompt for elevation)..."
  winget install --id FiloSottile.mkcert -e --accept-package-agreements --accept-source-agreements
  Refresh-Path
  $mkcertExe = Resolve-Mkcert
  if (-not $mkcertExe) {
    throw "mkcert still not found. Close/reopen the terminal and re-run this script."
  }
}
Write-Host "    Using $mkcertExe"

Write-Host "==> Installing local CA into the trust store (mkcert -install)..."
& $mkcertExe -install
if ($LASTEXITCODE -ne 0) {
  throw "mkcert -install failed with exit code $LASTEXITCODE"
}

$hosts = New-Object System.Collections.Generic.List[string]
foreach ($h in @("localhost", "127.0.0.1", "::1")) {
  $hosts.Add($h)
}

# Host LAN IPv4 addresses (skip loopback / APIPA)
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object {
    $_.IPAddress -notlike "127.*" -and
    $_.IPAddress -notlike "169.254.*" -and
    $_.PrefixOrigin -ne "WellKnown"
  } |
  ForEach-Object { [void]$hosts.Add($_.IPAddress) }

if ($ExtraHosts) {
  foreach ($h in ($ExtraHosts -split "[,\s]+")) {
    if ($h) { [void]$hosts.Add($h.Trim()) }
  }
}

$unique = $hosts | Select-Object -Unique
Write-Host "==> Certificate SANs: $($unique -join ', ')"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$certFile = Join-Path $OutDir "cert.pem"
$keyFile = Join-Path $OutDir "key.pem"

& $mkcertExe -cert-file $certFile -key-file $keyFile @unique
if ($LASTEXITCODE -ne 0) {
  throw "mkcert failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "Wrote:"
Write-Host "  $certFile"
Write-Host "  $keyFile"
Write-Host ""
Write-Host "Next:"
Write-Host "  docker compose up -d --build"
Write-Host "  Open https://localhost:8443  (or https://<lan-ip>:8443)"
Write-Host ""
Write-Host "Verify in DevTools console:"
Write-Host "  window.isSecureContext     // true"
Write-Host "  typeof window.Translator   // 'object'"
Write-Host "Network → pdf.worker*.mjs → Content-Type: application/javascript"
