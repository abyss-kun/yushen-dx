// 手册发放：她们是签发的人——发什么、发给谁、什么任务、到什么时候，都留底。
//
// 2026-10-27 定：先读先守先接上（以身作则），自己没接上鱼神就不签发。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { runtimeDir, ensureRuntime } from './runtime.js'
import { requirePlugged } from './plug.js'

function file(role) { return path.join(runtimeDir(role), 'issued.jsonl') }

/**
 * 签发一本手册（按岗位/任务，不是通稿）。
 * @param {{to:string, task?:string, chapters?:string[], topics?:string[], expiresAt?:number|string, now?:number}} v
 */
export function issueHandbook(issuer, { to = '', task = '', chapters = [], topics = [], expiresAt = 0, now = Date.now() } = {}) {
  const target = String(to || '').trim()
  if (!target) throw new Error('发给谁？（岗位/会话/插件）')
  // 以身作则：自己没接上鱼神，不发
  requirePlugged(issuer, { now })
  ensureRuntime(issuer)
  const exp = typeof expiresAt === 'number' ? expiresAt : Date.parse(String(expiresAt || '')) || 0
  const row = {
    id: `h-${String(now)}-${crypto.randomBytes(2).toString('hex')}`,
    at: new Date(now).toISOString(),
    issuer,
    to: target.slice(0, 60),
    task: String(task || '').slice(0, 120),
    chapters: (Array.isArray(chapters) ? chapters : []).map((c) => String(c).slice(0, 40)).slice(0, 12),
    topics: (Array.isArray(topics) ? topics : []).map((t) => String(t).slice(0, 40)).slice(0, 12),
    expiresAt: exp ? new Date(exp).toISOString() : '',
    status: 'issued',
  }
  fs.mkdirSync(path.dirname(file(issuer)), { recursive: true })
  fs.appendFileSync(file(issuer), `${JSON.stringify(row)}\n`, 'utf8')
  return row
}

/** 谁给这个岗位签发过、还没过期的那本（跨角色找，取最新）。 */
export function activeIssuanceFor(target, { now = Date.now() } = {}) {
  const t = String(target || '').trim()
  if (!t) return null
  let roles = []
  try { roles = fs.readdirSync(path.dirname(runtimeDir(t))) } catch { roles = [] }
  let best = null
  for (const r of roles) {
    let lines = []
    try { lines = fs.readFileSync(file(r), 'utf8').split(/\r?\n/) } catch { continue }
    for (const line of lines) {
      if (!line.trim()) continue
      let row = null
      try { row = JSON.parse(line) } catch { continue }
      if (row.to !== t) continue
      if (row.expiresAt && Date.parse(row.expiresAt) <= now) continue
      if (!best || String(row.at) > String(best.at)) best = row
    }
  }
  return best
}

export function listIssued(issuer, { limit = 20, now = Date.now() } = {}) {
  let lines = []
  try { lines = fs.readFileSync(file(issuer), 'utf8').split(/\r?\n/) } catch { return [] }
  const rows = []
  for (const line of lines) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
  }
  return rows.slice(-Math.max(1, Number(limit) || 20)).map((r) => ({ ...r, expired: Boolean(r.expiresAt) && Date.parse(r.expiresAt) <= now }))
}

/** 注入：你今天签发过什么、有没有过期的。 */
export function issuedLine(role, { now = Date.now() } = {}) {
  const rows = listIssued(role, { limit: 5, now })
  if (!rows.length) return ''
  const expired = rows.filter((r) => r.expired)
  return `## 你签发的手册\n${rows.map((r) => `- 给 ${r.to}${r.task ? `（任务：${r.task}）` : ''}${r.expiresAt ? `，到 ${new Date(r.expiresAt).toLocaleDateString('zh-CN')}` : ''}`).join('\n')}\n${expired.length ? `有 ${expired.length} 本过期了，该续或该收。` : '都还在有效期内。'}`.trim()
}

// ── 会话发放台账（2026-10-30）────────────────────────────────────────
// 手册那本记的是“签给谁”；这里记的是“这条会话自己收到了什么”：
// 预设（决定工具挂没挂）、手册章、目录入口。发不出去也要记一条失败。
function sessionIssueFile(role) { return path.join(runtimeDir(role), 'session-issue.json') }

export function recordSessionIssue(role, { sessionId = '', preset = '', tools = 0, handbook = [], ok = true, note = '' } = {}) {
  try {
    ensureRuntime(role)
    const row = {
      at: new Date().toISOString(),
      role: String(role || ''),
      sessionId: String(sessionId || ''),
      preset: String(preset || ''),
      tools: Number(tools) || 0,
      handbook: (Array.isArray(handbook) ? handbook : []).map((x) => String(x).slice(0, 40)).slice(0, 12),
      ok: ok !== false,
      note: String(note || '').slice(0, 200),
    }
    fs.writeFileSync(sessionIssueFile(role), JSON.stringify(row, null, 2) + '\n', 'utf8')
    return row
  } catch { return null }
}

export function readSessionIssue(role) {
  try {
    const row = JSON.parse(fs.readFileSync(sessionIssueFile(role), 'utf8'))
    const expect = 'yushen'
    const off = String(row?.preset || '') !== expect
    return { ...row, ok: row?.ok !== false && !off, reason: off ? `预设是 ${row?.preset || '未知'}，不是 ${expect}（工具没挂上）` : '' }
  } catch { return null }
}

/** 给她看的一句：她这条会话到底收没收到工具。 */
export function sessionIssueLine(role) {
  const row = readSessionIssue(role)
  if (!row) return '## 发放状态\n这条会话还没登记发放（工具可能没挂上）；不确定就先查 yushen_can。'
  if (!row.ok) return `## 发放状态\n${row.reason || '上次发放不完整'}；工具可能拿不到，先查 yushen_can，别直接说没有。`
  return `## 发放状态\n预设 ${row.preset}，工具 ${row.tools} 个，手册 ${row.handbook.length} 章。`
}
