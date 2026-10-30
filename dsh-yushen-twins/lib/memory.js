// 记忆回写：她经历的事写进她自己那一份 memory/<role>.json 的 events 里。
// 规则：一个人一份；带通道；同一句话不重复记；只留最近 200 条；别的字段（摘要/习惯/关系）不动。
import fs from 'node:fs'
import { redact } from './redact.js'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { getCharacter } from './characters.js'
import { noteWrite } from './memory-audit.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const LEDGER = path.join(DATA, 'residence.json')
const MAX_EVENTS = 200
const MAX_TEXT = 400

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}

/**
 * 给记忆文件加锁（2026-10-29）。
 * 为什么：appendEvent 是「读出来 → 改 → 整个写回」。多个身体同时写的时候，
 * 谁最后写谁赢，前面那次直接消失——她的记忆这几天在 31/59/71 之间跳，就是这么来的。
 * 做法：用一个目录当锁（mkdir 是原子的），拿不到就等；等太久就强行拿走，
 * 宁可慢一点，也不要卡死不干活。
 */
export function withLock(file, fn, { waitMs = 20, maxWaitMs = 3000 } = {}) {
  const lockPath = `${file}.lock`
  const deadline = Date.now() + maxWaitMs
  let held = false
  while (!held) {
    try {
      fs.mkdirSync(lockPath)
      held = true
    } catch (e) {
      if (e && e.code === 'EEXIST') {
        if (Date.now() > deadline) {
          try { fs.rmSync(lockPath, { recursive: true, force: true }) } catch {}
          continue
        }
        const t = Date.now() + waitMs
        while (Date.now() < t) { /* 同步等一小会儿 */ }
      } else {
        return fn()   // 锁都建不了（权限之类），别把写入堵死
      }
    }
  }
  try { return fn() } finally { try { fs.rmSync(lockPath, { recursive: true, force: true }) } catch {} }
}

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

/** 会话 id → 角色 id（只认常驻账本里那几条）。 */
export function roleForSession(sessionId) {
  const id = String(sessionId || '')
  if (!id) return ''
  const ledger = readJson(LEDGER, { roles: {} })
  for (const [role, row] of Object.entries(ledger.roles || {})) {
    if (String(row?.sessionId || '') === id) return role
  }
  return ''
}

/**
 * 这句该署谁：只有她自己的那具身体（role 认得出来）才署「她」。
 * 员工会话（干活那条）说的话属于它的会话日志，不进她的日记——
 * 否则她的日记里全是别人的工作汇报（2026-10-26 实测：一条干活会话被记了 53 条）。
 * @returns {'她'|'老板'|''} '' = 不记
 */
export function attributionOf({ role = '', isUser = false, source = '本机会话' } = {}) {
  if (source !== '本机会话') return ''
  if (!role) return ''
  return isUser ? '老板' : '她'
}


/**
 * 记一条经历。
 * kind: 'say'（她说的/做的）| 'input'（老板说的）| 'task' | 'note'
 */
export function appendEvent(role, { channel = '工作台', text, at, kind = 'say', source = '', verified = false, pinned = false, by = '' } = {}) {
  const character = getCharacter(role)
  const raw = String(text || '').trim()
  if (!raw) return { ok: false, reason: '空事件' }
  // 入库前脱敏（2026-10-28）：密码/token/手机号/身份证/银行卡/链接不进记忆。
  // 之前只在 ask/awareness 脱敏，记忆正文是裸的——这是真漏洞。
  const safe = (() => { try { return redact(raw).text } catch { return raw } })()
  const value = String(safe || '').trim()
  if (!value) return { ok: false, reason: '空事件（脱敏后为空）' }
  const when = String(at || new Date().toISOString())
  const row = {
    at: when,
    channel: String(channel || '通道').slice(0, 20),
    kind: String(kind || 'say').slice(0, 20),
    text: value.slice(0, MAX_TEXT),
    source: String(source || '').slice(0, 200),
    verified: Boolean(verified),
    // 清晰度（2026-10-28 抄 SurfCore 的模型，但不用它的五档文案）：
    // 新事 vivid；每天降一档；pinned 的永不降（第一次和主人说话这种）。
    clarity: 'vivid',
    pinned: Boolean(pinned),
    lastSeenAt: when,
    recallCount: 0,
    // 分身号（框架 v1.88 §7.10）：这一条是哪个分身写的。不记名的消息等于没有。
    by: String(by || '').slice(0, 12),
  }
  const file = character.memory
  return withLock(file, () => {
  const memory = readJson(file, null) || { version: 1, summary: '', habits: [], dynamics: [], impressions: {} }
  const events = Array.isArray(memory.events) ? memory.events : []
  // 去重：同通道 + 同文本 + 同一分钟，只记一次（避免重放/重试写出十几条一样的话）
  const fingerprint = (e) => crypto.createHash('sha256').update(`${e.channel}|${e.kind}|${String(e.text).slice(0, 200)}|${String(e.at).slice(0, 16)}`).digest('hex')
  const seen = new Set(events.map(fingerprint))
  if (seen.has(fingerprint(row))) return { ok: true, duplicate: true, count: events.length }
  const next = [...events, row].slice(-MAX_EVENTS)
  const sizeBefore = (() => { try { return fs.statSync(file).size } catch { return -1 } })()
  writeAtomic(file, { ...memory, version: memory.version ?? 1, updatedAt: when, events: next })
  // 记忆审计（2026-10-27）：谁动了她的记忆，必须留一条。没有这条，掉 50KB 都查不出是谁干的。
  noteWrite({ role, file, op: kind || 'say', before: sizeBefore, after: (() => { try { return fs.statSync(file).size } catch { return -1 } })(), who: 'appendEvent', why: `${channel}：${value.slice(0, 60)}` })
  return { ok: true, appended: true, count: next.length, file }
  })
}

// ── 记忆清晰度（2026-10-28）─────────────────────────────────────
// 抄 SurfCore 的思路，但守住我们自己的规矩：
//   · 只降清晰度、**不删任何东西**（原文永远在文件里，"遗忘"= 默认不给她看）；
//   · pinned 的永不降（第一次和老板说话、明确标记的重要事）；
//   · 一天只降一档（慢慢模糊，不是突然没了）；
//   · 被再提起就回到 vivid（复习效应）。
export const CLARITY_ORDER = Object.freeze(['vivid', 'clear', 'fuzzy', 'trace', 'forgotten'])
export const CLARITY_LABEL = Object.freeze({ vivid: '清晰', clear: '清楚', fuzzy: '模糊', trace: '只剩印象', forgotten: '想不起来' })
export const MEMORY_CAPACITY_THRESHOLDS = Object.freeze([0.8, 0.9, 1.0])

function clarityIndex(c) {
  const i = CLARITY_ORDER.indexOf(String(c || 'clear'))
  return i < 0 ? 1 : i
}

/** 容量：条数 / 上限 / 比例 / 告警档（null = 没到 80%）。 */
export function memoryCapacity(role) {
  const character = getCharacter(role)
  const memory = readJson(character.memory, null) || {}
  const events = Array.isArray(memory.events) ? memory.events : []
  const ratio = events.length / MAX_EVENTS
  const level = MEMORY_CAPACITY_THRESHOLDS.find((t) => ratio >= t) || null
  return { count: events.length, max: MAX_EVENTS, ratio: Number(ratio.toFixed(3)), level }
}

/**
 * 一天降一档。pinned 不动；已经 forgotten 的不再动。
 * @returns {{ok:boolean, changed:number, skipped?:string, at:string}}
 */
export function applyDailyDecay(role, { now = Date.now(), force = false } = {}) {
  const character = getCharacter(role)
  const file = character.memory
  return withLock(file, () => {
  const memory = readJson(file, null)
  if (!memory) return { ok: false, skipped: '记忆文件读不出来' }
  const today = new Date(now).toISOString().slice(0, 10)
  if (!force && String(memory.lastDecayDay || '') === today) return { ok: true, changed: 0, skipped: '今天已经降过' }
  const events = Array.isArray(memory.events) ? memory.events : []
  let changed = 0
  const next = events.map((e) => {
    if (!e || typeof e !== 'object') return e
    if (e.pinned) return e
    const i = clarityIndex(e.clarity)
    if (i >= CLARITY_ORDER.length - 1) return e
    changed += 1
    return { ...e, clarity: CLARITY_ORDER[i + 1] }
  })
  writeAtomic(file, { ...memory, version: memory.version ?? 1, lastDecayDay: today, updatedAt: new Date(now).toISOString(), events: next })
  noteWrite({ role, file, op: 'decay', before: -1, after: -1, who: 'applyDailyDecay', why: `${changed} 条降了一档` })
  return { ok: true, changed, at: new Date(now).toISOString() }
  })
}

/** 复习：她或谁提到某个词，把最近一条包含它的事拉回 vivid。 */
export function touchMemory(role, { match = '', now = Date.now() } = {}) {
  const key = String(match || '').trim()
  if (!key) return { ok: false, error: '要复习哪个词？' }
  const character = getCharacter(role)
  const file = character.memory
  return withLock(file, () => {
  const memory = readJson(file, null)
  if (!memory) return { ok: false, error: '记忆读不出来' }
  const events = Array.isArray(memory.events) ? memory.events : []
  let hit = -1
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (String(events[i]?.text || '').includes(key)) { hit = i; break }
  }
  if (hit < 0) return { ok: false, error: `记忆里没有提到「${key}」的事` }
  const e = events[hit]
  events[hit] = { ...e, clarity: 'vivid', lastSeenAt: new Date(now).toISOString(), recallCount: Number(e.recallCount || 0) + 1 }
  writeAtomic(file, { ...memory, version: memory.version ?? 1, updatedAt: new Date(now).toISOString(), events })
  return { ok: true, at: events[hit].lastSeenAt, text: String(e.text || '').slice(0, 60), recallCount: events[hit].recallCount }
  })
}

/** 给"看记忆"用：默认不返回已 forgotten 的（想不起来，但文件里还在）。 */
export function visibleEvents(memory, { includeForgotten = false } = {}) {
  const events = Array.isArray(memory?.events) ? memory.events : []
  if (includeForgotten) return events
  return events.filter((e) => String(e?.clarity || 'clear') !== 'forgotten')
}
