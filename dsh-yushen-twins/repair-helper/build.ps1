# 未经代码签名，仅本地构建版。No download, package manager, or runtime installation.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$sourceRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $sourceRoot))
$expectedSource = [IO.Path]::GetFullPath((Join-Path $projectRoot 'repair-helper'))
if ($sourceRoot -ne $expectedSource) { throw 'Unexpected source location' }
$compiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$source = Join-Path $sourceRoot 'YushenRepair.cs'
$manifest = Join-Path $sourceRoot 'app.manifest'
$outDir = [IO.Path]::GetFullPath((Join-Path $projectRoot 'assets\repair-helper'))
$destination = Join-Path $outDir 'YushenRepair.exe'
$history = Join-Path $outDir 'history'
function Assert-NoLinks([string]$Path) {
    $p = [IO.Path]::GetFullPath($Path)
    while ($p) {
        if (Test-Path -LiteralPath $p) {
            $item = Get-Item -LiteralPath $p -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Build path contains a reparse point' }
        }
        $parent = Split-Path -Parent $p
        if ($parent -eq $p) { break }
        $p = $parent
    }
}
if (!(Test-Path -LiteralPath $compiler -PathType Leaf)) { throw 'Required system .NET Framework compiler not found' }
Assert-NoLinks $source
Assert-NoLinks $outDir
Assert-NoLinks $history
Assert-NoLinks $destination
$null = New-Item -ItemType Directory -Path $outDir -Force
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffffffZ') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
# Build to a new explicitly named temporary target; leave existing EXE intact on compiler/test failure.
$candidate = Join-Path $outDir ('YushenRepair.build-' + $stamp + '.exe')
& $compiler /nologo /target:exe /platform:anycpu /optimize+ /utf8output /codepage:65001 ("/out:$candidate") /win32manifest:"$manifest" /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll $source
if ($LASTEXITCODE -ne 0) { throw 'C# compilation failed; existing EXE retained' }
& $candidate --self-test
if ($LASTEXITCODE -ne 0) { throw 'Self-test failed; existing EXE retained' }
if (Test-Path -LiteralPath $destination) {
    $null = New-Item -ItemType Directory -Path $history -Force
    $old = Join-Path $history ('YushenRepair-' + $stamp + '.exe')
    if (Test-Path -LiteralPath $old) { throw 'History collision; refusing overwrite' }
    Copy-Item -LiteralPath $destination -Destination $old
    $oldHash = (Get-FileHash -LiteralPath $old -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText(($old + '.sha256'), "$oldHash  $([IO.Path]::GetFileName($old))`n", [Text.UTF8Encoding]::new($false))
}
Copy-Item -LiteralPath $candidate -Destination $destination -Force
# Candidate is retained as build evidence; never delete paths computed from untrusted input.
$items = @($destination, $source, (Join-Path $sourceRoot 'build.ps1'))
$lines = foreach ($p in $items) {
    $hash = (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()
    $relative = if ($p -eq $destination) { 'YushenRepair.exe' } else { '../../' + $p.Substring($projectRoot.Length + 1).Replace('\','/') }
    "$hash  $relative"
}
$manifest = Join-Path $outDir 'SHA256SUMS.txt'
Assert-NoLinks $manifest
[IO.File]::WriteAllText($manifest, (($lines -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
Write-Host "Built unsigned local helper: $destination"
Write-Host "SHA256 manifest: $manifest"
