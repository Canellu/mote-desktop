[CmdletBinding()]
param(
    # Install the installer already built for this version instead of building.
    [switch]$SkipBuild
)

# Builds and installs the owner's personal copy of Mote: a debug-profile NSIS
# installer, which opens on Pro when MOTE_DEBUG_PRO is set in .env.local.
# Release and Store builds ignore that variable, so this never touches what
# ships. See docs/releasing.md, "Personal Pro install".

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$tauriConfig = Get-Content -LiteralPath (Join-Path $repoRoot "src-tauri/tauri.conf.json") -Raw |
    ConvertFrom-Json
$version = $tauriConfig.version
$installer = Join-Path $repoRoot "src-tauri/target/debug/bundle/nsis/Mote Desktop_${version}_x64-setup.exe"
$installed = Join-Path $env:LOCALAPPDATA "Mote Desktop/mote-desktop.exe"

if (-not $SkipBuild) {
    Push-Location $repoRoot
    try {
        & bun tauri build --debug --bundles nsis
        if ($LASTEXITCODE -ne 0) {
            throw "The personal build failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

if (-not (Test-Path -LiteralPath $installer)) {
    throw "No installer for $version at '$installer'. Run without -SkipBuild."
}

# The installer cannot replace a running executable.
Get-Process -Name "mote-desktop" -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $installed } |
    ForEach-Object {
        $_ | Stop-Process -Force
        $_ | Wait-Process -Timeout 15 -ErrorAction SilentlyContinue
    }

# /S installs silently over the existing copy. Settings and the bridge pairing
# live in %APPDATA%\com.motedesktop.mote and the keyring, which it leaves alone.
$process = Start-Process -FilePath $installer -ArgumentList "/S" -Wait -PassThru
if ($process.ExitCode -ne 0) {
    throw "The installer exited with code $($process.ExitCode)."
}

Start-Process -FilePath $installed
Write-Host "Installed and started Mote Desktop $version (personal Pro build)."
