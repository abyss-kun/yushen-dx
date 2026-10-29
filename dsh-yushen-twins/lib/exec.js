// 执行层 v1：只读自动跑，写操作要老板点头，危险默认拒绝（开关开了还要点头）；每次都记账。
// 这是“全能”的第一块砖：不是放开手，是让手可查、可退、可控。

import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { recordAction } from './actionlog.js'
import { tierOf, requestApproval, consumeApproval } from './perm.js'
import { workspace, qqBridgeRoot } from './paths.js'

const READ_PREFIX = [
  'get-childitem', 'dir ', 'ls ', 'get-content', 'type ', 'cat ',
  'get-location', 'pwd', 'where ', 'git status', 'git log', 'git diff', 'git branch',
  'tasklist', 'netstat', 'node --version', 'npm ls', 'npm --version',
]
const WRITE_PREFIX = [
  'new-item', 'mkdir', 'copy-item', 'move-item', 'rename-item',
  'set-content', 'add-content', 'out-file',
]
const DANGER = /\b(del|erase|rmdir|rm|remove-item|format|diskpart|reg|sc|shutdown|taskkill|stop-process|start-process|set-executionpolicy|invoke-webrequest|curl|wget|iwr|iex|invoke-expression)\b/i
const META = /[|;&>`$(){}]/

// 软件内部 = 整个 DSH 生态：工作区、.dsh（含所有插件的数据/配置）、工具目录、插件源码目录。
// 她管插件、往别的插件里收图收字，都算内部；只有装 DSH 的程序目录不算（那会弄坏软件本体）。
const ALLOWED_ROOTS = [
  workspace(),
  qqBridgeRoot() || workspace(),
  path.join(os.homedir(), '.dsh'),
  path.join(os.homedir(), 'Documents', 'deepseek-harness'),
].map((p) => p.toLowerCase())

/** 从命令里抠出所有盘符路径；写操作只能落在这三个根下。 */
function pathsIn(command) {
  return [...String(command || '').matchAll(/[A-Za-z]:\\[^\s"']+/g)].map((m) => m[0].replace(/[),;]+$/, '').toLowerCase())
}
function inAllowedRoot(p) {
  const norm = String(p).replace(/\/+$/, '').toLowerCase()
  return ALLOWED_ROOTS.some((root) => norm === root || norm.startsWith(root + '\\'))
}

function allowDanger() {
  try {
    const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
    return JSON.parse(fs.readFileSync(path.join(home, 'dayu', 'switches.json'), 'utf8')).allowDanger === true
  } catch { return false }
}

function classify(command) {
  const text = String(command || '').trim()
  if (!text) throw new Error('命令不能为空')
  if (META.test(text)) throw new Error('不允许管道/重定向/子表达式：一条一条来')
  if (DANGER.test(text)) return 'danger'
  const low = text.toLowerCase()
  if (READ_PREFIX.some((p) => low.startsWith(p))) return 'read'
  if (WRITE_PREFIX.some((p) => low.startsWith(p))) return 'write'
  throw new Error('不在白名单里：只读或写文件命令可以，其他先说清楚')
}

/** 跑一条命令：
 *  - 软件内部：read 直接跑；write 要点头；danger 要开关+点头；
 *  - 系统级（会动到电脑本身）：先申请权限，老板同意后一次性放行。
 */
export async function runCommand(command, { confirm = '', approvalId = '', reason = '' } = {}) {
  const kind = classify(command)
  let tier = tierOf(command)
  // 写文件：落在她的三个根下 = 软件内部，直接写；写出去 = 系统级，要申请。
  if (kind === 'write') {
    const paths = pathsIn(command)
    if (!paths.length) return { ok: false, error: '写操作要写绝对路径（例如 D:\\... 或 .dsh 下）' }
    const outside = paths.filter((p) => !inAllowedRoot(p))
    if (outside.length) {
      tier = 'system'
      reason = reason || `写到允许目录之外：${outside[0]}`
    }
  }
  let systemApproved = false
  const needsBoss = tier === 'system' || kind === 'danger'
  if (needsBoss) {
    if (kind === 'danger' && !allowDanger()) throw new Error('危险命令：默认拒绝（要开「危险命令」开关）')
    const pass = consumeApproval(approvalId, command)
    if (!pass.ok) {
      const row = requestApproval({ command, reason: reason || (kind === 'danger' ? '危险命令' : '') })
      return { ok: false, needsApproval: true, approval: row, tier, kind, command, note: `要老板批准（申请号 ${row.id}）：${pass.reason}` }
    }
    systemApproved = true // 老板批过，等价于点头
  }
  if (!systemApproved && kind === 'danger') {
    // 走到这里说明危险命令没走批准（理论上不会），保底拒绝。
    throw new Error('危险命令必须老板批准')
  }
  // 写文件在允许的根下直接放行；根外已在上面转成系统级申请。
  // 但如果写的是宿主配置（profiles / cordis.patch.yml / package.json），先自动备份——改错也能退。
  const backups = backupHostConfig(command)
  const started = Date.now()
  const result = await new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', String(command)], { timeout: 30000, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ code: error?.code ?? 0, ok: !error, out: String(stdout || '').slice(0, 4000), err: String(stderr || '').slice(0, 2000) })
    })
  })
  recordAction({ kind: 'exec', path: String(command).slice(0, 160), method: kind, status: result.code, ms: Date.now() - started, ok: result.ok, note: result.ok ? 'ok' : result.err.slice(0, 120) })
  return { ok: result.ok, kind, command, backups, ...result }
}

/** 动宿主配置前先留备份：profiles 下的 yml/json，或任何 cordis.patch.yml / package.json。 */
function backupHostConfig(command) {
  const made = []
  for (const p of pathsIn(command)) {
    const hit = /\\profiles\\/.test(p) || /cordis\.patch\.yml$/.test(p) || /package\.json$/.test(p)
    if (!hit) continue
    try {
      if (!fs.existsSync(p)) continue
      const bak = `${p}.bak-${Date.now()}`
      fs.copyFileSync(p, bak)
      made.push(bak)
    } catch { /* 备份失败就继续，至少记账 */ }
  }
  return made
}
