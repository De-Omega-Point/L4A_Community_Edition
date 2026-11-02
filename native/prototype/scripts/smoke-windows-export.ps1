$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
# Some hosted Windows runners expose legacy dialog HWNDs as UIA Pane controls.
# Use their real native edit/button controls when standard UIA patterns are absent.
# These helpers drive the same OS dialog; they do not choose paths inside app code.
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class ExportDialogControls {
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr h,uint m,IntPtr w,string l,uint f,uint t,out IntPtr r);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr h,uint m,IntPtr w,StringBuilder l,uint f,uint t,out IntPtr r);
  [DllImport("user32.dll", SetLastError=true)] static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
  static string Class(IntPtr h) { var s=new StringBuilder(256); GetClassName(h,s,s.Capacity); return s.ToString(); }
  public static void SetFileName(IntPtr h,string text) {
    if (h == IntPtr.Zero || !Class(h).Equals("Edit",StringComparison.OrdinalIgnoreCase)) throw new Exception("Filename HWND is not an Edit control");
    IntPtr result;
    if (SendMessageTimeout(h,0x000C,IntPtr.Zero,text,2,3000,out result)==IntPtr.Zero || result==IntPtr.Zero) throw new Exception("Native filename entry failed");
    var read=new StringBuilder(text.Length+10);
    if (SendMessageTimeout(h,0x000D,(IntPtr)read.Capacity,read,2,3000,out result)==IntPtr.Zero || read.ToString()!=text) throw new Exception("Native filename readback differs");
  }
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr h,uint m,IntPtr w,IntPtr l,uint f,uint t,out IntPtr r);
  public static void SelectFileName(IntPtr h) {
    if (h == IntPtr.Zero || !Class(h).Equals("Edit",StringComparison.OrdinalIgnoreCase)) throw new Exception("Filename HWND is not an Edit control");
    IntPtr result;
    if (SendMessageTimeout(h,0x00B1,IntPtr.Zero,new IntPtr(-1),2,3000,out result)==IntPtr.Zero) throw new Exception("Cannot select native filename text");
  }
  public static string ReadFileName(IntPtr h) {
    if (h == IntPtr.Zero || !Class(h).Equals("Edit",StringComparison.OrdinalIgnoreCase)) throw new Exception("Filename HWND is not an Edit control");
    var read=new StringBuilder(32768); IntPtr result;
    if (SendMessageTimeout(h,0x000D,(IntPtr)read.Capacity,read,2,3000,out result)==IntPtr.Zero) throw new Exception("Native filename read failed");
    return read.ToString();
  }
  public static void Click(IntPtr h) {
    if (h == IntPtr.Zero || !Class(h).Equals("Button",StringComparison.OrdinalIgnoreCase)) throw new Exception("Save/Cancel HWND is not a Button control");
    if (!PostMessage(h,0x00F5,IntPtr.Zero,IntPtr.Zero)) throw new Exception("Native button click failed");
  }
}
'@
function Invoke-DialogButton($button, $dialog) {
  if (!$button) { throw 'Native dialog button missing' }
  $keyboard = New-Object -ComObject WScript.Shell
  if (!$keyboard.AppActivate($dialog.Current.Name)) { throw 'Could not activate native dialog before button click' }
  Start-Sleep -Milliseconds 250
  $pattern = $null
  if ($button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) { $pattern.Invoke() }
  else { [ExportDialogControls]::Click([IntPtr]$button.Current.NativeWindowHandle) }
}
function Find-DialogButton($dialog, $name, $id) {
  $idCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, $id)
  $nameCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $name)
  $condition = [System.Windows.Automation.AndCondition]::new($idCondition, $nameCondition)
  $button = $dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
  if (!$button) { throw "Native $name button not discoverable by verified name and ID" }
  return $button
}
function Set-DialogFileName($dialog, $destination) {
  $hostCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, 'FileNameControlHost')
  $hostNode = $dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $hostCondition)
  if (!$hostNode) { throw 'Native filename host not discoverable' }
  $fieldCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, '1001')
  $edit = $hostNode.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $fieldCondition)
  if (!$edit) { throw 'Native filename control not discoverable inside filename host' }
  # Real keyboard input is required: WM_SETTEXT/UIA ValuePattern can change
  # visible text without committing the shell dialog's internal filename model.
  $keyboard = New-Object -ComObject WScript.Shell
  if (!$keyboard.AppActivate($dialog.Current.Name)) { throw 'Could not activate the verified native Save As dialog' }
  Start-Sleep -Milliseconds 250
  $keyboard.SendKeys('%n')
  Start-Sleep -Milliseconds 250
  # The legacy Edit control does not implement Ctrl+A reliably. Select text
  # without changing it, then type real keys so the shell sees EN_CHANGE.
  [ExportDialogControls]::SelectFileName([IntPtr]$edit.Current.NativeWindowHandle)
  $escaped = -join ($destination.ToCharArray() | ForEach-Object {
    switch ($_) {
      '{' { '{{}' } '}' { '{}}' }
      default { if ('+^%~()'.Contains([string]$_)) { '{' + $_ + '}' } else { [string]$_ } }
    }
  })
  $keyboard.SendKeys($escaped)
  $keyboard.SendKeys('{TAB}')
  Start-Sleep -Milliseconds 350
  $readback = [ExportDialogControls]::ReadFileName([IntPtr]$edit.Current.NativeWindowHandle)
  if ($readback -cne $destination) { throw "Keyboard filename readback differs: $readback" }

}
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
        if (!(Test-Path $stage)) {
          $firstTimeoutObserved = Test-Path ([IO.Path]::ChangeExtension($output, 'timeout'))
          throw "Timed out waiting for first unconfirmed/second busy outcome; first timeout observed: $firstTimeoutObserved"
        }
        $cancel = Find-DialogButton $dialog 'Cancel' '2'
        Invoke-DialogButton $cancel $dialog
        Start-Sleep -Seconds 1
        $dialog = $null
        $expiry = (Get-Date).AddSeconds(90)
        while (!$dialog -and (Get-Date) -lt $expiry) {
          $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
          foreach ($window in $windows) {
            if ($window.Current.Name -like 'Save a NEW L4A export file*') { $dialog=$window; break }
          }
          if (!$dialog) { Start-Sleep -Milliseconds 250 }
        }
        if (!$dialog) {
          $fixtureOutcome = if (Test-Path $output) { Get-Content $output -Raw } else { 'no fixture completion' }
          throw "Retry did not open a fresh native Save As dialog: $fixtureOutcome"
        }
      }
      if ($scenario -eq 'cancel') {
        $button = Find-DialogButton $dialog 'Cancel' '2'
      } else {
        Set-DialogFileName $dialog $destination
        $button = Find-DialogButton $dialog 'Save' '1'
      }
      if (!$button) { throw 'Native Save/Cancel button not discoverable' }
      Invoke-DialogButton $button $dialog
    } elseif ($dialog) { throw 'Rejected payload unexpectedly opened a Save As dialog' }
    $deadline = (Get-Date).AddSeconds(50)
    while (!(Test-Path $output) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
    if (!(Test-Path $output)) { throw 'No native completion outcome within timeout' }
    $result = Get-Content $output -Raw | ConvertFrom-Json
    if ($result.error) { throw $result.error }
    $expected = switch ($scenario) { 'cancel' {'cancelled'} 'exists' {'failed'} 'invalid' {'failed'} 'oversized' {'failed'} default {'saved'} }
    if ($result.status -ne $expected) { throw "Expected $expected, got $($result.status)" }
    if ($expected -eq 'saved' -or $scenario -eq 'exists') {
      $selectedReport = [IO.Path]::ChangeExtension($output, 'selected')
      if (!(Test-Path $selectedReport)) { throw 'Test-only native selected-path evidence missing' }
      $selectedPath = [IO.File]::ReadAllText($selectedReport)
      $report.nativeSelectedPath = $selectedPath
      if ([IO.Path]::GetFullPath($selectedPath) -ine [IO.Path]::GetFullPath($destination)) { throw 'Native dialog selected a different destination than requested through its UI' }
    }
    $report.status = $result.status
    if ($result.firstElapsedMs) { $report.firstElapsedMs = $result.firstElapsedMs }
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
    $selectedReport = [IO.Path]::ChangeExtension($output, 'selected')
    if (Test-Path $selectedReport) { $report.nativeSelectedPath = [IO.File]::ReadAllText($selectedReport) }
    if ($dialog) {
      $nodes = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
      $report.dialogControls = @($nodes | ForEach-Object { @{ name=$_.Current.Name; id=$_.Current.AutomationId; type=$_.Current.ControlType.ProgrammaticName; hwnd=$_.Current.NativeWindowHandle } })
    }
  } finally {
    if (Test-Path $output) { Copy-Item $output (Join-Path $evidence "fixture-$scenario.json") }
    foreach ($suffix in @('native-log', 'selected')) {
      $diagnostic = [IO.Path]::ChangeExtension($output, $suffix)
      if (Test-Path $diagnostic) { Copy-Item $diagnostic (Join-Path $evidence "fixture-$scenario.$suffix") }
    }
    if ($process) { $process.Refresh(); if (!$process.HasExited) { Stop-Process -Id $process.Id -Force } }
    $results += $report
    $results | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $evidence 'windows-export-runtime.json')
  }
}
Remove-Item Env:L4A_EXPORT_SMOKE_SCENARIO,Env:L4A_EXPORT_SMOKE_REPORT -ErrorAction SilentlyContinue
$results | ConvertTo-Json -Depth 8 | Write-Output
if ($failed) { exit 1 }
