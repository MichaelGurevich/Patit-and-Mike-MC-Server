param(
    [ValidateSet("local", "online")] [string]$Mode = "local",
    [switch]$Force
)

# Load settings + helpers (order matters: config first).
. "$PSScriptRoot\config.ps1"
. "$PSScriptRoot\win-lib.ps1"

$script:Released = $false

Write-Host ""
Write-Host "########################################################" -ForegroundColor Magenta
Write-Host "#   Patit & Mike's Minecraft Server  -  $($Mode.ToUpper()) mode" -ForegroundColor Magenta
Write-Host "########################################################" -ForegroundColor Magenta
Write-Host ""

Acquire-Session -Force:$Force
try {
    Show-ConnectInfo $Mode
    Start-Server
} finally {
    Release-Session
}
