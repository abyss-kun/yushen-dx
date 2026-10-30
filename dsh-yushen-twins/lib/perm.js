// 权限分层：软件内部随便动；动到系统（可能让电脑不好用）要先申请。
// 申请单：~/.dsh/dayu/approvals.json；老板同意才放行，执行后记账。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const FILE = path.join(DATA, 'approvals.json')

// 会动到“这台电脑本身”的东西：注册表、服务、驱动、系统目录、开关机、网络栈、卸载。
const SYSTEM = [
  /\breg(add|delete|query)?\b/i, /\bsc(\.exe)?\b/i, /\bset-service\b/i, /\bstop-service\b/i, /\bstart-service\b/i,
  /\bbcdedit\b/i, /\bdiskpart\b/i, /\bformat\b/i, /\bdism\b/i, /\bsfc\b/i, /\bnetsh\b/i,
  /\bshutdown\b/i, /\brestart-computer\b/i, /\bstop-computer\b/i, /\btaskkill\b/i, /\bstop-process\b/i,
  /\bset-executionpolicy\b/i, /\bwmic\b/i, /\bicacls\b/i, /\btakeown\b/i, /\bchkdsk\b/i,
  /\bC:\\Windows\b/i, /\bProgram Files\b/i, /\bProgramData\b/i, /^[A-Z]:\\\s*$/i,
]

export function tierOf(command) {
  const text = String(command || '')
  return SYSTEM.some((re) => re.test(text)) ? 'system' : 'app'
}

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return [] }
}
function write(list) {
  fs.mkdirSync(DATA, { recursive: true })
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(list.slice(0, 500), null, 2), 'utf8')
  fs.renameSync(tmp, FILE)
}

export function listApprovals(limit = 20) {
  return read().slice(0, limit)
}

export function getApproval(id) {
  return read().find((a) => a.id === id) || null
}

/** 申请一条系统级权限：同一命令 10 分钟内不重复开单。 */
export function requestApproval({ command, reason = '', who = '大鱼' } = {}) {
  const text = String(command || '').trim()
  if (!text) throw new Error('command 不能为空')
  const list = read()
  const dup = list.find((a) => a.command === text && a.status === 'pending' && Date.now() - Date.parse(a.at) < 10 * 60 * 1000)
  if (dup) return dup
  const row = {
    id: `ap-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
    at: new Date().toISOString(),
    who,
    command: text.slice(0, 500),
    reason: String(reason || '').slice(0, 300),
    tier: tierOf(text),
    status: 'pending',
    decidedAt: '',
  }
  list.unshift(row)
  write(list)
  return row
}

/** 老板表态：同意 / 拒绝。 */
export function decideApproval(id, approve) {
  const list = read()
  const row = list.find((a) => a.id === String(id))
  if (!row) throw new Error(`没有这张权限申请：${id}`)
  row.status = approve ? 'approved' : 'denied'
  row.decidedAt = new Date().toISOString()
  write(list)
  return row
}

/** 放行检查：已同意、同一命令、一次性（用掉就作废）。 */
export function consumeApproval(id, command) {
  const list = read()
  const row = list.find((a) => a.id === String(id))
  if (!row) return { ok: false, reason: '没有这张申请' }
  if (row.status !== 'approved') return { ok: false, reason: `申请状态是 ${row.status}` }
  if (String(row.command) !== String(command)) return { ok: false, reason: '申请的命令和这次不一致' }
  row.status = 'used'
  row.usedAt = new Date().toISOString()
  write(list)
  return { ok: true, row }
}
