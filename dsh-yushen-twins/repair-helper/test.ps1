# Yushen repair helper - offline integration tests (unsigned local build).
#
# Everything runs in a temp fixture; never reads the real DSH_HOME or the real bridge.
# Covers: diagnosis classification / crash-evidence checks / the three whitelisted
# repair actions / refusal paths / privacy (no paths, PIDs or sentinels leaked).
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads BOM-less .ps1 as ANSI,
# so non-ASCII source text turns into mojibake and breaks quoting.
$ErrorActionPreference = 'Stop'
$exe = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\assets\repair-helper\YushenRepair.exe'))
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('yushen-helper-test-' + [guid]::NewGuid().ToString('N'))
$oldHome = $env:DSH_HOME
$oldBridge = $env:QQ_BRIDGE_ROOT
$oldBypass = $env:YUSHEN_REPAIR_TEST_HOST_DOWN
$oldAppData = $env:APPDATA
$bridge = Join-Path $fixture 'bridge'
$profile = Join-Path $fixture 'profiles\desktop'
$null = New-Item -ItemType Directory -Path (Join-Path $fixture 'dayu\repair') -Force
$null = New-Item -ItemType Directory -Path (Join-Path $bridge 'state') -Force
$null = New-Item -ItemType Directory -Path $profile -Force
$env:DSH_HOME = $fixture
$env:QQ_BRIDGE_ROOT = $bridge
$env:YUSHEN_REPAIR_TEST_HOST_DOWN = '1'

$script:failed = 0
$script:total = 0
function Check([string]$Name, [scriptblock]$Body) {
    $script:total++
    try { & $Body; Write-Host "PASS  $Name" }
    catch { $script:failed++; Write-Host "FAIL  $Name  -> $($_.Exception.Message)" }
}
function Eq($Actual, $Expected, [string]$Why) {
    if ("$Actual" -ne "$Expected") { throw "$Why (got=$Actual want=$Expected)" }
}
function Utc([double]$MinutesAgo) {
    return [DateTime]::UtcNow.AddMinutes(-$MinutesAgo).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
}
function WriteJson([string]$Path, $Value) {
    $dir = Split-Path -Parent $Path
    if (!(Test-Path $dir)) { $null = New-Item -ItemType Directory -Path $dir -Force }
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
}
function WriteText([string]$Path, [string]$Text) {
    [IO.File]::WriteAllText($Path, $Text, [Text.UTF8Encoding]::new($false))
}
function Report {
    $raw = (& $exe --diagnose) -join "`n"
    if ($LASTEXITCODE -ne 0) { throw 'diagnose failed' }
    if ($raw.Contains('TOPSECRET') -or $raw.Contains($fixture)) { throw 'Privacy leak' }
    return ($raw | ConvertFrom-Json)
}
function ResetScenario {
    Remove-Item (Join-Path $fixture 'dayu\repair\state.json') -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $fixture 'dayu\boot.json') -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $fixture 'dayu\repair\active.json') -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $profile 'package.json') -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $bridge 'state\STOP.flag') -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $bridge 'state\bridge.lock') -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $fixture 'dayu\repair\actions.jsonl') -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $fixture 'dayu\repair\gaps.jsonl') -ErrorAction SilentlyContinue
}
function RunExe([string[]]$ArgList) {
    # NOTE: do not name this parameter $Args - it collides with PowerShell's automatic
    # variable, the splat becomes empty, the helper opens its GUI and the test hangs.
    # Also avoid native-stderr; PS 5.1 turns it into a terminating error under Stop.
    $so = Join-Path $fixture 'stdout.txt'
    $se = Join-Path $fixture 'stderr.txt'
    $p = Start-Process -FilePath $exe -ArgumentList $ArgList -Wait -PassThru -NoNewWindow -RedirectStandardOutput $so -RedirectStandardError $se
    $out = ''
    if (Test-Path $so) { $out = [IO.File]::ReadAllText($so) }
    $json = $null
    try { if ($out.Trim()) { $json = $out | ConvertFrom-Json } } catch { }
    return [pscustomobject]@{ code = $p.ExitCode; text = $out; json = $json }
}

$deadPid = 2147483000
$self = Get-Process -Id $PID
$selfStart = $self.StartTime.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
# some cases put active.at a few seconds after process start; that must be in the past, so wait first
$age = ([DateTime]::UtcNow - $self.StartTime.ToUniversalTime()).TotalSeconds
if ($age -lt 8) { Start-Sleep -Seconds ([int][math]::Ceiling(8 - $age)) }

try {
    Check 'self-test passes' {
        & $exe --self-test | Out-Null
        Eq $LASTEXITCODE 0 'self-test exit'
    }

    Check 'empty fixture -> unknown, no guessing' {
        ResetScenario
        $r = Report
        Eq $r.classification 'unknown' 'class'
        Eq $r.checks.profileJson 'missing' 'profileJson'
        Eq $r.checks.bridgeDeps 'missing' 'bridgeDeps'
        Eq $r.checks.stopFlag 'absent' 'stopFlag'
        Eq $r.checks.bridgeLock 'absent' 'bridgeLock'
    }

    Check 'crash-suspected: start record, process gone, no exit marker' {
        ResetScenario
        WriteJson (Join-Path $fixture 'dayu\repair\state.json') @{ version = 1; sessions = @{ t = @{ pid = $deadPid; at = (Utc 5); lastObservedAt = (Utc 2); status = 'running' } }; credential = 'TOPSECRET' }
        WriteJson (Join-Path $fixture 'dayu\boot.json') @{ at = (Utc 5); pid = $deadPid; node = 'C:\invalid.exe' }
        $r = Report
        Eq $r.classification 'crash-suspected' 'class'
        Eq (@($r.advice).Count -ge 1) $true 'advice should not be empty'
    }

    Check 'exit markers: manual / automatic distinguished' {
        ResetScenario
        WriteJson (Join-Path $fixture 'dayu\repair\state.json') @{ version = 1; sessions = @{ t = @{ pid = $deadPid; at = (Utc 5); lastObservedAt = (Utc 2); status = 'running' } } }
        WriteJson (Join-Path $fixture 'dayu\boot.json') @{ at = (Utc 5); pid = $deadPid; node = 'C:\invalid.exe' }
        $active = @{ version = 1; pid = $deadPid; at = (Utc 5); heartbeat = (Utc 2); processStartedAt = (Utc 6); execPath = 'C:\invalid.exe'; status = 'manual-exit'; endedAt = (Utc 1) }
        WriteJson (Join-Path $fixture 'dayu\repair\active.json') $active
        Eq (Report).classification 'manual' 'manual'
        $active.status = 'automatic-exit'
        WriteJson (Join-Path $fixture 'dayu\repair\active.json') $active
        Eq (Report).classification 'automatic' 'automatic'
    }

    Check 'alive: process identity verified (the bug that used to report unknown)' {
        ResetScenario
        $st = $self.StartTime.ToUniversalTime()
        WriteJson (Join-Path $fixture 'dayu\repair\state.json') @{ version = 1; sessions = @{ t = @{ pid = $PID; at = (Utc 5); lastObservedAt = (Utc 0.2); status = 'running' } } }
        WriteJson (Join-Path $fixture 'dayu\boot.json') @{ at = (Utc 5); pid = $PID; node = $self.Path }
        $active = @{ version = 1; pid = $PID; at = $st.AddSeconds(1).ToString('yyyy-MM-ddTHH:mm:ss.fffZ'); heartbeat = (Utc 0); processStartedAt = $selfStart; execPath = $self.Path; status = 'running' }
        WriteJson (Join-Path $fixture 'dayu\repair\active.json') $active
        $r = Report
        Eq $r.processIdentity 'alive-verified' 'identity'
        Eq $r.classification 'alive' 'class'
    }

    Check '2.5s start-time skew still counts as alive (real-world record lag)' {
        ResetScenario
        $st = $self.StartTime.ToUniversalTime()
        $skewed = $st.AddSeconds(2.5).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        WriteJson (Join-Path $fixture 'dayu\repair\state.json') @{ version = 1; sessions = @{ t = @{ pid = $PID; at = (Utc 5); lastObservedAt = (Utc 0.2); status = 'running' } } }
        WriteJson (Join-Path $fixture 'dayu\boot.json') @{ at = (Utc 5); pid = $PID; node = $self.Path }
        WriteJson (Join-Path $fixture 'dayu\repair\active.json') @{ version = 1; pid = $PID; at = $st.AddSeconds(6).ToString('yyyy-MM-ddTHH:mm:ss.fffZ'); heartbeat = (Utc 0); processStartedAt = $skewed; execPath = $self.Path; status = 'running' }
        $r = Report
        Eq $r.processIdentity 'alive-verified' 'identity'
        Eq $r.classification 'alive' 'class'
    }

    Check 'PID reuse / wrong path -> running-unverified, never claims alive' {
        ResetScenario
        $st = $self.StartTime.ToUniversalTime()
        WriteJson (Join-Path $fixture 'dayu\repair\state.json') @{ version = 1; sessions = @{ t = @{ pid = $PID; at = (Utc 5); lastObservedAt = (Utc 0.2); status = 'running' } } }
        WriteJson (Join-Path $fixture 'dayu\boot.json') @{ at = (Utc 5); pid = $PID; node = 'C:\wrong.exe' }
        WriteJson (Join-Path $fixture 'dayu\repair\active.json') @{ version = 1; pid = $PID; at = $st.AddSeconds(1).ToString('yyyy-MM-ddTHH:mm:ss.fffZ'); heartbeat = (Utc 0); processStartedAt = $selfStart; execPath = 'C:\wrong.exe'; status = 'running' }
        $r = Report
        Eq $r.processIdentity 'alive-unverified' 'identity'
        Eq $r.classification 'running-unverified' 'class'
    }

    Check 'broken active.json -> invalid-json, no crash' {
        ResetScenario
        WriteText (Join-Path $fixture 'dayu\repair\active.json') '{BROKEN TOPSECRET'
        $r = Report
        Eq $r.activeRead 'invalid-json' 'activeRead'
    }

    Check 'profile check: ok/bundles vs broken reported separately' {
        ResetScenario
        WriteJson (Join-Path $profile 'package.json') @{ dsh = @{ profile = @{ bundles = @('a', 'b', 'c') } }; dependencies = @{ x = '1' } }
        $r = Report
        Eq $r.checks.profileJson 'ok' 'profileJson ok'
        Eq $r.checks.bundles 3 'bundles'
        WriteText (Join-Path $profile 'package.json') '{ broken'
        $r = Report
        Eq $r.checks.profileJson 'broken' 'profileJson broken'
        Eq (@($r.advice).Count -ge 2) $true 'advice should mention the broken profile'
    }

    Check 'bridge checks: STOP.flag / stale lock / live lock' {
        ResetScenario
        WriteText (Join-Path $bridge 'state\STOP.flag') 'stop'
        WriteText (Join-Path $bridge 'state\bridge.lock') "$deadPid"
        $r = Report
        Eq $r.checks.stopFlag 'present' 'stopFlag'
        Eq $r.checks.bridgeLock 'yes' 'dead lock should be yes'
        WriteText (Join-Path $bridge 'state\bridge.lock') "$PID"
        Eq (Report).checks.bridgeLock 'no' 'live lock should be no'
    }

    Check '--fix-safe: stale lock + STOP.flag removed, audit written' {
        ResetScenario
        WriteText (Join-Path $bridge 'state\STOP.flag') 'stop'
        WriteText (Join-Path $bridge 'state\bridge.lock') "$deadPid"
        $r = RunExe @('--fix-safe')
        Eq $r.code 0 'exit'
        Eq (($r.json.details -join '|').Contains('ok')) $true 'details should contain ok'
        Eq (Test-Path (Join-Path $bridge 'state\STOP.flag')) $false 'STOP.flag should be gone'
        Eq (Test-Path (Join-Path $bridge 'state\bridge.lock')) $false 'lock should be gone'
        $audit = Join-Path $fixture 'dayu\repair\actions.jsonl'
        Eq (Test-Path $audit) $true 'audit should exist'
        Eq ((Get-Content $audit).Count -ge 2) $true 'audit needs two lines'
    }

    Check '--fix-safe: refuses while bridge is alive, touches nothing' {
        ResetScenario
        WriteText (Join-Path $bridge 'state\STOP.flag') 'stop'
        WriteText (Join-Path $bridge 'state\bridge.lock') "$PID"
        $r = RunExe @('--fix-safe')
        Eq (($r.json.details -join '|').Contains('refused-bridge-running')) $true 'should refuse'
        Eq (Test-Path (Join-Path $bridge 'state\STOP.flag')) $true 'STOP.flag must stay'
        Eq (Test-Path (Join-Path $bridge 'state\bridge.lock')) $true 'lock must stay'
    }

    Check 'restore: without --confirm exits 2' {
        ResetScenario
        $r = RunExe @('--restore-profile', (Join-Path $fixture 'nope.json'))
        Eq $r.code 2 'usage'
    }

    Check 'restore: healthy target is refused' {
        ResetScenario
        WriteJson (Join-Path $profile 'package.json') @{ dsh = @{ profile = @{ bundles = @('a') } } }
        $bak = Join-Path $fixture 'good.json'
        WriteJson $bak @{ dsh = @{ profile = @{ bundles = @('a') } } }
        $r = RunExe @('--restore-profile', $bak, '--confirm')
        Eq $r.code 1 'refused'
        Eq $r.json.detail 'refused-target-not-broken' 'detail'
    }

    Check 'restore: backup that is not a profile is refused' {
        ResetScenario
        WriteText (Join-Path $profile 'package.json') '{ broken'
        $bak = Join-Path $fixture 'not-a-profile.json'
        WriteJson $bak @{ hello = 'world' }
        $r = RunExe @('--restore-profile', $bak, '--confirm')
        Eq $r.code 1 'refused'
        Eq $r.json.detail 'backup-not-a-profile' 'detail'
        Eq (Get-Content (Join-Path $profile 'package.json') -Raw) '{ broken' 'target must stay untouched'
    }

    Check 'restore: healthy backup -> overwrite, verify, keep original, audit' {
        ResetScenario
        WriteText (Join-Path $profile 'package.json') '{ broken'
        $bak = Join-Path $fixture 'good.json'
        WriteJson $bak @{ dsh = @{ profile = @{ bundles = @('@deepseek-ai/dsh-base', 'dsh-yushen-twins') } }; dependencies = @{ 'dsh-yushen-twins' = 'file:.' } }
        $r = RunExe @('--restore-profile', $bak, '--confirm')
        Eq $r.code 0 'ok'
        Eq $r.json.result 'ok' 'result'
        $after = Get-Content (Join-Path $profile 'package.json') -Raw | ConvertFrom-Json
        Eq $after.dsh.profile.bundles.Count 2 'bundles should be restored'
        $backups = Join-Path $fixture 'dayu\repair\backups'
        Eq (Test-Path $backups) $true 'backup dir should exist'
        $kept = Get-ChildItem $backups -Recurse -Filter 'package.json'
        Eq ($kept.Count -ge 1) $true 'original should be kept'
        Eq ((Get-Content (Join-Path $fixture 'dayu\repair\actions.jsonl') -Raw).Contains('restore-profile-json')) $true 'audit should record it'
    }

    Check 'restore: host running must be refused (bypass off)' {
        $hostProc = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
        if (-not $hostProc) { return } # nothing to verify when the host is not running
        ResetScenario
        WriteText (Join-Path $profile 'package.json') '{ broken'
        $bak = Join-Path $fixture 'good.json'
        WriteJson $bak @{ dsh = @{ profile = @{ bundles = @('a') } } }
        $env:YUSHEN_REPAIR_TEST_HOST_DOWN = '0'
        try {
            $r = RunExe @('--restore-profile', $bak, '--confirm')
            Eq $r.code 1 'refused'
            Eq $r.json.detail 'refused-host-running' 'detail'
            Eq (Get-Content (Join-Path $profile 'package.json') -Raw) '{ broken' 'target must stay untouched'
        } finally { $env:YUSHEN_REPAIR_TEST_HOST_DOWN = '1' }
    }

    Check 'auth crash: signature in the newest crash log is detected' {
        ResetScenario
        $appdata = Join-Path $fixture 'appdata'
        $logs = Join-Path $appdata '@deepseek-ai\dsh-desktop\logs'
        $null = New-Item -ItemType Directory -Path $logs -Force
        WriteText (Join-Path $logs 'crash-2026-10-24T13-09-43-857Z-host.log') 'Web authentication failed: 401'
        $env:APPDATA = $appdata
        try {
            $r = Report
            Eq $r.checks.authCrash 'suspected' 'authCrash'
            Eq $r.checks.shellCache 'missing' 'shellCache (no Network dir in fixture)'
        } finally { $env:APPDATA = $oldAppData }
    }

    Check 'auth crash: a log older than this host run is stale, not suspected' {
        $hostProc = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
        if (-not $hostProc) { return } # nothing to compare when no host is running
        ResetScenario
        $appdata = Join-Path $fixture 'appdata'
        $logs = Join-Path $appdata '@deepseek-ai\dsh-desktop\logs'
        $null = New-Item -ItemType Directory -Path $logs -Force
        $log = Join-Path $logs 'crash-2026-10-24T13-09-43-857Z-host.log'
        WriteText $log 'Web authentication failed: 401'
        $hostStart = $null
        foreach ($hp in $hostProc) {
            try { $s = $hp.StartTime.ToUniversalTime(); if (-not $hostStart -or $s -lt $hostStart) { $hostStart = $s } }
            catch { } # electron child processes come and go while we enumerate
        }
        if (-not $hostStart) { return }
        [IO.File]::SetLastWriteTimeUtc($log, $hostStart.AddHours(-1))
        $env:APPDATA = $appdata
        try { Eq (Report).checks.authCrash 'stale' 'authCrash' }
        finally { $env:APPDATA = $oldAppData }
    }

    Check 'reset-auth: without --confirm exits 2' {
        ResetScenario
        Eq (RunExe @('--reset-auth')).code 2 'usage'
    }

    Check 'reset-auth: clears shell cache, renames credentials, keeps backups' {
        ResetScenario
        $appdata = Join-Path $fixture 'appdata'
        $shell = Join-Path $appdata '@deepseek-ai\dsh-desktop'
        $null = New-Item -ItemType Directory -Path (Join-Path $shell 'Network') -Force
        $null = New-Item -ItemType Directory -Path (Join-Path $shell 'Session Storage') -Force
        WriteText (Join-Path $shell 'Network\Cookies') 'cookie-bytes'
        WriteText (Join-Path $shell 'lockfile') 'lock'
        $cred = Join-Path $fixture '.credentials.yaml'
        WriteText $cred 'token: fixture'
        $env:APPDATA = $appdata
        try {
            $r = RunExe @('--reset-auth', '--confirm')
            Eq $r.code 0 'exit'
            Eq $r.json.result 'ok' 'result'
            Eq (Test-Path (Join-Path $shell 'Network')) $false 'Network should be removed'
            Eq (Test-Path (Join-Path $shell 'Session Storage')) $false 'Session Storage should be removed'
            Eq (Test-Path (Join-Path $shell 'lockfile')) $false 'lockfile should be removed'
            Eq (Test-Path $cred) $false 'credentials should be renamed'
            Eq (@(Get-ChildItem $fixture -Filter '.credentials.yaml.bak-*').Count) 1 'one .bak should remain'
            $bakDir = Get-ChildItem (Join-Path $fixture 'dayu\repair\backups') -Directory -Filter '*-auth'
            Eq ($bakDir.Count -ge 1) $true 'backup dir should exist'
            Eq (Test-Path (Join-Path $bakDir[0].FullName 'Network')) $true 'backup should contain Network'
            Eq (Test-Path (Join-Path $bakDir[0].FullName '.credentials.yaml')) $true 'backup should contain credentials'
            Eq ((Get-Content (Join-Path $fixture 'dayu\repair\actions.jsonl') -Raw).Contains('reset-auth')) $true 'audit should record it'
        } finally { $env:APPDATA = $oldAppData }
    }

    Check 'reset-auth: refuses while the host is running (bypass off)' {
        $hostProc = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
        if (-not $hostProc) { return }
        ResetScenario
        $appdata = Join-Path $fixture 'appdata'
        $shell = Join-Path $appdata '@deepseek-ai\dsh-desktop'
        $null = New-Item -ItemType Directory -Path (Join-Path $shell 'Network') -Force
        $env:APPDATA = $appdata
        $env:YUSHEN_REPAIR_TEST_HOST_DOWN = '0'
        try {
            $r = RunExe @('--reset-auth', '--confirm')
            Eq $r.code 1 'refused'
            Eq $r.json.detail 'refused-host-running' 'detail'
            Eq (Test-Path (Join-Path $shell 'Network')) $true 'Network must stay'
        } finally {
            $env:APPDATA = $oldAppData
            $env:YUSHEN_REPAIR_TEST_HOST_DOWN = '1'
        }
    }

    Check 'plan: availability follows the findings, and it changes nothing' {
        ResetScenario
        $plan = RunExe @('--plan')
        Eq $plan.code 0 'exit'
        $byId = @{}
        foreach ($item in $plan.json.plan) { $byId[$item.id] = $item }
        Eq $byId['remove-stop-flag'].available $false 'no stop flag in fixture'
        Eq $byId['restore-profile-json'].available $false 'profile is missing'

        WriteText (Join-Path $bridge 'state\STOP.flag') 'stop'
        WriteText (Join-Path $bridge 'state\bridge.lock') "$deadPid"
        WriteText (Join-Path $profile 'package.json') '{ broken'
        $plan2 = RunExe @('--plan')
        $byId2 = @{}
        foreach ($item in $plan2.json.plan) { $byId2[$item.id] = $item }
        Eq $byId2['remove-stop-flag'].available $true 'stop flag present + dead lock'
        Eq $byId2['remove-stale-lock'].available $true 'stale lock'
        Eq $byId2['restore-profile-json'].available $true 'broken profile + host-down bypass'
        Eq $byId2['reset-auth'].available $false 'authCrash should not be suspected here'
        # plan 只算不做
        Eq (Test-Path (Join-Path $bridge 'state\STOP.flag')) $true 'plan must not touch files'
        Eq (Get-Content (Join-Path $profile 'package.json') -Raw) '{ broken' 'plan must not touch files'
    }

    Check 'fix: without --confirm exits 2' {
        ResetScenario
        Eq (RunExe @('--fix')).code 2 'usage'
    }

    Check 'fix: runs what the findings justify and skips the rest' {
        ResetScenario
        $appdata = Join-Path $fixture 'appdata'
        $shell = Join-Path $appdata '@deepseek-ai\dsh-desktop'
        $logs = Join-Path $shell 'logs'
        $null = New-Item -ItemType Directory -Path $logs -Force
        $null = New-Item -ItemType Directory -Path (Join-Path $shell 'Network') -Force
        WriteText (Join-Path $logs 'crash-2026-10-25T00-00-00-000Z-host.log') 'Web authentication failed: 401'
        $cred = Join-Path $fixture '.credentials.yaml'
        WriteText $cred 'token: fixture'
        WriteText (Join-Path $bridge 'state\STOP.flag') 'stop'
        WriteText (Join-Path $bridge 'state\bridge.lock') "$deadPid"
        WriteText (Join-Path $profile 'package.json') '{ broken'
        $env:APPDATA = $appdata
        try {
            $r = RunExe @('--fix', '--confirm')
            Eq $r.code 0 'exit'
            Eq $r.json.action 'fix' 'action'
            $byId = @{}
            foreach ($row in $r.json.results) { $byId[$row.id] = $row }
            Eq $byId['remove-stop-flag'].result 'ok' 'stop flag fixed'
            Eq $byId['remove-stale-lock'].result 'ok' 'stale lock fixed'
            Eq $byId['reset-auth'].result 'ok' 'auth reset'
            Eq $byId['restore-profile-json'].result 'skipped' 'restore needs backup selection'
            Eq (Test-Path (Join-Path $bridge 'state\STOP.flag')) $false 'stop flag gone'
            Eq (Test-Path (Join-Path $bridge 'state\bridge.lock')) $false 'lock gone'
            Eq (Test-Path (Join-Path $shell 'Network')) $false 'shell cache gone'
            Eq (Test-Path $cred) $false 'credentials renamed'
            Eq (Get-Content (Join-Path $profile 'package.json') -Raw) '{ broken' 'profile untouched by --fix'
        } finally { $env:APPDATA = $oldAppData }
    }

    Check 'fix: on a healthy fixture everything is skipped and nothing is written' {
        ResetScenario
        $r = RunExe @('--fix', '--confirm')
        Eq $r.code 0 'exit'
        foreach ($row in $r.json.results) { Eq $row.result 'skipped' ($row.id + ' should be skipped') }
        Eq (Test-Path (Join-Path $fixture 'dayu\repair\actions.jsonl')) $false 'no audit on a no-op run'
    }

    Check 'findings: a healthy fixture matches no FIXABLE fault' {
        ResetScenario
        # 虚拟显示器/灯效是整机状态，不受 fixture 隔离；它们只报告、不该可修。
        foreach ($f in (Report).findings) { Eq $f.fixable $false ($f.id + ' must be report-only in a healthy fixture') }
    }

    Check 'findings: known faults carry a cause, evidence and fixability' {
        ResetScenario
        $appdata = Join-Path $fixture 'appdata'
        $logs = Join-Path $appdata '@deepseek-ai\dsh-desktop\logs'
        $null = New-Item -ItemType Directory -Path $logs -Force
        WriteText (Join-Path $logs 'crash-2026-10-25T00-00-00-000Z-host.log') 'Web authentication failed: 401'
        WriteText (Join-Path $bridge 'state\STOP.flag') 'stop'
        $env:APPDATA = $appdata
        try {
            $r = Report
            $byId = @{}
            foreach ($f in $r.findings) { $byId[$f.id] = $f }
            Eq $byId['auth-loop'].fixable $true 'auth loop is fixable'
            Eq $byId['stop-flag'].fixable $true 'stop flag is fixable'
            Eq ([bool]$byId['stop-flag'].cause) $true 'cause text present'
            Eq ([bool]$byId['stop-flag'].evidence) $true 'evidence text present'
        } finally { $env:APPDATA = $oldAppData }
    }

    Check 'privacy: full state is included but credential-like keys are redacted' {
        ResetScenario
        WriteJson (Join-Path $fixture 'dayu\repair\state.json') @{ version = 1; sessions = @{ t = @{ pid = $deadPid; at = (Utc 5); lastObservedAt = (Utc 2); status = 'running' } }; credential = 'TOPSECRET'; token = 'TOPSECRET' }
        $raw = (& $exe --diagnose) -join "`n"
        if ($raw.Contains('TOPSECRET')) { throw 'sentinel leaked' }
        if (-not $raw.Contains('***')) { throw 'redaction marker missing' }
        if (-not $raw.Contains('"state"')) { throw 'full state should be present' }
    }

    Check 'privacy: diagnose never leaks paths / PID' {
        ResetScenario
        WriteJson (Join-Path $fixture 'dayu\repair\state.json') @{ version = 1; sessions = @{ t = @{ pid = $deadPid; at = (Utc 5); lastObservedAt = (Utc 2); status = 'running' } }; credential = 'TOPSECRET' }
        $raw = (& $exe --diagnose) -join "`n"
        if ($raw.Contains('TOPSECRET')) { throw 'sentinel leaked' }
        if ($raw.Contains($fixture)) { throw 'fixture path leaked' }
        if ($raw.Contains("$deadPid")) { throw 'pid leaked' }
        if ($raw.Contains('invalid.exe')) { throw 'executable path leaked' }
    }

    Write-Host ''
    Write-Host ("Integration: {0}/{1} passed" -f ($script:total - $script:failed), $script:total)
    Write-Host "Synthetic fixture retained (no user data): $fixture"
    if ($script:failed -gt 0) { exit 1 }
} finally {
    $env:DSH_HOME = $oldHome
    $env:QQ_BRIDGE_ROOT = $oldBridge
    $env:YUSHEN_REPAIR_TEST_HOST_DOWN = $oldBypass
    $env:APPDATA = $oldAppData
}
