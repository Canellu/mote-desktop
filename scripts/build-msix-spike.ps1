[CmdletBinding()]
param(
    [string]$IdentityName = "AntonVo.MoteDesktop",
    [string]$Publisher = "CN=44112F90-AF39-497A-AE42-3BEEBE2299A7",
    [string]$PublisherDisplayName = "Anton Vo",
    [string]$Version,
    [ValidateSet("x64")]
    [string]$Architecture = "x64",
    [switch]$SkipBuild,
    [switch]$IncludeCommerceDiagnostic,
    [switch]$Sign
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$tauriRoot = Join-Path $repoRoot "src-tauri"
$tauriConfigPath = Join-Path $tauriRoot "tauri.conf.json"
$templatePath = Join-Path $tauriRoot "msix/AppxManifest.xml.template"
$targetRoot = Join-Path $tauriRoot "target/msix-spike"
$stageRoot = Join-Path $targetRoot "stage"
$executablePath = Join-Path $tauriRoot "target/release/mote-desktop.exe"
$commerceDiagnosticPath = Join-Path $tauriRoot "target/release/examples/store_commerce_spike.exe"
$sdkBinRoot = "C:\Program Files (x86)\Windows Kits\10\bin"

if (-not $Version) {
    $tauriConfig = Get-Content -LiteralPath $tauriConfigPath -Raw | ConvertFrom-Json
    $parts = @($tauriConfig.version -split "\.")
    if ($parts.Count -ne 3 -or $parts.Where({ $_ -notmatch '^\d+$' }).Count -gt 0) {
        throw "Tauri version '$($tauriConfig.version)' is not a three-part numeric version. Pass -Version explicitly."
    }
    $Version = "$($parts[0]).$($parts[1]).$($parts[2]).0"
}

if ($Version -notmatch '^\d+\.\d+\.\d+\.\d+$') {
    throw "MSIX version '$Version' must contain four numeric parts."
}

if ($IdentityName -notmatch '^[A-Za-z0-9.-]{3,50}$') {
    throw "IdentityName must be 3-50 characters and contain only letters, digits, periods, or hyphens."
}

$sdkTools = Get-ChildItem -LiteralPath $sdkBinRoot -Directory -ErrorAction Stop |
    Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
    Sort-Object { [version]$_.Name } -Descending |
    ForEach-Object {
        $candidate = Join-Path $_.FullName "$Architecture/makeappx.exe"
        $signCandidate = Join-Path $_.FullName "$Architecture/signtool.exe"
        if ((Test-Path -LiteralPath $candidate) -and (Test-Path -LiteralPath $signCandidate)) {
            [pscustomobject]@{ MakeAppx = $candidate; SignTool = $signCandidate; Version = $_.Name }
        }
    } |
    Select-Object -First 1

if (-not $sdkTools) {
    throw "makeappx.exe and signtool.exe were not found under '$sdkBinRoot'."
}

if (-not $SkipBuild) {
    & bun tauri build --no-bundle
    if ($LASTEXITCODE -ne 0) {
        throw "Tauri release build failed with exit code $LASTEXITCODE."
    }
    if ($IncludeCommerceDiagnostic) {
        Push-Location $tauriRoot
        try {
            & cargo build --release --example store_commerce_spike
            if ($LASTEXITCODE -ne 0) {
                throw "Store commerce diagnostic build failed with exit code $LASTEXITCODE."
            }
        }
        finally {
            Pop-Location
        }
    }
}

if (-not (Test-Path -LiteralPath $executablePath)) {
    throw "Release executable not found at '$executablePath'. Run without -SkipBuild first."
}
if ($IncludeCommerceDiagnostic -and -not (Test-Path -LiteralPath $commerceDiagnosticPath)) {
    throw "Store commerce diagnostic not found at '$commerceDiagnosticPath'. Run without -SkipBuild first."
}

$resolvedTarget = [System.IO.Path]::GetFullPath($targetRoot)
$resolvedStage = [System.IO.Path]::GetFullPath($stageRoot)
if (-not $resolvedStage.StartsWith($resolvedTarget + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clear staging path outside the MSIX spike target."
}

if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path (Join-Path $stageRoot "Assets") -Force | Out-Null

Copy-Item -LiteralPath $executablePath -Destination (Join-Path $stageRoot "mote-desktop.exe")
if ($IncludeCommerceDiagnostic) {
    Copy-Item -LiteralPath $commerceDiagnosticPath -Destination (Join-Path $stageRoot "store-commerce-spike.exe")
}
$assetNames = @("StoreLogo.png", "Square44x44Logo.png", "Square150x150Logo.png")
foreach ($assetName in $assetNames) {
    Copy-Item -LiteralPath (Join-Path $tauriRoot "icons/$assetName") -Destination (Join-Path $stageRoot "Assets/$assetName")
}

$manifest = Get-Content -LiteralPath $templatePath -Raw
$manifest = $manifest.Replace("{{IDENTITY_NAME}}", [System.Security.SecurityElement]::Escape($IdentityName))
$manifest = $manifest.Replace("{{PUBLISHER}}", [System.Security.SecurityElement]::Escape($Publisher))
$manifest = $manifest.Replace("{{PUBLISHER_DISPLAY_NAME}}", [System.Security.SecurityElement]::Escape($PublisherDisplayName))
$manifest = $manifest.Replace("{{VERSION}}", [System.Security.SecurityElement]::Escape($Version))
$manifest = $manifest.Replace("{{ARCHITECTURE}}", [System.Security.SecurityElement]::Escape($Architecture))
$manifestPath = Join-Path $stageRoot "AppxManifest.xml"
[System.IO.File]::WriteAllText($manifestPath, $manifest, [System.Text.UTF8Encoding]::new($false))

# Parse before packaging so malformed substitutions fail with a useful error.
$null = [xml](Get-Content -LiteralPath $manifestPath -Raw)

New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
$packagePath = Join-Path $targetRoot "MoteDesktop_${Version}_${Architecture}.msix"
& $sdkTools.MakeAppx pack /d $stageRoot /p $packagePath /o
if ($LASTEXITCODE -ne 0) {
    throw "MakeAppx failed with exit code $LASTEXITCODE."
}

$certificatePath = $null
$signatureVerification = "unsigned"
if ($Sign) {
    $certificate = $null
    try {
        $certificate = New-SelfSignedCertificate `
            -Type Custom `
            -KeyUsage DigitalSignature `
            -Subject $Publisher `
            -CertStoreLocation "Cert:\CurrentUser\My" `
            -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}") `
            -FriendlyName "Mote Desktop MSIX spike (temporary)"

        $certificatePath = Join-Path $targetRoot "MoteDesktop-msix-spike.cer"
        Export-Certificate -Cert $certificate -FilePath $certificatePath -Force | Out-Null
        & $sdkTools.SignTool sign /fd SHA256 /sha1 $certificate.Thumbprint /s My $packagePath
        if ($LASTEXITCODE -ne 0) {
            throw "SignTool failed with exit code $LASTEXITCODE."
        }

        $signature = Get-AuthenticodeSignature -LiteralPath $packagePath
        if (-not $signature.SignerCertificate -or $signature.SignerCertificate.Subject -ne $Publisher) {
            throw "The signed package does not contain the expected publisher certificate."
        }
        if ($signature.Status -eq [System.Management.Automation.SignatureStatus]::HashMismatch) {
            throw "The signed package failed its content hash verification."
        }
        if ($signature.Status -eq [System.Management.Automation.SignatureStatus]::Valid) {
            $signatureVerification = "valid-and-trusted"
        }
        elseif (
            $signature.Status -eq [System.Management.Automation.SignatureStatus]::UnknownError -and
            $signature.StatusMessage -match 'not trusted by the trust provider'
        ) {
            $signatureVerification = "signed-and-hash-valid; temporary certificate intentionally untrusted"
        }
        else {
            throw "Unexpected signature verification result: $($signature.Status) — $($signature.StatusMessage)"
        }
    }
    finally {
        if ($certificate) {
            Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($certificate.Thumbprint)" -Force
        }
    }
}

$packageHash = (Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash
$executableHash = (Get-FileHash -LiteralPath $executablePath -Algorithm SHA256).Hash
$commerceDiagnosticHash = if ($IncludeCommerceDiagnostic) {
    (Get-FileHash -LiteralPath $commerceDiagnosticPath -Algorithm SHA256).Hash
}
else {
    $null
}

[pscustomobject]@{
    PackagePath = $packagePath
    PackageSha256 = $packageHash
    ExecutableSha256 = $executableHash
    CommerceDiagnosticSha256 = $commerceDiagnosticHash
    IncludesCommerceDiagnostic = [bool]$IncludeCommerceDiagnostic
    IdentityName = $IdentityName
    Publisher = $Publisher
    Version = $Version
    Architecture = $Architecture
    WindowsSdkVersion = $sdkTools.Version
    Signed = [bool]$Sign
    SignatureVerification = $signatureVerification
    PublicCertificatePath = $certificatePath
}
