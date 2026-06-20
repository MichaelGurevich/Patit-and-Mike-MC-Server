# One-time setup for Windows: download the server, install Tailscale, pin version.
. "$PSScriptRoot\config.ps1"
. "$PSScriptRoot\win-lib.ps1"

Write-Host ""
Write-Host "=== Setup: Patit & Mike's Minecraft Server (Windows) ===" -ForegroundColor Magenta
Write-Host ""

if (-not (Test-Path $ServerDir)) { New-Item -ItemType Directory -Path $ServerDir | Out-Null }

function Ensure-Java25 {
    $java = Find-Java
    if ($java -and (Get-JavaMajor $java) -ge $JAVA_MIN) {
        Write-Host "Java $((Get-JavaMajor $java)) found - good." -ForegroundColor Green
        return
    }
    Write-Host "Installing Java $JAVA_MIN (required by the latest Minecraft)..."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        & winget install --id "EclipseAdoptium.Temurin.$JAVA_MIN.JDK" -e --source winget --accept-package-agreements --accept-source-agreements --silent
    } else {
        Write-Host "Couldn't auto-install. Please install Java $JAVA_MIN from https://adoptium.net" -ForegroundColor Yellow
        Write-Host "then run setup again." -ForegroundColor Yellow
        exit 1
    }
}

Ensure-Java25

# Grab any version another machine already pinned.
if (Have-Upstream) {
    & git.exe -C $RepoRoot pull --rebase --autostash origin $GIT_BRANCH *> $null
}

function Resolve-Version {
    $verFile = Join-Path $ServerDir "version.txt"
    if ($MC_VERSION_OVERRIDE) { return $MC_VERSION_OVERRIDE }
    if (Test-Path $verFile)   { return (Get-Content $verFile -Raw).Trim() }
    Write-Host "Looking up the latest Minecraft version..."
    $manifest = Invoke-RestMethod $MANIFEST_URL
    $v = $manifest.latest.release
    [System.IO.File]::WriteAllText($verFile, $v, (New-Object System.Text.UTF8Encoding($false)))
    return $v
}

function Download-Server([string]$V) {
    $manifest = Invoke-RestMethod $MANIFEST_URL
    $entry = $manifest.versions | Where-Object { $_.id -eq $V } | Select-Object -First 1
    if (-not $entry) { throw "Version $V not found in Mojang's manifest." }
    $meta = Invoke-RestMethod $entry.url
    $url = $meta.downloads.server.url
    if (-not $url) { throw "No server download is available for $V." }
    $jar = Join-Path $ServerDir "server.jar"
    Write-Host "Downloading Minecraft $V server.jar ..."
    Invoke-WebRequest -Uri $url -OutFile $jar
}

function Setup-Tailscale {
    if (Get-TailscaleExe) { Write-Host "Tailscale is already installed." -ForegroundColor Green; return }
    Write-Host "Installing Tailscale (used only for playing apart)..."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        & winget install --id tailscale.tailscale -e --source winget --accept-package-agreements --accept-source-agreements
    } else {
        Write-Host "Couldn't auto-install. Please install it from:" -ForegroundColor Yellow
        Write-Host "https://tailscale.com/download/windows" -ForegroundColor Yellow
    }
}

$V = Resolve-Version
Download-Server $V
Setup-Tailscale

# Share the pinned version so the other machine uses the exact same one.
& git.exe -C $RepoRoot add "server/version.txt"
& git.exe -C $RepoRoot commit -m "Pin Minecraft version $V" *> $null
if (Have-Upstream) { & git.exe -C $RepoRoot push origin $GIT_BRANCH *> $null }

Write-Host ""
Write-Host "Setup complete! Minecraft $V is ready." -ForegroundColor Green
Write-Host "  Play together (same Wi-Fi): double-click play-windows.bat"
Write-Host "  Play apart (internet):      double-click play-online-windows.bat"
Write-Host ""
