# Richtet das tägliche Backup der eigenen Scrumbanize-Daten auf diesem PC ein: fragt nach dem Konto, speichert das
# Passwort verschlüsselt (nur dieses Windows-Konto kann es lesen), kopiert backup.ps1 und legt eine Aufgabe in der
# Aufgabenplanung an. Erneut ausführen ändert die Einstellungen; mit -Remove wird alles entfernt.
param([switch]$Remove)
$ErrorActionPreference = 'Stop'

$taskName = 'Scrumbanize-Backup'
$configDir = Join-Path $env:APPDATA 'Scrumbanize-Backup'
$appDir = Join-Path $env:LOCALAPPDATA 'Scrumbanize-Backup'

if ($Remove) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force -Path $appDir -ErrorAction SilentlyContinue
  Remove-Item -Force -Path (Join-Path $configDir 'config.json'), (Join-Path $configDir 'password.dat') -ErrorAction SilentlyContinue
  Write-Host 'Das automatische Backup ist entfernt. Die bisherigen Backups bleiben in ihrem Ordner.'
  return
}

function Ask([string]$question, [string]$default) {
  $answer = Read-Host "$question [$default]"
  if ([string]::IsNullOrWhiteSpace($answer)) { return $default } else { return $answer.Trim() }
}

Write-Host 'Automatisches Backup deiner Scrumbanize-Daten einrichten'
Write-Host ''
$server = (Ask 'Adresse der Web-Version' 'https://scrumbanize.onrender.com').TrimEnd('/')
$email = Read-Host 'E-Mail deines Scrumbanize-Kontos'
$secure = Read-Host 'Passwort' -AsSecureString
$folder = Ask 'Ordner für die Backups' (Join-Path $env:USERPROFILE 'Scrumbanize-Backups')
$keep = Ask 'Wie viele Tage aufheben?' '30'
$hour = Ask 'Um wie viel Uhr täglich? (Stunde, 0–23)' '20'
if ($keep -notmatch '^\d+$' -or [int]$keep -lt 1) { throw 'Bitte eine Zahl für die Anzahl angeben.' }
if ($hour -notmatch '^\d+$' -or [int]$hour -gt 23) { throw 'Bitte eine Stunde von 0 bis 23 angeben.' }

New-Item -ItemType Directory -Force -Path $configDir, $appDir | Out-Null
@{ server = $server; email = $email; folder = $folder; keep = [int]$keep } | ConvertTo-Json |
  Set-Content -Encoding UTF8 -Path (Join-Path $configDir 'config.json')
# Encrypted with DPAPI for this Windows account; no other account and no other PC can read it.
$secure | ConvertFrom-SecureString | Set-Content -Path (Join-Path $configDir 'password.dat')

Copy-Item -Force -Path (Join-Path $PSScriptRoot 'backup.ps1') -Destination (Join-Path $appDir 'backup.ps1')

# Every day at the hour; a PC that was off or asleep then catches up as soon as it can (StartWhenAvailable).
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f (Join-Path $appDir 'backup.ps1'))
$trigger = New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours([int]$hour))
# Local time without a time zone, so the task keeps the hour across summer and winter time.
$trigger.StartBoundary = [datetime]::Today.AddHours([int]$hour).ToString('s')
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Lädt jeden Tag den Export der eigenen Scrumbanize-Daten herunter.' -Force | Out-Null

Write-Host ''
Write-Host 'Erstes Backup wird heruntergeladen …'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $appDir 'backup.ps1')
$log = Join-Path $configDir 'backup.log'
$last = if (Test-Path $log) { Get-Content $log -Tail 1 -Encoding UTF8 } else { '' }
if ($LASTEXITCODE -eq 0) {
  Write-Host "Fertig. Das erste Backup liegt in: $folder"
  Write-Host "Ab jetzt täglich um $($hour):00 Uhr; die letzten $keep Tage bleiben."
  Write-Host "Protokoll: $log"
} else {
  Write-Host 'Das erste Backup hat nicht geklappt:' -ForegroundColor Yellow
  Write-Host $last
  exit 1
}
