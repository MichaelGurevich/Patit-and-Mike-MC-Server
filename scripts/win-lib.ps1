# ===========================================================================
#  Shared helper functions for the Windows scripts.
#  Dot-sourced by win-play.ps1 / win-setup.ps1 / win-unlock.ps1.
#  config.ps1 must be dot-sourced BEFORE this file.
# ===========================================================================

$ErrorActionPreference = "Stop"

# --- Paths -----------------------------------------------------------------
$RepoRoot  = Split-Path $PSScriptRoot -Parent
$ServerDir = Join-Path $RepoRoot "server"
$BackupDir = Join-Path $RepoRoot "backups"
$LockFile  = Join-Path $RepoRoot "SESSION-LOCK.txt"
$MANIFEST_URL = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json"

# --- Git helpers -----------------------------------------------------------
# NOTE: call git.exe explicitly so we never recurse into a function named "git".
function Have-Upstream {
    & git.exe -C $RepoRoot ls-remote --exit-code --heads origin $GIT_BRANCH *> $null
    return ($LASTEXITCODE -eq 0)
}

function Whoami-Tag {
    $name = (& git.exe -C $RepoRoot config user.name) 2>$null
    if ([string]::IsNullOrWhiteSpace($name)) { $name = $env:USERNAME }
    return ($name -replace '[\r\n]', ' ').Trim()
}

# --- Lock file (simple key=value, written LF / no BOM for Mac compatibility) -
function Read-Lock {
    $h = @{ status = "free"; holder = ""; machine = ""; since = ""; note = "" }
    if (Test-Path $LockFile) {
        foreach ($line in (Get-Content $LockFile)) {
            if ($line -match '^\s*([^=#]+?)\s*=\s*(.*)$') { $h[$matches[1].Trim()] = $matches[2].Trim() }
        }
    }
    return [pscustomobject]$h
}

function Write-Lock([string]$Status, [string]$Note) {
    $lines = @(
        "status=$Status",
        "holder=$(Whoami-Tag)",
        "machine=$env:COMPUTERNAME",
        "since=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
        "note=$Note"
    )
    $content = ($lines -join "`n") + "`n"
    [System.IO.File]::WriteAllText($LockFile, $content, (New-Object System.Text.UTF8Encoding($false)))
}

# --- Sync ------------------------------------------------------------------
function Ensure-Clean-Or-Recover {
    $status = & git.exe -C $RepoRoot status --porcelain
    if (-not [string]::IsNullOrWhiteSpace($status)) {
        Write-Host "Found unsaved local changes (recovering from a previous session)..." -ForegroundColor Yellow
        & git.exe -C $RepoRoot add -A
        & git.exe -C $RepoRoot commit -m "auto-save: recovered local changes ($(Whoami-Tag))" *> $null
    }
}

function Sync-Pull {
    if (Have-Upstream) {
        Write-Host "Pulling the latest world from GitHub..." -ForegroundColor Cyan
        & git.exe -C $RepoRoot pull --rebase --autostash origin $GIT_BRANCH
        if ($LASTEXITCODE -ne 0) {
            throw "Could not pull the latest world (possible sync conflict). See README -> Troubleshooting."
        }
    } else {
        Write-Host "No world on GitHub yet (first run) - skipping pull." -ForegroundColor DarkGray
    }
}

# --- The 'baton' lock: only one person hosts at a time ---------------------
function Acquire-Session([switch]$Force) {
    Ensure-Clean-Or-Recover
    Sync-Pull
    $lock = Read-Lock
    $me = Whoami-Tag
    if ($lock.status -eq "active" -and $lock.holder -ne $me -and -not $Force) {
        Write-Host ""
        Write-Host "================ SERVER IS LOCKED ================" -ForegroundColor Yellow
        Write-Host " $($lock.holder) (on $($lock.machine)) started a session"
        Write-Host " at $($lock.since) and hasn't released it yet."
        Write-Host ""
        Write-Host " Only ONE person can host at a time (the world can't be"
        Write-Host " safely merged). Ask them to fully STOP their server so it"
        Write-Host " saves and uploads."
        Write-Host ""
        Write-Host " If they crashed and can't release it, double-click"
        Write-Host " unlock-windows.bat, then try again."
        Write-Host "=================================================" -ForegroundColor Yellow
        Write-Host ""
        exit 1
    }
    Write-Lock "active" "playing"
    & git.exe -C $RepoRoot add (Split-Path $LockFile -Leaf)
    & git.exe -C $RepoRoot commit -m "lock: $me started a session" *> $null
    if (Have-Upstream) {
        & git.exe -C $RepoRoot push origin $GIT_BRANCH
        if ($LASTEXITCODE -ne 0) {
            throw "Couldn't claim the lock - someone may have just started a session. Try again in a moment."
        }
    }
    Write-Host "Lock acquired - you're clear to play." -ForegroundColor Green
}

function Release-Session {
    if ($script:Released) { return }
    $script:Released = $true
    Write-Host ""
    Write-Host "Saving the world and uploading to GitHub..." -ForegroundColor Cyan
    New-Backup
    & git.exe -C $RepoRoot add -A
    & git.exe -C $RepoRoot commit -m "World save: $(Whoami-Tag) $(Get-Date -Format 'yyyy-MM-dd HH:mm')" *> $null
    Write-Lock "free" "released"
    & git.exe -C $RepoRoot add (Split-Path $LockFile -Leaf)
    & git.exe -C $RepoRoot commit -m "lock: released by $(Whoami-Tag)" *> $null
    if (Have-Upstream) {
        & git.exe -C $RepoRoot pull --rebase --autostash origin $GIT_BRANCH *> $null
        & git.exe -C $RepoRoot push origin $GIT_BRANCH
    } else {
        & git.exe -C $RepoRoot push -u origin $GIT_BRANCH
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARNING: upload (push) failed. Your world is saved & committed locally." -ForegroundColor Red
        Write-Host "Reconnect to the internet and run the script again, or 'git push' manually." -ForegroundColor Red
    } else {
        Write-Host "Done - world uploaded. Safe to close this window." -ForegroundColor Green
    }
}

# --- Backups (one capped .zip snapshot per day) ----------------------------
function New-Backup {
    if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }
    $world = Join-Path $ServerDir "world"
    if (-not (Test-Path $world)) { return }
    $name = "world-$(Get-Date -Format 'yyyyMMdd').zip"
    $dest = Join-Path $BackupDir $name
    if (Test-Path $dest) { Remove-Item $dest -Force }
    Write-Host "Creating backup $name ..."
    Compress-Archive -Path $world -DestinationPath $dest -CompressionLevel Optimal
    $zips = Get-ChildItem $BackupDir -Filter "world-*.zip" | Sort-Object Name -Descending
    if ($zips.Count -gt $BACKUP_KEEP) {
        $zips | Select-Object -Skip $BACKUP_KEEP | ForEach-Object { Remove-Item $_.FullName -Force }
    }
}

# --- Connectivity ----------------------------------------------------------
function Get-LanIP {
    try {
        $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
               Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }
        $pref = $ips | Where-Object {
            $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' -or $_.IPAddress -like '172.*'
        } | Select-Object -First 1
        if ($pref) { return $pref.IPAddress }
        if ($ips)  { return ($ips | Select-Object -First 1).IPAddress }
    } catch {}
    return "127.0.0.1"
}

function Get-TailscaleExe {
    $cmd = Get-Command tailscale -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $p = "C:\Program Files\Tailscale\tailscale.exe"
    if (Test-Path $p) { return $p }
    return $null
}

function Get-TailscaleIP {
    $ts = Get-TailscaleExe
    if (-not $ts) { return $null }
    return (& $ts ip -4 2>$null | Select-Object -First 1)
}

function Ensure-Tailscale {
    $ts = Get-TailscaleExe
    if (-not $ts) {
        Write-Host "Tailscale isn't installed. Run setup-windows.bat, or get it from" -ForegroundColor Red
        Write-Host "https://tailscale.com/download/windows" -ForegroundColor Red
        return $null
    }
    $ip = Get-TailscaleIP
    if (-not $ip) {
        Write-Host "Starting Tailscale (a browser may open so you can log in)..." -ForegroundColor Cyan
        & $ts up
        $ip = Get-TailscaleIP
    }
    return $ip
}

function Show-ConnectInfo([string]$Mode) {
    $lan = Get-LanIP
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Green
    if ($Mode -eq "online") {
        $tip = Ensure-Tailscale
        Write-Host "  PLAY APART - over the internet via Tailscale" -ForegroundColor Green
        if ($tip) {
            Write-Host "  The other person types this as the Server Address:"
            Write-Host "      $tip" -ForegroundColor White
            Write-Host "  (they must also have Tailscale running & logged into"
            Write-Host "   the SAME Tailscale account/tailnet as you)"
        } else {
            Write-Host "  Tailscale not ready - see the messages above." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  PLAY TOGETHER - same Wi-Fi / network" -ForegroundColor Green
        Write-Host "  The other person types this as the Server Address:"
        Write-Host "      $lan" -ForegroundColor White
    }
    Write-Host "  You, on THIS PC, connect to:  localhost"
    Write-Host "  (Port is 25565 - the default, no need to type it.)"
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host ""
}

# --- Java (find a new-enough one even if an older java is first on PATH) ----
function Get-JavaMajor([string]$Exe) {
    # 'java -version' prints to stderr, which PowerShell wraps as error records.
    # Under EAP=Stop that throws; under SilentlyContinue it's dropped entirely.
    # So force EAP=Continue and capture ALL streams to a temp file, then read it.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        & $Exe -version *> $tmp
        $out = Get-Content $tmp -Raw
        if ($out -match 'version "(\d+)') { return [int]$matches[1] }
    } catch {} finally {
        $ErrorActionPreference = $prev
        Remove-Item $tmp -ErrorAction SilentlyContinue
    }
    return 0
}

function Find-Java {
    # 1) java on PATH, if it's new enough.
    $onPath = Get-Command java -ErrorAction SilentlyContinue
    if ($onPath -and (Get-JavaMajor $onPath.Source) -ge $JAVA_MIN) { return $onPath.Source }
    # 2) look in the usual JDK install spots and pick the newest that qualifies.
    $patterns = @(
        "$env:ProgramFiles\Eclipse Adoptium\jdk-*\bin\java.exe",
        "$env:ProgramFiles\Java\jdk-*\bin\java.exe",
        "$env:ProgramFiles\Microsoft\jdk-*\bin\java.exe",
        "$env:ProgramFiles\Zulu\zulu-*\bin\java.exe"
    )
    $cands = foreach ($p in $patterns) { Get-ChildItem $p -ErrorAction SilentlyContinue }
    $best = $cands | Sort-Object { Get-JavaMajor $_.FullName } -Descending | Select-Object -First 1
    if ($best -and (Get-JavaMajor $best.FullName) -ge $JAVA_MIN) { return $best.FullName }
    # 3) give back whatever exists so the caller can produce a clear error.
    if ($onPath) { return $onPath.Source }
    return $null
}

function Start-Server {
    $java = Find-Java
    if (-not $java -or (Get-JavaMajor $java) -lt $JAVA_MIN) {
        throw "Java $JAVA_MIN or newer is required (Minecraft $((Get-Content (Join-Path $ServerDir 'version.txt') -Raw).Trim())). Run setup-windows.bat to install it."
    }
    $jar = Join-Path $ServerDir "server.jar"
    if (-not (Test-Path $jar)) { throw "server.jar is missing. Run setup-windows.bat first." }
    Write-Host "Starting the Minecraft server (Java $((Get-JavaMajor $java)))." -ForegroundColor Cyan
    Write-Host "When you're done, type:  stop   (then Enter) in this window so it saves & uploads." -ForegroundColor Yellow
    Push-Location $ServerDir
    try {
        & $java "-Xms$JAVA_XMS" "-Xmx$JAVA_XMX" -jar "server.jar" nogui
    } finally {
        Pop-Location
    }
}
