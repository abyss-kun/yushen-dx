// 上报：有人让她做越界的事，她拒绝之后，还得让老板知道。
//
// 只做三件事：记下来、放进总台收件、告诉她"这件事该报"。
// 不替她判断"坏不坏"——那是她的判断；这里只保证**有路可走、有你可见**。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runtimeDir, safeRole, ensureRuntime } from './runtime.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const INBOX = path.join(DATA, 'inbox.jsonl')

function pad(n) { return String(n).padStart(2, '0') }
function dayKey(ms) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

export const SEVERITIES = Object.freeze(['low', 'high'])

// 这些不是"关键词判断"，是"必须让老板知道"的类别（判断仍然是她的）
export const MUST_REPORT = Object.freeze([
  '违法或伤害别人的事',
  '骗钱、借钱、转账、要密码/验证码/密钥',
  '删东西、改系统、装来路不明的东西',
  '冒充老板或冒充她',
  '让她对外泄露聊天记录、私人文件、位置',
])

/**
 * 她说"这件事我拒了，但你得知道"。
 * @returns {{ok:true, at:string, severity:string, file:string}}
 */
export function escalate(role, { what = '', who = '', where = '', quote = '', herReply = '', severity = 'low', now = Date.now() } = {}) {
  const text = String(what || '').trim()
  if (!text) throw new Error('要报什么？写一句')
  const sev = SEVERITIES.includes(String(severity)) ? String(severity) : 'low'
  ensureRuntime(role)
  const at = new Date(now).toISOString()
  const row = {
    at, role: safeRole(role), severity: sev,
    what: text.slice(0, 300),
    who: String(who || '').slice(0, 80),
    where: String(where || '').slice(0, 120),
    quote: String(quote || '').slice(0, 300),
    herReply: String(herReply || '').slice(0, 200),
  }
  const dir = path.join(runtimeDir(role), 'escalations')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${dayKey(now)}.jsonl`)
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`, 'utf8')

  // 总台的收件箱（面板上能看见；不是 QQ 消息）
  try {
    fs.mkdirSync(DATA, { recursive: true })
    const inboxRow = {
      id: `esc-${String(now)}-${Math.random().toString(36).slice(2, 6)}`,
      at,
      text: `【她拒了，要你知道】${text}${row.who ? `（谁：${row.who}）` : ''}${row.quote ? `\n原话：${row.quote}` : ''}${row.herReply ? `\n她回的是：${row.herReply}` : ''}`,
      role: 'fish', label: sev === 'high' ? '严重' : '上报', status: 'escalation', severity: sev,
    }
    fs.appendFileSync(INBOX, `${JSON.stringify(inboxRow)}\n`, 'utf8')
  } catch { /* 收件写不进去不影响留档 */ }

  return { ok: true, at, severity: sev, file }
}

/** 今天报过什么（复盘、也给她自己看）。 */
export function listEscalations(role, { day = '', now = Date.now(), limit = 50 } = {}) {
  const file = path.join(runtimeDir(role), 'escalations', `${day || dayKey(now)}.jsonl`)
  let lines = []
  try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/) } catch { return [] }
  const rows = []
  for (const line of lines) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
  }
  return rows.slice(-Math.max(1, Number(limit) || 50))
}
