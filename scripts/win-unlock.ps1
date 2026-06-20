# Emergency: force the server lock back to FREE (use only if the other person
# crashed without releasing it, and you've confirmed nobody is actually playing).
. "$PSScriptRoot\config.ps1"
. "$PSScriptRoot\win-lib.ps1"

Write-Host ""
Write-Host "Forcing the server lock to FREE..." -ForegroundColor Yellow
if (Have-Upstream) { & git.exe -C $RepoRoot pull --rebase --autostash origin $GIT_BRANCH }
Write-Lock "free" "force-unlocked by $(Whoami-Tag)"
& git.exe -C $RepoRoot add (Split-Path $LockFile -Leaf)
& git.exe -C $RepoRoot commit -m "lock: force-unlocked by $(Whoami-Tag)" *> $null
if (Have-Upstream) { & git.exe -C $RepoRoot push origin $GIT_BRANCH }
Write-Host "Lock cleared. You can play now." -ForegroundColor Green
Write-Host ""
