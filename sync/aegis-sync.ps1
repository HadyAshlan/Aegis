# Aegis auto-sync — pull dari GitHub repo ke laptop tiap N menit.
# Dipanggil oleh Windows Task Scheduler.

$ErrorActionPreference = "SilentlyContinue"
$vaultPath = "C:\Users\HP\Project Aegis"
$logFile = Join-Path $vaultPath "sync\sync.log"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

Set-Location $vaultPath
$output = & git pull --rebase --autostash 2>&1
$status = if ($LASTEXITCODE -eq 0) { "OK" } else { "FAIL" }
"[$timestamp] $status :: $($output -join ' | ')" | Out-File -FilePath $logFile -Append -Encoding utf8
