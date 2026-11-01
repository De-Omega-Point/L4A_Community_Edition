$ErrorActionPreference = 'Stop'
$evidence = Get-Content evidence/build-evidence.json -Raw | ConvertFrom-Json
$msi = Join-Path (Resolve-Path evidence) $evidence.assets[0].name
$destination = Join-Path $env:RUNNER_TEMP 'L4A-Community-Synthetic-Test'
$report = [ordered]@{platform='windows'; sourceCommit=$evidence.sourceCommit; packageSha256=$evidence.assets[0].sha256; deviceAcceptance=$false; registrationTested=$false; offlineTested=$false}
$installed = $false
$appProcess = $null
try {
  $report.signature = (Get-AuthenticodeSignature $msi).Status.ToString()
  $webview = Get-ChildItem "${env:ProgramFiles(x86)}\Microsoft\EdgeWebView\Application\*\msedgewebview2.exe" -ErrorAction SilentlyContinue
  if (!$webview) { $report.startup = 'BLOCKED_NO_EXISTING_WEBVIEW2'; }
  else {
    $installLog = Join-Path (Resolve-Path evidence) 'windows-install.log'
    $installer = Start-Process msiexec.exe -ArgumentList @('/i', "`"$msi`"", '/qn', '/norestart', "INSTALLDIR=`"$destination`"", '/l*v', "`"$installLog`"") -Wait -PassThru
    $report.installExit = $installer.ExitCode
    if ($installer.ExitCode -notin @(0,3010)) { throw "MSI install failed: $($installer.ExitCode)" }
    $installed = $true
    $exe = Join-Path $destination 'l4a-community-prototype.exe'
    if (!(Test-Path $exe)) { throw 'Expected executable not found in requested isolated install directory' }
    $report.exeSha256 = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant()
    $report.executableSignature = (Get-AuthenticodeSignature $exe).Status.ToString()
    $appProcess = Start-Process $exe -PassThru
    Start-Sleep -Seconds 8
    $appProcess.Refresh()
    $report.startup = if (!$appProcess.HasExited) {'PROCESS_RUNNING_ONLY'} else {'PROCESS_EXITED'}
    $report.windowTitle = $appProcess.MainWindowTitle
    if ($appProcess.HasExited) { throw 'Native app process exited during startup smoke test' }
  }
} catch { $report.error = $_.Exception.Message; $global:LASTEXITCODE=1 }
finally {
  if ($appProcess -and !$appProcess.HasExited) { Stop-Process -Id $appProcess.Id }
  if ($installed) {
    $uninstall = Start-Process msiexec.exe -ArgumentList @('/x', "`"$msi`"", '/qn', '/norestart') -Wait -PassThru
    $report.uninstallExit = $uninstall.ExitCode
    if ($uninstall.ExitCode -notin @(0,3010)) { $report.error = "MSI cleanup failed: $($uninstall.ExitCode)" }
  }
  $report | ConvertTo-Json -Depth 6 | Set-Content evidence/windows-smoke.json
  $report | ConvertTo-Json -Depth 6 | Write-Output
}
if ($report.Contains('error')) { exit 1 }
