$log = 'D:\DSH\大小鱼\鱼神常驻\popup-console.log'
$exe = 'C:\Users\Administrator\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe'
$node = 'C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$capture = 'D:\DSH\大小鱼\鱼神常驻\.tmp\capture-console.mjs'

Write-Host '[1/4] close DSH'
Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

Write-Host '[2/4] start DSH with debug port'
Start-Process -FilePath $exe -ArgumentList '--remote-debugging-port=9222'
Start-Sleep -Seconds 16

Write-Host '[3/4] capture console'
& $node $capture $log

Write-Host '[4/4] close debug DSH and start normally'
Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3
Start-Process -FilePath $exe
Write-Host 'done. log: ' $log
Start-Sleep -Seconds 3
