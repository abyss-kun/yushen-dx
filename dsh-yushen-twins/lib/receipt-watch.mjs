/* 标签
 * id: lib-receipt-watch
 * kind: module
 * tags: 回执, 派活单, 巡检, 提醒, 幂等
 * created: 2026-11-07 22:56:00
 * changed: 2026-11-07 23:03:03
 * author: 照微·子会话（实现代理）
 * authority: 老板（2026-11-07 方案-场景架构对照 §3.3「回执哨兵」，经父会话下发任务书）
 * why: 单子派出去、对方一直没回话，现在只有巡逻里的「派出 10 分钟没回话」一条，
 *      既不催也不升级，于是 11-01 的单子能挂到 11-06 才被人翻出来。
 * result: 新增 scanReceipts / remind 两个接口：
 *        · scanReceipts(role,{now,hours}) 只读 dispatch.json，找「已派出、还没回执、超过 N 小时」的单；
 *        · remind(role,{now}) 每单第一次记一次提醒（写 soul/receipt-watch.json），
 *          同一单同一小时内不重复记，同一单第 3 次返回 escalate:true（由调用方转事故单，本模块不写事故单）；
 *        · 一次调用最多返回 3 条，不刷屏；坏 JSON 一律当空，不抛。
 * mutable: 可改
 *
 * 边界（写清楚，别让下一个人猜）：
 *   · 只认 dispatch.json 的实时状态：dispatched / redispatched 且没有 returnedAt、replyCount 为 0 才算欠回执；
 *   · 角色以单子上的 role 为准；老单子没写 role 的，按 dispatch() 的默认值当 dayu 的（dispatch 默认 role='dayu'）；
 *   · 只读派活单，不回收死单（回收在 lib/patrol.js）；也不建事故单——升级只返回 escalate，落单还是调用方的事；
 *   · 提醒状态是「记过几次」，不是「发过几条消息」：要不要真发、发到哪儿，由调用方决定。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

/** 多久算「欠回执」（小时）。 */
export const SCAN_HOURS = 6
/** 同一单记到第几次转事故单。 */
export const ESCALATE_AT = 3
/** 一次调用最多返回几条提醒。 */
export const MAX_REMIND = 3
/** 提醒记录保留多少天（更老的清掉，别让状态文件长成第二本账）。 */
export const PRUNE_DAYS = 30
/** 提醒记录最多留多少条。 */
export const MAX_ITEMS = 500

const OPEN_STATUS = new Set(['dispatched', 'redispatched'])

const home = () => process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

/** 角色名只允许字母数字下划线横线：拼路径/当键之前先卡一道。 */
export function safeRole(role) {
  const r = String(role ?? '').trim()
  if (!/^[a-z0-9_-]{1,32}$/i.test(r)) {
    throw new Error(`角色名不合法：${JSON.stringify(role)}（只允许字母数字下划线横线，1~32 位）`)
  }
  return r
}

/** 派活单（只读路径；懒取，测试可以先改 DSH_HOME）。 */
export function dispatchFile() {
  return path.join(home(), 'dayu', 'dispatch.json')
}

/** 提醒状态文件：soul/receipt-watch.json。 */
export function watchFile() {
  return path.join(home(), 'dayu', 'soul', 'receipt-watch.json')
}

function readJson(file, fallback) {
  try {
    let text = fs.readFileSync(file, 'utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    const value = JSON.parse(text)
    return value
  } catch { return fallback }
}

/** 读派活单：坏文件/不是数组一律当空，不抛。 */
export function readDispatch() {
  const raw = readJson(dispatchFile(), [])
  return Array.isArray(raw) ? raw.filter((row) => row && typeof row === 'object') : []
}

function toMs(value, fallback = Date.now()) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value === undefined || value === null || value === '') return fallback
  const ms = Date.parse(String(value))
  return Number.isFinite(ms) ? ms : fallback
}

function iso(ms) { return new Date(ms).toISOString() }
function hourKey(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}`
}
function brief(text, n = 90) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, n)
}

/** 这张单派出去了吗、现在几点起算：dispatchedAt → createdAt → dueAt（dueAt 兜底会晚 30 分钟，只当最后手段）。 */
function dispatchedAt(job) {
  for (const key of ['dispatchedAt', 'createdAt', 'dueAt']) {
    const ms = Date.parse(job?.[key] || '')
    if (Number.isFinite(ms)) return ms
  }
  return NaN
}

/** 有没有回执：回场时间或回话次数，有一个就算回了。 */
function hasReceipt(job) {
  if (job?.returnedAt) return true
  if (Number(job?.replyCount || 0) > 0) return true
  return false
}

/**
 * 找「已派出去、超过 N 小时没有回执」的单。
 * @param {string} role 大鱼的派活单只看 role=dayu 的（单子上没写 role 的老单按 dayu 算）
 * @param {{now?:number|string|Date, hours?:number}} [opts] hours=0 表示不限多久，只看「还没回执」
 * @returns {Array<Object>} 按派出时间从早到晚
 */
export function scanReceipts(role, { now = Date.now(), hours = SCAN_HOURS } = {}) {
  const who = safeRole(role)
  const at = toMs(now)
  const limit = Number.isFinite(Number(hours)) ? Math.max(0, Number(hours)) : SCAN_HOURS
  const out = []
  for (const job of readDispatch()) {
    if (!OPEN_STATUS.has(String(job.status || ''))) continue
    if (String(job.role || 'dayu') !== who) continue
    if (hasReceipt(job)) continue
    const sentAt = dispatchedAt(job)
    if (!Number.isFinite(sentAt)) continue // 没时间戳就不敢判「多久没回」，宁可漏也不瞎报
    const ageMs = at - sentAt
    if (ageMs < 0) continue // 未来时间（时钟歪了）不报
    if (limit > 0 && ageMs < limit * 3600 * 1000) continue
    out.push({
      id: String(job.id || ''),
      role: who,
      status: String(job.status || ''),
      brief: brief(job.brief, 120),
      expect: brief(job.expect, 120),
      sessionId: String(job.sessionId || ''),
      employee: String(job.employee || ''),
      dispatchedAt: iso(sentAt),
      dueAt: String(job.dueAt || ''),
      ageHours: Math.round((ageMs / 3600 / 1000) * 10) / 10,
    })
  }
  return out.sort((a, b) => a.dispatchedAt.localeCompare(b.dispatchedAt))
}

function readState() {
  const doc = readJson(watchFile(), null)
  const items = doc && typeof doc === 'object' && doc.items && typeof doc.items === 'object' ? doc.items : {}
  return { version: 1, items: { ...items }, updatedAt: String(doc?.updatedAt || '') }
}

function writeState(doc) {
  const file = watchFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${crypto.randomBytes(3).toString('hex')}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

/** 老的提醒记录清掉：30 天没再提过的不再占地方。 */
function prune(state, nowMs) {
  const cutoff = nowMs - PRUNE_DAYS * 86400 * 1000
  const rows = Object.entries(state.items)
    .filter(([, row]) => {
      const last = Date.parse(row?.lastAt || '')
      return !Number.isFinite(last) || last >= cutoff
    })
    .sort((a, b) => String(b[1]?.lastAt || '').localeCompare(String(a[1]?.lastAt || '')))
    .slice(0, MAX_ITEMS)
  state.items = Object.fromEntries(rows)
  return state
}

/**
 * 对每张欠回执的单记一次提醒。
 *
 * 规则（都在测试里钉着）：
 *   · 同一单**同一小时**内不重复记（第二次调用字节不变）；
 *   · 同一单第 3 次 → 该条 `escalate:true`（由调用方转事故单；本模块不建单）；
 *   · 一次调用最多返回 `MAX_REMIND` 条，剩下的下次再说；
 *   · 坏 JSON 不抛：派活单读不出来就是「没有欠回执」，状态文件读不出来就重建。
 * @returns {{ok:true, at:string, checked:number, reminders:Array<{id,times,escalate,ageHours,brief,text}>, escalate:boolean}}
 */
export function remind(role, { now = Date.now(), hours = SCAN_HOURS } = {}) {
  const who = safeRole(role)
  const at = toMs(now)
  const due = scanReceipts(who, { now: at, hours })
  const state = readState()
  const key = hourKey(at)
  const reminders = []

  // 排队的先后：催得少的先催（免得一次最多 3 条把后面几张永远挤掉），同样次数看谁更久没被催。
  const queue = due
    .map((job) => {
      const prev = state.items[job.id] || null
      return { job, prev, count: Number(prev?.count || 0), last: String(prev?.lastAt || '') }
    })
    .sort((a, b) => a.count - b.count || a.last.localeCompare(b.last) || a.job.dispatchedAt.localeCompare(b.job.dispatchedAt))

  for (const { job, prev } of queue) {
    if (reminders.length >= MAX_REMIND) break
    if (prev && String(prev.lastHour || '') === key) continue // 同一小时只记一次
    const times = Number(prev?.count || 0) + 1
    const escalate = times >= ESCALATE_AT && !prev?.escalatedAt
    const row = {
      id: job.id,
      role: who,
      count: times,
      firstAt: String(prev?.firstAt || iso(at)),
      lastAt: iso(at),
      lastHour: key,
      escalatedAt: String(prev?.escalatedAt || (escalate ? iso(at) : '')),
    }
    state.items[job.id] = row
    reminders.push({
      id: job.id,
      times,
      escalate,
      ageHours: job.ageHours,
      brief: job.brief,
      text: `${job.id}「${job.brief}」派出 ${job.ageHours} 小时还没回执（第 ${times} 次）`,
    })
  }

  if (reminders.length) {
    state.updatedAt = iso(at)
    prune(state, at)
    writeState(state)
  }
  return { ok: true, at: iso(at), checked: due.length, reminders, escalate: reminders.some((r) => r.escalate) }
}
