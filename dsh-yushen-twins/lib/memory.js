// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 记忆回写：她经历的事写进她自己那一份 memory/<role>.json 的 events 里。
// 规则：一个人一份；带通道；同一句话不重复记；**不设上限**（2026-10-31 老板：她不用像人一样有极限）；
// 别的字段（摘要/习惯/关系/印象）不动；注入只带摘要和最近几条，要细节自己翻。
import fs from 'node:fs'
import { redact } from './redact.js'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { device } from './platform.js'
import { getCharacter } from './characters.js'
import { noteWrite } from './memory-audit.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const LEDGER = path.join(DATA, 'residence.json')
// 2026-10-31 老板：**可以有遗忘，但冷档不是删除——想起来的时候要能翻到。**
// 所以热档留 200（"现在想着的"），被挤出去的进冷档（"想得起来的"），只增不删。
export const MAX_EVENTS = 200
const MAX_TEXT = 400
// 改｜2026-11-02｜授权：老板｜同步子包的落地目录（方案 v1 §2.2、§9）：
// 水位、合并日志、分歧、逻辑时钟都放 dayu/sync/ 下，单机默认不读它，只有 sync/ 里的脚本用。
const SYNC_DIR = path.join(DATA, 'sync')
export const SEQ_FILE = path.join(SYNC_DIR, 'seq.json')

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}

/**
 * 冷档：被裁掉的旧记忆先在这里留一份，只增不删。
 * 2026-10-31：原来超过 200 条直接 slice(-200)，最老的静默消失——那不算忘掉，那叫丢。
 */
export function archiveDropped(role, dropped) {
  if (!Array.isArray(dropped) || !dropped.length) return 0
  try {
    const dir = path.join(DATA, 'runtime', role, '记忆冷档')
    fs.mkdirSync(dir, { recursive: true })
    const day = new Date().toISOString().slice(0, 10)
    const file = path.join(dir, day + '.jsonl')
    fs.appendFileSync(file, dropped.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8')
    return dropped.length
  } catch { return 0 }
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

/**
 * 逻辑时钟（2026-11-02，方案 v1 §1）：seq 每设备单调递增，按 role 分，落在 dayu/sync/seq.json。
 * 为什么存在：`at` 是给人看的，两台设备的系统时间不一定对得上；合并与断点续交只认 seq。
 * floor = 本机现有事件里最大的 seq：时钟文件丢了或被改坏时接着已有的往下排，不回头撞号。
 */
export function nextSeq(role, floor = 0) {
  const key = String(role || 'dayu').slice(0, 32)
  return withLock(SEQ_FILE, () => {
    const doc = readJson(SEQ_FILE, {}) || {}
    const cur = Math.max(Number(doc[key] || 0) || 0, Number(floor) || 0) + 1
    writeAtomic(SEQ_FILE, { ...doc, [key]: cur })
    return cur
  })
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
 * validUntil（2026-11-02，可选）：ISO 时间。到点后这条默认不再当作现行结论返回
 * （recall-now 仍可用 includeExpired 翻出来并标「已失效」）；不传就永远有效。
 * session（2026-11-02，可选）：哪个分身写的（DSH 会话 id）。进 id 与事件，空着也行。
 *   ⚠ 老数据没有 session 的后果（想清楚再动）：已经写进去的老事件 **id 不重算、不删、不影响读取**
 *   （memoryView / recallNow / 冷档都按原样读）。唯一的不同在去重粒度：同一台设备上两个会话
 *   在同一分钟说了同一句话时，因为 id 里 session 都是空，会被去重成一条；新写入带上 session
 *   就各记各的。所以「补传 session」只是让以后的新事件分得开，不会去改历史。
 * about（2026-11-02，可选）：这条在说哪件事（合并时按它认「同一件事」）。状态类建议写。
 */
export function appendEvent(role, { channel = '工作台', text, at, kind = 'say', source = '', verified = false, pinned = false, by = '', tier = 'normal', validUntil = '', session = '', about = '' } = {}) {
  const character = getCharacter(role)
  const raw = String(text || '').trim()
  if (!raw) return { ok: false, reason: '空事件' }
  // 入库前脱敏（2026-10-28）：密码/token/手机号/身份证/银行卡/链接不进记忆。
  // 之前只在 ask/awareness 脱敏，记忆正文是裸的——这是真漏洞。
  const safe = (() => { try { return redact(raw).text } catch { return raw } })()
  const value = String(safe || '').trim()
  if (!value) return { ok: false, reason: '空事件（脱敏后为空）' }
  const when = String(at || new Date().toISOString())
  // 改｜2026-11-02｜授权：老板｜身份键（方案 v1 §1）：id 必须含 device 与 session。
  // 为什么：不含 device 时，两台设备同一分钟说同一句话会被去重成一条——那句话就只剩一边。
  // 兼容：旧事件已入库的 id 不重算、不删除；只有从这一刻起新写的事件用新格式。
  const dev = device()
  const sess = String(session || '').slice(0, 24)
  const aboutKey = String(about || '').slice(0, 80)
  // 2026-11-01 主人：他说“决定/以后都/别/改成/就按”这类话，当场标重要，别攒着。
  // 之前全靠事后我自觉，结果他一问我就忘——因为那些话当时只是 normal。
  const DECISION = /(决定|以后都|以后别|不要再|别用|必须|就按|改成|否决|不准|从今天起|记住[:：])/
  const autoTier = (tier && tier !== 'normal') ? tier : (DECISION.test(value) ? 'important' : 'normal')
  // 2026-11-02：有效期只认能解析的 ISO；写坏的不进事件（宁可当作永久有效，也不写个假期限）。
  const vUntil = (() => {
    const v = String(validUntil || '').trim()
    if (!v) return ''
    return Number.isFinite(Date.parse(v)) ? v : ''
  })()
  const row = {
    at: when,
    channel: String(channel || '通道').slice(0, 20),
    kind: String(kind || 'say').slice(0, 20),
    text: value.slice(0, MAX_TEXT),
    source: String(source || '').slice(0, 200),
    verified: Boolean(verified),
    // 2026-11-01 主人：记忆分重要/不重要，轻装上阵。
    //   core      = 身份、关系、承诺、事故教训——每轮都带着
    //   important = 重要的事——按需翻，不进每轮
    //   normal    = 日常——只进冷档/检索，绝不占注入
    tier: ['core', 'important', 'normal'].includes(String(autoTier)) ? String(autoTier) : 'normal',
    // 清晰度（2026-10-28 抄 SurfCore 的模型，但不用它的五档文案）：
    // 新事 vivid；每天降一档；pinned 的永不降（第一次和主人说话这种）。
    clarity: 'vivid',
    pinned: Boolean(pinned),
    lastSeenAt: when,
    recallCount: 0,
    // 分身号（框架 v1.88 §7.10）：这一条是哪个分身写的。不记名的消息等于没有。
    by: String(by || '').slice(0, 12),
    // 2026-10-30：稳定 id，给「证据式召回」用——她能说出是哪一条，而不是"我记得"。
    // 2026-11-01：这条是哪个设备记的（手机/电脑分开标记，合并时看它）
    device: dev,
    ...(sess ? { session: sess } : {}),
    ...(aboutKey ? { about: aboutKey } : {}),
    ...(vUntil ? { validUntil: vUntil } : {}),
    // 改｜2026-11-02｜授权：老板｜id = sha1(device|session|at|channel|text[0:120])（方案 v1 §1）。
    // 格式还是 m- + 10 位十六进制：旧的 m- 开头的 id 一样能读，两种 id 并存不冲突。
    // 老事件没有 session 就按空串算，id 不重算（见上面 appendEvent 的注释：只影响去重粒度）。
    id: 'm-' + crypto.createHash('sha1').update(`${dev}|${sess}|${when}|${channel}|${value.slice(0, 120)}`).digest('hex').slice(0, 10),
  }
  const file = character.memory
  return withLock(file, () => {
  const memory = readJson(file, null) || { version: 1, summary: '', habits: [], dynamics: [], impressions: {} }
  const events = Array.isArray(memory.events) ? memory.events : []
  // 去重：同通道 + 同文本 + 同一分钟，只记一次（避免重放/重试写出十几条一样的话）
  // 改｜2026-11-02｜授权：老板｜指纹也带 device + session（方案 v1 §7「去重键撞车」）：
  // 同一台设备同一分钟重放仍然只记一次；两台设备各自记的那条都要留下。
  const fingerprint = (e) => crypto.createHash('sha256').update(`${e.device || ''}|${e.session || ''}|${e.channel}|${e.kind}|${String(e.text).slice(0, 200)}|${String(e.at).slice(0, 16)}`).digest('hex')
  const seen = new Set(events.map(fingerprint))
  if (seen.has(fingerprint(row))) return { ok: true, duplicate: true, count: events.length }
  // 逻辑时钟：判重之后才取号，重复的不占号（方案 v1 §1：seq 每设备单调递增）。
  const floor = events.reduce((m, e) => Math.max(m, Number(e && e.seq) || 0), 0)
  const stamped = { ...row, seq: nextSeq(role, floor) }
  const merged = [...events, stamped]
  // 裁之前先留档：被挤出去的那几条进冷档（只增不删），再写热档。
  if (merged.length > MAX_EVENTS) archiveDropped(role, merged.slice(0, merged.length - MAX_EVENTS))
  const next = merged.slice(-MAX_EVENTS)
  const sizeBefore = (() => { try { return fs.statSync(file).size } catch { return -1 } })()
  writeAtomic(file, { ...memory, version: memory.version ?? 1, updatedAt: when, events: next })
  // 记忆审计（2026-10-27）：谁动了她的记忆，必须留一条。没有这条，掉 50KB 都查不出是谁干的。
  noteWrite({ role, file, op: kind || 'say', before: sizeBefore, after: (() => { try { return fs.statSync(file).size } catch { return -1 } })(), who: 'appendEvent', why: `${channel}：${value.slice(0, 60)}` })
  return { ok: true, appended: true, count: next.length, id: stamped.id, seq: stamped.seq, file }
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


/** 被想起就给这条加权重（2026-11-02 第 3 层）：recallCount +1、lastSeenAt 刷新。
 *  只动命中的那几条，不重排、不删。 */
export function bumpRecall(role, ids = []) {
  const set = new Set((ids || []).filter(Boolean))
  if (!set.size) return { ok: true, changed: 0 }
  const character = getCharacter(role)
  const file = character.memory
  return withLock(file, () => {
    const memory = readJson(file, null)
    if (!memory) return { ok: false, skipped: '记忆文件读不出来' }
    const events = Array.isArray(memory.events) ? memory.events : []
    let changed = 0
    const next = events.map((e) => {
      if (!e || !set.has(e.id)) return e
      changed += 1
      return { ...e, recallCount: Number(e.recallCount || 0) + 1, lastSeenAt: new Date().toISOString() }
    })
    if (!changed) return { ok: true, changed: 0 }
    writeAtomic(file, { ...memory, updatedAt: new Date().toISOString(), events: next })
    return { ok: true, changed }
  })
}

/**
 * 把旧事件标成「已被取代」（2026-11-02）：给它们写 validUntil=now、supersededBy、supersedeReason。
 * 为什么：A 后来改成 B，两条都在热记忆里并存——不删，但旧的那条不能再被当成现行结论。
 * 红线：**不改正文、不删条目**；只加这三个字段。正文一个字都不动。
 *
 * @param {string} role 角色 id
 * @param {{oldIds?: string[]|string, byId?: string, reason?: string, at?: string}} opts
 *   byId：取代它的新事件 id（或一句说明，原样记）；reason：为什么改
 */
export function supersede(role, { oldIds = [], byId = '', reason = '', at = '' } = {}) {
  const ids = new Set(
    (Array.isArray(oldIds) ? oldIds : String(oldIds || '').split(','))
      .map((x) => String(x || '').trim())
      .filter(Boolean),
  )
  if (!ids.size) return { ok: false, reason: '没有要失效的事件 id' }
  const character = getCharacter(role)
  const file = character.memory
  const when = String(at || new Date().toISOString())
  return withLock(file, () => {
    const memory = readJson(file, null)
    if (!memory) return { ok: false, reason: '记忆文件读不出来' }
    const events = Array.isArray(memory.events) ? memory.events : []
    const found = new Set(events.filter((e) => e && ids.has(e.id)).map((e) => e.id))
    const missing = [...ids].filter((id) => !found.has(id))
    if (!found.size) return { ok: false, reason: '要失效的 id 一个都不在', missing }
    const next = events.map((e) => {
      if (!e || !found.has(e.id)) return e
      return {
        ...e,
        validUntil: when,
        supersededBy: String(byId || '').slice(0, 120),
        supersedeReason: String(reason || '').slice(0, 200),
      }
    })
    const sizeBefore = (() => { try { return fs.statSync(file).size } catch { return -1 } })()
    writeAtomic(file, { ...memory, version: memory.version ?? 1, updatedAt: when, events: next })
    noteWrite({
      role, file, op: 'supersede', before: sizeBefore,
      after: (() => { try { return fs.statSync(file).size } catch { return -1 } })(),
      who: 'supersede', why: `${found.size} 条标为失效${reason ? `：${String(reason).slice(0, 60)}` : ''}`,
    })
    return { ok: true, changed: found.size, missing, at: when, file }
  })
}