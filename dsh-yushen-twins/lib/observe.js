// 全知·在场：系统现在是什么样——进程、窗口标题、监听端口、磁盘。
// 只读采集，不弹窗、不改系统；结果进 actions.jsonl，供全知页/助手查。

import { execFile } from 'node:child_process'
import { recordAction } from './actionlog.js'

const PS = (script) => new Promise((resolve) => {
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 20000, windowsHide: true }, (error, stdout, stderr) => {
    try { resolve(JSON.parse(String(stdout || 'null'))) } catch { resolve(null) }
    if (error) { /* 采集失败按空处理 */ }
  })
})

let cache = { at: 0, data: null }
const TTL = 5000

/** 一次采集：不怕多，几个只读命令拼起来。 */
export async function observe({ force = false } = {}) {
  if (!force && cache.data && Date.now() - cache.at < TTL) return cache.data
  const started = Date.now()
  const [procs, ports, drives] = await Promise.all([
    PS("Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object -First 12 Name,Id,MainWindowTitle | ConvertTo-Json -Compress"),
    PS("Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object -First 20 LocalAddress,LocalPort,OwningProcess | ConvertTo-Json -Compress"),
    PS("Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free | ConvertTo-Json -Compress"),
  ])
  const data = {
    at: new Date().toISOString(),
    windows: (Array.isArray(procs) ? procs : procs ? [procs] : []).map((p) => ({ name: p.Name, pid: p.Id, title: String(p.MainWindowTitle || '').slice(0, 80) })),
    ports: (Array.isArray(ports) ? ports : ports ? [ports] : []).map((p) => ({ port: p.LocalPort, pid: p.OwningProcess })),
    drives: (Array.isArray(drives) ? drives : drives ? [drives] : []).map((d) => ({ name: d.Name, freeGB: d.Free ? Math.round(d.Free / 1024 ** 3) : null, usedGB: d.Used ? Math.round(d.Used / 1024 ** 3) : null })),
    ms: Date.now() - started,
  }
  cache = { at: Date.now(), data }
  recordAction({ kind: 'observe', path: 'system', method: 'READ', status: 200, ms: data.ms, ok: true, note: `窗口 ${data.windows.length} / 端口 ${data.ports.length}` })
  return data
}
