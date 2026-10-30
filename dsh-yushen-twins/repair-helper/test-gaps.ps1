# Gap ledger evidence (offline, isolated fixture).
#
# Proves the closed loop:
#   1) an UNFIXABLE finding is written to gaps.jsonl with the reason it cannot be fixed
#   2) after the machine is fixed by other means, the next run marks it resolved
#
# Runs against a throwaway fixture; never touches the real DSH_HOME or bridge.
# Keep this file ASCII-only (Windows PowerShell 5.1 reads BOM-less .ps1 as ANSI).

$ErrorActionPreference = 'Stop'
$exe = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\assets\repair-helper\YushenRepair.exe'))
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('yushen-gap-test-' + [guid]::NewGuid().ToString('N'))
$oldHome = $env:DSH_HOME
$oldBridge = $env:QQ_BRIDGE_ROOT
$oldBypass = $env:YUSHEN_REPAIR_TEST_HOST_DOWN
$bridge = Join-Path $fixture 'bridge'

$null = New-Item -ItemType Directory -Path (Join-Path $bridge 'state') -Force
$null = New-Item -ItemType Directory -Path (Join-Path $fixture 'dayu\repair') -Force
$env:DSH_HOME = $fixture
$env:QQ_BRIDGE_ROOT = $bridge
$env:YUSHEN_REPAIR_TEST_HOST_DOWN = '1'

$script:failed = 0
function Check([string]$Name, [scriptblock]$Body) {
    try { & $Body; Write-Host "PASS  $Name" }
    catch { $script:failed++; Write-Host "FAIL  $Name  -> $($_.Exception.Message)" }
}
function Eq($Actual, $Expected, [string]$Why) {
    if ("$Actual" -ne "$Expected") { throw "$Why (got=$Actual want=$Expected)" }
}
function RunFix {
    $so = Join-Path $fixture 'stdout.txt'
    $se = Join-Path $fixture 'stderr.txt'
    $p = Start-Process -FilePath $exe -ArgumentList '--fix', '--confirm' -Wait -PassThru -NoNewWindow -RedirectStandardOutput $so -RedirectStandardError $se
    $out = [IO.File]::ReadAllText($so)
    return [pscustomobject]@{ code = $p.ExitCode; text = $out; json = ($out | ConvertFrom-Json) }
}

$gapsFile = Join-Path $fixture 'dayu\repair\gaps.jsonl'

try {
    Check 'step 1: unfixable finding is recorded with a reason' {
        $r = RunFix
        Eq $r.code 0 'exit'
        Eq (Test-Path $gapsFile) $true 'gaps ledger should exist'
        $rows = @(Get-Content $gapsFile -Encoding UTF8 | ForEach-Object { $_ | ConvertFrom-Json })
        $open = @($rows | Where-Object { $_.id -eq 'deps-missing' -and $_.status -eq 'open' })
        Eq ($open.Count -ge 1) $true 'deps-missing should be open'
        Eq ([bool]$open[0].whyNotFixed) $true 'must explain why it cannot be fixed'
        Write-Host ("      ledger open: " + (($open | ForEach-Object { $_.id }) -join ', '))
        Write-Host ("      reason: " + $open[0].whyNotFixed)
    }

    Check 'step 2: after another means fixes it, next run writes resolved' {
        $null = New-Item -ItemType Directory -Path (Join-Path $bridge 'node_modules') -Force
        $r = RunFix
        Eq $r.code 0 'exit2'
        Eq $r.json.gaps.newlyResolved 1 'exactly one gap should be resolved'
        $rows = @(Get-Content $gapsFile -Encoding UTF8 | ForEach-Object { $_ | ConvertFrom-Json })
        $resolved = @($rows | Where-Object { $_.id -eq 'deps-missing' -and $_.status -eq 'resolved' })
        Eq ($resolved.Count -ge 1) $true 'deps-missing should be resolved'
        Write-Host ("      resolved: " + $resolved[0].id + " @ " + $resolved[0].at)
    }

    Write-Host ''
    Write-Host 'Gap ledger now contains:'
    Get-Content $gapsFile -Encoding UTF8 | ForEach-Object { Write-Host ('  ' + $_) }
    Write-Host ''
    if ($script:failed -gt 0) { Write-Host "Result: FAILED ($script:failed)"; exit 1 }
    Write-Host 'Result: 2/2 passed (closed loop works)'
    Write-Host "Fixture retained: $fixture"
} finally {
    $env:DSH_HOME = $oldHome
    $env:QQ_BRIDGE_ROOT = $oldBridge
    $env:YUSHEN_REPAIR_TEST_HOST_DOWN = $oldBypass
}
