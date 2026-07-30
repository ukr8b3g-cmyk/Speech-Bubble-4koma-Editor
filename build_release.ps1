param(
    [string]$Version = "0.1.0",
    [string]$IsccPath = "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $root ".venv\Scripts\python.exe"
$stageRoot = Join-Path $root "dist\release-stage"
$workRoot = Join-Path $root "build\release"
$portableDir = Join-Path $stageRoot "SpeechBubble4komaEditor"
$releaseDir = Join-Path $root "dist\release"
$portableZip = Join-Path $releaseDir "SpeechBubble4komaEditor-v$Version-win-x64-portable.zip"
$installer = Join-Path $releaseDir "SpeechBubble4komaEditor-v$Version-win-x64-setup.exe"
$checksums = Join-Path $releaseDir "SHA256SUMS.txt"

if ($Version -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') {
    throw "Version must use semantic version format, for example 0.1.0."
}
if (-not (Test-Path -LiteralPath $IsccPath -PathType Leaf)) {
    throw "Inno Setup 6 was not found: $IsccPath"
}
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "The Desktop build environment was not found. Run setup_and_start.cmd first."
}

Push-Location $root
try {
    & $python -m pip install --disable-pip-version-check -r requirements-build.txt
    if ($LASTEXITCODE -ne 0) {
        throw "Build dependency installation failed with exit code $LASTEXITCODE."
    }

    foreach ($path in @($stageRoot, $workRoot)) {
        if (Test-Path -LiteralPath $path) {
            Remove-Item -LiteralPath $path -Recurse -Force
        }
    }
    & $python -m PyInstaller --noconfirm --clean --distpath $stageRoot --workpath $workRoot SpeechBubble4komaEditor.spec
    if ($LASTEXITCODE -ne 0) {
        throw "Portable build failed with exit code $LASTEXITCODE."
    }
    foreach ($name in @("README.md", "LICENSE", "PRIVACY.md", "SECURITY.md", "THIRD-PARTY-NOTICES.md")) {
        Copy-Item -LiteralPath (Join-Path $root $name) -Destination (Join-Path $portableDir $name) -Force
    }

    New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
    if (Test-Path -LiteralPath $portableZip) {
        Remove-Item -LiteralPath $portableZip -Force
    }
    Compress-Archive -LiteralPath $portableDir -DestinationPath $portableZip -CompressionLevel Optimal

    & $IsccPath "/DMyAppVersion=$Version" "/DMySourceDir=$portableDir" (Join-Path $root "packaging\SpeechBubble4komaEditor.iss")
    if ($LASTEXITCODE -ne 0) {
        throw "Installer build failed with exit code $LASTEXITCODE."
    }
    if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
        throw "Installer output was not created: $installer"
    }

    $lines = foreach ($path in @($installer, $portableZip)) {
        $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $path
        "$($hash.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($path))"
    }
    Set-Content -LiteralPath $checksums -Value $lines -Encoding ASCII

    Write-Output ""
    Write-Output "Release artifacts:"
    Write-Output $installer
    Write-Output $portableZip
    Write-Output $checksums
}
finally {
    Pop-Location
}
