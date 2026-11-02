$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$exe = Resolve-Path 'src-tauri/target/x86_64-pc-windows-msvc/release/l4a-export-smoke.exe'
$root = Join-Path $env:RUNNER_TEMP ('l4a-export-smoke-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $root | Out-Null
$evidence = Join-Path (Get-Location) 'evidence'
New-Item -ItemType Directory -Force $evidence | Out-Null
$results = @()
$failed = $false
foreach ($scenario in @('saved-json', 'saved-csv', 'cancel', 'exists', 'repeated', 'invalid', 'oversized', 'timeout-retry', 'busy-navigation')) {
  $report = [ordered]@{ scenario=$scenario; syntheticOnly=$true; nativeDialogTested=$false; productionRegistrationTested=$false; offlineTested=$false }
  $process = $null
  $output = Join-Path $root "$scenario-result.json"
  $extension = if ($scenario -eq 'saved-csv') { 'csv' } else { 'json' }
  $destination = Join-Path $root "$scenario-export.$extension"
  if ($scenario -eq 'exists') { [IO.File]::WriteAllText($destination, 'EXISTING FILE MUST NOT CHANGE') }
  try {
    $env:L4A_EXPORT_SMOKE_SCENARIO = $scenario
    $env:L4A_EXPORT_SMOKE_REPORT = $output
    $process = Start-Process $exe -PassThru
    $deadline = (Get-Date).AddSeconds(60)
    $dialog = $null
    while ((Get-Date) -lt $deadline -and !(Test-Path $output)) {
      $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty, [int]$process.Id)
      $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
      foreach ($window in $windows) {
        if ($window.Current.Name -like 'Save a NEW L4A export file*') { $dialog=$window; break }
      }
      if ($dialog) { break }
      $process.Refresh()
      if ($process.HasExited) { throw 'Synthetic native harness exited before outcome' }
      Start-Sleep -Milliseconds 250
    }
    if ($scenario -notin @('invalid','oversized')) {
      if (!$dialog) { throw 'Expected native Save As dialog did not appear' }
      $report.nativeDialogTested = $true
      if ($scenario -eq 'busy-navigation') { Start-Sleep -Seconds 2 }
      if ($scenario -eq 'timeout-retry') {
        $stage = [IO.Path]::ChangeExtension($output, 'stage')
        $expiry = (Get-Date).AddSeconds(140)
        while (!(Test-Path $stage) -and (Get-Date) -lt $expiry) { Start-Sleep -Milliseconds 250 }
        if (!(Test-Path $stage)) { throw 'Timed out waiting for first unconfirmed/second busy outcome' }
        $cancelCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, '2')
        $cancel = $dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cancelCondition)
        $cancel.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        Start-Sleep -Seconds 1
        $dialog = $null
        $expiry = (Get-Date).AddSeconds(20)
        while (!$dialog -and (Get-Date) -lt $expiry) {
          $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
          foreach ($window in $windows) {
            if ($window.Current.Name -like 'Save a NEW L4A export file*') { $dialog=$window; break }
          }
          if (!$dialog) { Start-Sleep -Milliseconds 250 }
        }
        if (!$dialog) { throw 'Retry did not open a fresh native Save As dialog' }
      }
      if ($scenario -eq 'cancel') {
        $buttonCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, '2')
      } else {
        $editsCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
        $edits = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, $editsCondition)
        $edit = $null
        foreach ($candidate in $edits) {
          if ($candidate.Current.AutomationId -eq '1001' -or $candidate.Current.Name -like 'File name*') { $edit=$candidate; break }
        }
        if (!$edit) { throw 'Native filename edit was not discoverable through UI Automation' }
        $value = $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        $value.SetValue($destination)
        $buttonCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, '1')
      }
      $button = $dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)
      if (!$button) { throw 'Native Save/Cancel button not discoverable' }
      $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    } elseif ($dialog) { throw 'Rejected payload unexpectedly opened a Save As dialog' }
    $deadline = (Get-Date).AddSeconds(50)
    while (!(Test-Path $output) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
    if (!(Test-Path $output)) { throw 'No native completion outcome within timeout' }
    $result = Get-Content $output -Raw | ConvertFrom-Json
    if ($result.error) { throw $result.error }
    $expected = switch ($scenario) { 'cancel' {'cancelled'} 'exists' {'failed'} 'invalid' {'failed'} 'oversized' {'failed'} default {'saved'} }
    if ($result.status -ne $expected) { throw "Expected $expected, got $($result.status)" }
    $report.status = $result.status
    if ($scenario -eq 'timeout-retry' -and ($result.firstStatus -ne 'unconfirmed' -or $result.secondStatus -ne 'busy')) { throw 'Timeout/retry contract failed' }
    if ($scenario -eq 'busy-navigation' -and !$result.navigationBlocked) { throw 'Navigation was not blocked while native save was busy' }
    if ($scenario -eq 'repeated' -and $result.secondStatus -ne 'busy') { throw 'Repeated concurrent export was not rejected as busy' }
    if ($expected -eq 'saved') {
      $actual = [IO.File]::ReadAllText($destination)
      if ($actual -cne $result.expectedText) { throw 'Saved bytes differ from synthetic payload' }
      $report.sha256 = (Get-FileHash $destination -Algorithm SHA256).Hash.ToLowerInvariant()
      $report.exactBytesVerified = $true
      Copy-Item $destination (Join-Path $evidence "synthetic-$scenario.$extension")
    } elseif ($scenario -eq 'exists') {
      if ([IO.File]::ReadAllText($destination) -cne 'EXISTING FILE MUST NOT CHANGE') { throw 'Existing file was changed' }
      $report.existingFileUnchanged = $true
    } elseif (Test-Path $destination) { throw 'Non-saved outcome left an unexpected destination file' }
    $report.passed = $true
  } catch {
    $failed = $true
    $report.passed = $false
    $report.error = $_.Exception.Message
    if ($dialog) {
      $nodes = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
      $report.dialogControls = @($nodes | ForEach-Object { @{ name=$_.Current.Name; id=$_.Current.AutomationId; type=$_.Current.ControlType.ProgrammaticName } })
    }
  } finally {
    if ($process) { $process.Refresh(); if (!$process.HasExited) { Stop-Process -Id $process.Id -Force } }
    $results += $report
    $results | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $evidence 'windows-export-runtime.json')
  }
}
Remove-Item Env:L4A_EXPORT_SMOKE_SCENARIO,Env:L4A_EXPORT_SMOKE_REPORT -ErrorAction SilentlyContinue
$results | ConvertTo-Json -Depth 8 | Write-Output
if ($failed) { exit 1 }
