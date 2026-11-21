/* 标签
 * id: lib-board-view
 * kind: module
 * tags: 看板, 派生视图, 议程, 归档, 幂等
 * created: 2026-11-07 22:56:00
 * changed: 2026-11-07 23:03:03
 * author: 照微·子会话（实现代理）
 * authority: 老板（2026-11-07 方案-场景架构对照 §3.2「看板自动清空」，经父会话下发任务书）
 * why: 议程和派活单只进不出，越看越长；想看一眼「现在手上有哪几件」得自己从头翻。
 * result: 看板改成派生视图：renderBoard 现算「还开着的」（议程 + 待办 + 欠回执），不落 md；
 *        archiveDone 把完成超过 keepDays 的议程项原文追加进 soul/board/archive-YYYYMM.md，
 *        再从议程里移走——完成项从视图消失，原文仍在，能查。
 * mutable: 可改
 *
 * 边界（写清楚，别让下一个人猜）：
 *   · 看板不落盘：没有「当前看板.md」这种会越写越长的文件，谁看谁现算；
 *   · 只渲染开着的：议程 want/doing/blocked/waiting、派活 waiting/ready-for-review、还没回执的单；
 *   · 归档只挪 state=done 的（放弃 dropped 是她自己的结局，不算「完成」，不动）；
 *   · 归档写的是议程条目**原始 JSON**，一行一条，不改一个字；
 *   · 归档幂等：已经进过归档的 id 跳过（先补归档、再删议程，半路崩了下一轮能接上）。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { scanReceipts, readDispatch, safeRole, SCAN_HOURS } from './receipt-watch.mjs'

/** 归档保留天数：完成超过这么多天才挪走（最近完成的还留在议程里，方便回看）。 */
export const KEEP_DAYS = 7
/** 议程里算「还开着」的状态（和 lib/agenda.js 的 activeItems 一致）。 */
export const OPEN_STATES = Object.freeze(['want', 'doing', 'blocked', 'waiting'])
/** 派活单里算「待办」的状态：等着开工 / 等复查，都还没真正跑起来。 */
export const TODO_STATUS = Object.freeze(['waiting', 'ready-for-review'])

const home = () => process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const pad = (n) => String(n).padStart(2, '0')

function toMs(value, fallback = Date.now()) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value === undefined || value === null || value === '') return fallback
  const ms = Date.parse(String(value))
  return Number.isFinite(ms) ? ms : fallback
}

function stamp(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function readJson(file, fallback) {
  try {
    let text = fs.readFileSync(file, 'utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    return JSON.parse(text)
  } catch { return fallback }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${crypto.randomBytes(3).toString('hex')}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

/** 运行时根目录（每个角色一个子目录，里面是 agenda.json）。 */
export function runtimeRoot() {
  return path.join(home(), 'dayu', 'runtime')
}

/** 某个角色的议程文件。 */
export function agendaFile(role) {
  return path.join(runtimeRoot(), safeRole(role), 'agenda.json')
}

/** 看板归档目录。 */
export function boardDir() {
  return path.join(home(), 'dayu', 'soul', 'board')
}

/** 这个月该追加到哪个归档文件：soul/board/archive-YYYYMM.md。 */
export function archiveFile(now = Date.now()) {
  const d = new Date(toMs(now))
  return path.join(boardDir(), `archive-${d.getFullYear()}${pad(d.getMonth() + 1)}.md`)
}

function brief(text, n = 90) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, n)
}

function readAgenda(role) {
  const doc = readJson(agendaFile(role), null)
  if (!doc || typeof doc !== 'object') return { version: 1, items: [] }
  return { ...doc, version: 1, items: Array.isArray(doc.items) ? doc.items : [] }
}

/** 派活单里「还没开工 / 等复查」的待办（按角色）。 */
function pendingTodos(role) {
  return readDispatch()
    .filter((job) => String(job.role || 'dayu') === role && TODO_STATUS.includes(String(job.status || '')))
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
}

/**
 * 当前看板：从**未完成**的议程 / 待办 / 欠回执现算，不落盘。
 * 空看板返回空串（没东西就不假装有东西）。
 * @returns {string}
 */
export function renderBoard(role, { now = Date.now(), hours = SCAN_HOURS } = {}) {
  const who = safeRole(role)
  const at = toMs(now)
  const open = readAgenda(who).items.filter((item) => OPEN_STATES.includes(String(item.state || '')))
  const todos = pendingTodos(who)
  const receipts = scanReceipts(who, { now: at, hours })
  if (!open.length && !todos.length && !receipts.length) return ''

  const lines = [`# 当前看板 · ${who} · ${stamp(at)}`, '']
  if (open.length) {
    lines.push(`## 手上（议程 ${open.length} 件）`)
    for (const item of open) {
      const state = String(item.state || 'want')
      const tag = state === 'blocked' ? '（卡住了）' : state === 'waiting' ? '（等模型）' : ''
      const next = item.next ? `下一步：${brief(item.next, 60)}` : ''
      lines.push(`- [${state}] ${brief(item.what, 120)}${tag}${next ? ` — ${next}` : ''}`)
    }
    lines.push('')
  }
  if (todos.length) {
    lines.push(`## 待办（别人派的，还没开工 / 等复查 ${todos.length} 件）`)
    for (const job of todos) {
      lines.push(`- ${job.id} [${job.status}] ${brief(job.brief, 100)}`)
    }
    lines.push('')
  }
  if (receipts.length) {
    lines.push(`## 等回执（${receipts.length} 单）`)
    for (const job of receipts) {
      lines.push(`- ${job.id}「${job.brief}」派出 ${job.ageHours} 小时，还没回话`)
    }
    lines.push('')
  }
  return `${lines.join('\n').trim()}\n`
}

/** 归档目录里已经记过的 id（幂等靠它；读不出来就当没记过）。 */
function archivedIds() {
  const ids = new Set()
  let names = []
  try { names = fs.readdirSync(boardDir()).filter((n) => /^archive-\d{6}\.md$/.test(n)) } catch { return ids }
  for (const name of names) {
    try {
      const text = fs.readFileSync(path.join(boardDir(), name), 'utf8')
      for (const m of text.matchAll(/"id":"([^"]+)"/g)) ids.add(m[1])
    } catch { /* 单个文件读不了不影响别的 */ }
  }
  return ids
}

const ARCHIVE_HEAD = (ms) => [
  `# 看板归档 · ${new Date(ms).getFullYear()}${pad(new Date(ms).getMonth() + 1)}`,
  '',
  '> 只追加、不改写：每行是一条**完成项的原文 JSON**。看板是派生的，完成项从这里查。',
  '',
  '',
].join('\n')

/**
 * 把完成超过 keepDays 的议程项挪进 soul/board/archive-YYYYMM.md。
 * 只移动 state=done 的；dropped（放弃）是她的结局，不算完成，不动。
 * @param {{keepDays?:number, now?:number|string|Date}} [opts]
 * @returns {{ok:true, at:string, file:string, keepDays:number, moved:string[], skipped:string[], roles:string[]}}
 */
export function archiveDone({ keepDays = KEEP_DAYS, now = Date.now() } = {}) {
  const at = toMs(now)
  const days = Number.isFinite(Number(keepDays)) ? Math.max(0, Number(keepDays)) : KEEP_DAYS
  const cutoff = at - days * 86400 * 1000
  const file = archiveFile(at)
  const known = archivedIds()
  const moved = []
  const skipped = []
  const roles = []
  let names = []
  try { names = fs.readdirSync(runtimeRoot(), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) } catch { /* 没有运行时目录 */ }

  for (const role of names.sort()) {
    const doc = readAgenda(role)
    const done = []
    for (const item of doc.items) {
      if (String(item?.state || '') !== 'done') continue
      const finished = Date.parse(item.updatedAt || item.at || '')
      if (!Number.isFinite(finished) || finished > cutoff) continue // 完成不久 / 没时间：先留在议程里
      done.push(item)
    }
    if (!done.length) continue
    const fresh = done.filter((item) => !known.has(String(item.id || '')))
    for (const item of done) {
      if (known.has(String(item.id || ''))) skipped.push(String(item.id || ''))
      else moved.push(String(item.id || ''))
    }
    if (fresh.length) {
      fs.mkdirSync(boardDir(), { recursive: true })
      if (!fs.existsSync(file)) fs.writeFileSync(file, ARCHIVE_HEAD(at), { encoding: 'utf8' })
      fs.appendFileSync(file, `${fresh.map((item) => `- ${JSON.stringify(item)}`).join('\n')}\n`, 'utf8')
      for (const item of fresh) known.add(String(item.id || ''))
    }
    // 原文已经落盘（或本来就落过），才从议程里删；半路崩了最多重来一次，不会丢。
    const kept = doc.items.filter((item) => !done.includes(item))
    writeJson(agendaFile(role), { ...doc, version: 1, items: kept, updatedAt: new Date(at).toISOString() })
    roles.push(role)
  }

  return { ok: true, at: new Date(at).toISOString(), file, keepDays: days, moved, skipped, roles }
}
