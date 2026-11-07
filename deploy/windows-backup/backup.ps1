# Lädt den persönlichen Export eines Scrumbanize-Kontos herunter – alle Notizbücher, die die Person sehen kann (mit
# Anhängen), die Aufgaben als CSV und die Termine als Kalender.ics – und behält die neuesten. Dasselbe wie
# Einstellungen → „Meine Daten exportieren“. Eingerichtet von install.ps1, jeden Tag gestartet von der Aufgabenplanung.
# Das Passwort liegt verschlüsselt (Windows DPAPI) in password.dat: lesbar nur für dieses Windows-Konto auf diesem PC.
$ErrorActionPreference = 'Stop'

$configDir = if ($env:SCRUMBANIZE_BACKUP_HOME) { $env:SCRUMBANIZE_BACKUP_HOME } else { Join-Path $env:APPDATA 'Scrumbanize-Backup' }
$logFile = Join-Path $configDir 'backup.log'

function Write-Log([string]$text) {
  New-Item -ItemType Directory -Force -Path $configDir | Out-Null
  Add-Content -Path $logFile -Encoding UTF8 -Value ("{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $text)
}

function Show-Failure([string]$text) {
  # A short notice next to the clock; without a desktop (e.g. in tests) only the log counts.
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $icon = New-Object System.Windows.Forms.NotifyIcon
    $icon.Icon = [System.Drawing.SystemIcons]::Warning
    $icon.Visible = $true
    $icon.ShowBalloonTip(10000, 'Scrumbanize-Backup fehlgeschlagen', $text, [System.Windows.Forms.ToolTipIcon]::Warning)
    Start-Sleep -Seconds 8
    $icon.Dispose()
  } catch { }
}

function Stop-WithError([string]$text) {
  Write-Log "FEHLER: $text"
  if (-not $env:SCRUMBANIZE_BACKUP_HOME) { Show-Failure $text }
  exit 1
}

function Get-Status($exception) {
  try { return [int]$exception.Response.StatusCode } catch { return 0 }
}

$configFile = Join-Path $configDir 'config.json'
$passwordFile = Join-Path $configDir 'password.dat'
if (-not (Test-Path $configFile) -or -not (Test-Path $passwordFile)) {
  Stop-WithError 'Keine Einstellungen gefunden – bitte install.cmd noch einmal ausführen.'
}
$config = Get-Content -Raw -Encoding UTF8 $configFile | ConvertFrom-Json
try {
  $secure = Get-Content $passwordFile | ConvertTo-SecureString
  $password = [System.Net.NetworkCredential]::new('', $secure).Password
} catch {
  Stop-WithError 'Das gespeicherte Passwort lässt sich nicht lesen – bitte install.cmd noch einmal ausführen.'
}

# Windows PowerShell 5.1 may not offer TLS 1.2 by itself.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$server = $config.server.TrimEnd('/')
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("scrumbanize-backup-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $work | Out-Null
$loggedIn = $false

try {
  # Log in.
  $body = [System.Text.Encoding]::UTF8.GetBytes((@{ email = $config.email; password = $password } | ConvertTo-Json -Compress))
  $password = $null
  try {
    Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$server/api/auth/login" -ContentType 'application/json; charset=utf-8' `
      -Body $body -WebSession $session -TimeoutSec 90 | Out-Null
    $loggedIn = $true
  } catch {
    switch (Get-Status $_.Exception) {
      401 { Stop-WithError 'Anmeldung abgelehnt – stimmen E-Mail und Passwort noch?' }
      429 { Stop-WithError 'Zu viele Anmeldeversuche – später noch einmal.' }
      0 { Stop-WithError "Server nicht erreichbar ($server)." }
      default { Stop-WithError ("Anmeldung fehlgeschlagen (HTTP {0})." -f (Get-Status $_.Exception)) }
    }
  }

  # Download the export.
  $file = 'scrumbanize-export-{0}.zip' -f (Get-Date -Format 'yyyy-MM-dd')
  $temp = Join-Path $work $file
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$server/api/account/export?format=md" -WebSession $session -OutFile $temp -TimeoutSec 1800
  } catch {
    Stop-WithError ("Export fehlgeschlagen (HTTP {0})." -f (Get-Status $_.Exception))
  }
  try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::OpenRead($temp).Dispose()
  } catch {
    Stop-WithError 'Die heruntergeladene Datei ist kein gültiges ZIP.'
  }

  # Into the backup folder; the newest $config.keep exports (one per day) stay.
  $folder = $config.folder
  try {
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
    Move-Item -Force -Path $temp -Destination (Join-Path $folder $file)
  } catch {
    Stop-WithError "Backup lässt sich nicht in $folder speichern."
  }
  Get-ChildItem -Path $folder -Filter 'scrumbanize-export-*.zip' | Sort-Object Name -Descending |
    Select-Object -Skip ([int]$config.keep) | Remove-Item -Force

  $bytes = (Get-Item (Join-Path $folder $file)).Length
  $size = if ($bytes -ge 1MB) { '{0:N1} MB' -f ($bytes / 1MB) } else { '{0:N0} KB' -f [math]::Ceiling($bytes / 1KB) }
  Write-Log "OK: $(Join-Path $folder $file) ($size)"
} finally {
  # Log out again, so no session stays open on the server.
  if ($loggedIn) {
    try { Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$server/api/auth/logout" -WebSession $session -TimeoutSec 30 | Out-Null } catch { }
  }
  Remove-Item -Recurse -Force -Path $work -ErrorAction SilentlyContinue
}
