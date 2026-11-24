// 改｜2026-11-24 23:50｜大鱼·工作台｜授权：主人（2026-11-24：还有什么没做的一起）｜lib/inbox.js:1｜本轮整理提交：该文件在本轮之前已有改动，补留痕｜为什么：改动要能查到谁/何时/怎么验｜验证：回归 325/0（整体）｜可改：可改
/* 标签
 * id: lib-inbox
 * kind: module
 * summary: 收件箱镜像：把手机收到的消息搬成本体看得见的事件流；只镜像、不判断，零 token。
 * audience: 她（读未读/断档）、桥（只读它自己的 state）、新角色
 * owner: 框架；镜像口径别乱改（去重/游标/断档都有人依赖）
 * mutable: 可改（只读桥的 state，不改它、不发请求）
 * usage: mirrorOnce() 搬一次；readInbox/unreadFor 取消息；markRoleRead 记已读；appendHeartbeat 之类不在这里
 */

// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 收件箱：手机收到的东西，镜像成本体看得见的事件流。
//
// 为什么要有它：判断权在桥里的时候，她连「手机在响」都不知道
// （见 docs/入主鱼神-判断权归位.md）。这里只做镜像，不做判断。
//
// 边界：
//   - 只读桥的 state 文件：不改它、不调它、不发网络请求；
//   - 不叫模型（零 token）；
//   - 存的是「事件」，不是「她该不该回」——判断在她（本体）那边。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { qqBridgeState } from './paths.js'
import { ingestEvents } from './ingest-events.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const INBOX = path.join(DATA, 'inbox')
const CURSOR = path.join(INBOX, '.cursor.json')
const ADAPTER = path.join(DATA, 'adapters', 'qq.json')

function pad(n) { return String(n).padStart(2, '0') }
function dayKey(ms) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

/** 桥的 state 在哪：适配器声明 > 环境变量 > 常见位置（本机兜底）。 */
export function bridgeStatePath() {
  const declared = readJson(ADAPTER, null)?.statePath
  if (declared && fs.existsSync(declared)) return declared
  const env = String(process.env.YUSHEN_QQ_STATE || '').trim()
  if (env && fs.existsSync(env)) return env
  const guesses = [
    path.join(process.cwd(), 'qq-bridge', 'state', 'social-v2.json'),
    path.join(process.cwd(), '..', 'qq-bridge', 'state', 'social-v2.json'),
    path.join(qqBridgeState(), 'social-v2.json'), // 本机兜底；换机器请写 adapters/qq.json
  ]
  for (const p of guesses) if (fs.existsSync(p)) return p
  return ''
}

/** 一条桥里的消息 → 收件箱事件。字段只留判断要用的，原文一字不改。 */
export function normalizeMessage(key, m, { selfIds = [] } = {}) {
  const kind = String(key).startsWith('group:') ? 'group' : 'private'
  const peer = String(key).split(':').slice(1).join(':')
  const text = String(m?.plain ?? m?.text ?? '').replace(/\s+/g, ' ').trim()
  const seq = Number(m?.seq) || 0
  return {
    id: `${key}#${seq || m?.messageId || ''}`,
    seq,
    at: Number(m?.time) ? new Date(Number(m.time)).toISOString() : '',
    channel: 'qq',
    kind,
    key: String(key),
    peer,
    userId: String(m?.userId ?? ''),
    name: String(m?.sender ?? ''),
    text,
    atMe: m?.quoteTargetIsSelf === true,
    isOwner: m?.isOwner === true,
    isSelf: m?.isSelf === true || selfIds.includes(String(m?.userId ?? '')),
    media: Array.isArray(m?.media) ? m.media.length : 0,
  }
}

function readDayIds(file) {
  const ids = new Set()
  let lines = []
  try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/) } catch { return ids }
  for (const line of lines) {
    if (!line.trim()) continue
    try { const row = JSON.parse(line); if (row?.id) ids.add(row.id) } catch { /* 坏行跳过 */ }
  }
  return ids
}

/**
 * 跑一次镜像：把桥 ring 里没记过的消息追加进收件箱。
 * 幂等：按 id 去重；cursor 只前进不回退；dryRun 不写盘。
 */
export function mirrorOnce({ now = Date.now(), statePath = '', selfIds = [], dryRun = false } = {}) {
  const file = statePath || bridgeStatePath()
  if (!file) return { ok: false, reason: '没找到桥的 state（桥没装，或 adapters/qq.json 没写 statePath）', appended: 0, scanned: 0 }
  const doc = readJson(file, null)
  if (!doc || typeof doc !== 'object') return { ok: false, reason: `读不了桥的 state：${file}`, appended: 0, scanned: 0 }

  const convs = doc.conversations || {}
  const cursor = readJson(CURSOR, { version: 1, channels: {} })
  cursor.channels = cursor.channels || {}
  cursor.channels.qq = cursor.channels.qq || {}
  const chan = cursor.channels.qq

  const day = dayKey(now)
  const outFile = path.join(INBOX, 'qq', `${day}.jsonl`)
  const seen = readDayIds(outFile)
  const rows = []
  const gaps = []
  const prevSeq = {}
  let scanned = 0

  for (const [key, conv] of Object.entries(convs)) {
    const list = Array.isArray(conv?.recentMessages) ? conv.recentMessages : []
    if (!list.length) continue
    scanned += list.length
    const known = chan[key]
    const lastSeq = Number(known?.lastSeq) || 0
    const fresh = !known
    let maxSeq = lastSeq
    let minSeq = 0
    for (const m of list) {
      const seq = Number(m?.seq) || 0
      if (!seq) continue
      if (!minSeq || seq < minSeq) minSeq = seq
      if (seq > maxSeq) maxSeq = seq
      if (!fresh && seq <= lastSeq) continue
      const row = normalizeMessage(key, m, { selfIds })
      if (!row.text && !row.media) continue
      if (seen.has(row.id)) continue
      // 第一次见到这个会话时把 ring 里能看到的都收下，并标记，便于以后分辨“历史补录”
      if (fresh) row.backfill = true
      seen.add(row.id)
      rows.push(row)
    }
    // ring 有断层：说明她“不在”的这段时间里，桥那边丢了消息
    // 2026-11-10 主代理（整合）：断档补一个 `at`——只记条数没法回答“为什么没回他”（是哪个时间段断的）。
    if (lastSeq && minSeq > lastSeq + 1) gaps.push({ key, from: lastSeq + 1, to: minSeq - 1, missing: minSeq - lastSeq - 1, at: new Date(now).toISOString() })
    prevSeq[key] = lastSeq
    chan[key] = { lastSeq: maxSeq, lastAt: new Date(now).toISOString() }
  }

  rows.sort((a, b) => String(a.at).localeCompare(String(b.at)) || a.seq - b.seq)

  if (!dryRun) {
    if (rows.length) {
      fs.mkdirSync(path.dirname(outFile), { recursive: true })
      fs.appendFileSync(outFile, rows.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8')
      // 改｜2026-11-02 22:55｜大鱼·子会话（工作台）｜授权：主人（本次任务书：QQ 群消息入站进事件层）｜lib/inbox.js:142-155｜镜像写盘后补一条事件（一天一行 + 计数，原消息仍以本文件为准）｜为什么：桥那边进来的消息只有收件箱一份，手抄本的事件层看不到「今天群里来过几条」｜验证：node --check lib/inbox.js；node scripts/test-ingest-events.mjs 用同一批数据断言 count；node scripts/regression.mjs 不新增红｜可改：可改（只加这一处调用；镜像本身的去重/游标不动）
      try {
        ingestEvents(rows.map((r) => ({
          kind: '群消息',
          at: r.at,
          channel: 'QQ',
          text: `${r.isSelf ? '她' : (r.name || r.userId || '谁')} @${r.kind === 'group' ? '群' : '私聊'}${r.peer}：${r.text || '[图片]'}`,
          ref: `dayu/inbox/qq/${day}:${r.seq || r.id}`,
        })))
      } catch { /* 记不下不影响镜像 */ }
    }
    // 没有新消息、没断档就不写盘：每 30 秒重写一次 cursor 只是磨硬盘。
    const moved = rows.length > 0 || gaps.length > 0 || Object.entries(chan).some(([k, v]) => Number(v?.lastSeq) !== Number(prevSeq[k]))
    if (moved) {
      cursor.updatedAt = new Date(now).toISOString()
      if (gaps.length) cursor.gaps = [...(cursor.gaps || []), ...gaps].slice(-50)
      writeJsonAtomic(CURSOR, cursor)
    }
  }

  return {
    ok: true,
    statePath: file,
    day,
    scanned,
    appended: rows.length,
    conversations: Object.keys(convs).length,
    gaps,
    file: outFile,
  }
}

/** 读收件箱（供她翻、也供回场简报用）。默认今天。 */
export function readInbox({ day = '', channel = 'qq', limit = 50, key = '', sinceSeq = 0 } = {}) {
  const file = path.join(INBOX, channel, `${day || dayKey(Date.now())}.jsonl`)
  const rows = []
  let lines = []
  try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/) } catch { return { ok: true, rows, count: 0, file } }
  for (const line of lines) {
    if (!line.trim()) continue
    let row = null
    try { row = JSON.parse(line) } catch { continue }
    if (key && row.key !== key) continue
    if (sinceSeq && Number(row.seq) <= Number(sinceSeq)) continue
    rows.push(row)
  }
  return { ok: true, rows: rows.slice(-Math.max(1, Number(limit) || 50)), count: rows.length, file }
}

// ── 跨天读：已读位是「一条消息」，它可能躺在昨天（或更早）的文件里 ──
// 修｜2026-11-17｜根因：unreadFor 以前只读当天文件，已读位的 lastId 一跨天就找不到，
// start 退化成 0 → 今天的消息全部算未读（from=0）；lastId 找不到时也没有回退到 lastAt。
// 口径（别乱改）：
//   - 已读位 = 一条消息；定位顺序 lastId → (key,seq) → lastAt，都能跨天；
//   - 读窗口 = 已读位所在那天 → 要查的那天（不是只有当天那个文件）；
//   - 游标只前进：markRoleRead 不许把已读位往回拨；
//   - 同一个 id 只算一次（跨天重复/补录不会重复计未读）；
//   - 定位不了（坏 cursor）不崩、也不假装没消息：degraded=true，从能确定的位置开始。
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

function isDay(v) { return typeof v === 'string' && DAY_RE.test(v) }

function atMs(v) { const ms = Date.parse(String(v || '')); return Number.isFinite(ms) ? ms : NaN }

function dayOfAt(v) { const ms = atMs(v); return Number.isFinite(ms) ? dayKey(ms) : '' }

function listDays(channel) {
  try {
    return fs.readdirSync(path.join(INBOX, channel))
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => f.slice(0, -'.jsonl'.length))
      .filter(isDay)
      .sort()
  } catch { return [] }
}

function readDayRows(channel, day) {
  const file = path.join(INBOX, channel, `${day}.jsonl`)
  let lines = []
  try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/) } catch { return [] }
  const out = []
  for (const line of lines) {
    if (!line.trim()) continue
    let row = null
    try { row = JSON.parse(line) } catch { continue }
    if (!row || typeof row !== 'object' || !row.id) continue
    // 别把别的通道/系统行当消息：有 channel 就必须对得上
    if (row.channel && String(row.channel) !== channel) continue
    out.push(row)
  }
  return out
}

/**
 * 按天把消息拼成一个窗口（同一 id 只留一次，按 at 排好）。
 * fromDay 给了就只读 >= 它的文件（已读位之前的老账不用再扫）；upToDay 是上界。
 */
function loadRows({ channel = 'qq', fromDay = '', upToDay = '' } = {}) {
  const ids = new Set()
  const rows = []
  for (const d of listDays(channel)) {
    if (fromDay && d < fromDay) continue
    if (upToDay && d > upToDay) continue
    for (const row of readDayRows(channel, d)) {
      const id = String(row.id)
      if (ids.has(id)) continue
      ids.add(id)
      rows.push(row)
    }
  }
  rows.sort((a, b) => {
    const am = atMs(a.at)
    const bm = atMs(b.at)
    const av = Number.isFinite(am) ? am : Infinity
    const bv = Number.isFinite(bm) ? bm : Infinity
    if (av !== bv) return av - bv
    const as = Number(a.seq) || 0
    const bs = Number(b.seq) || 0
    if (as !== bs) return as - bs
    return String(a.id).localeCompare(String(b.id))
  })
  return rows
}

function normalizeCursor(st) {
  if (!st || typeof st !== 'object' || Array.isArray(st)) return null
  const lastId = String(st.lastId || '').trim()
  const lastAt = String(st.lastAt || '').trim()
  const seq = Number(st.seq) || 0
  const key = String(st.key || '').trim()
  const day = isDay(st.day) ? String(st.day) : ''
  if (!lastId && !lastAt && !seq) return null
  return { lastId, lastAt, seq, key, day }
}

/** 已读位之后的第一条在 rows 里的下标（=已读条数）。 */
function resolveStart(cursor, rows) {
  if (!cursor) return { start: 0, via: 'none' }
  if (cursor.lastId) {
    const i = rows.findIndex((r) => String(r.id) === cursor.lastId)
    if (i >= 0) return { start: i + 1, via: 'lastId' }
  }
  // 消息 id 变了/被补录成别的 id：同一会话按 seq 往后找
  if (cursor.seq > 0 && cursor.key) {
    const i = rows.findIndex((r) => String(r.key) === cursor.key && (Number(r.seq) || 0) > cursor.seq)
    if (i >= 0) return { start: i, via: 'seq' }
    return { start: rows.length, via: 'seq-end' }
  }
  // lastId 找不到时的回退：按时间。别退化成「全部未读」。
  if (Number.isFinite(atMs(cursor.lastAt))) return { start: posOfAt(rows, atMs(cursor.lastAt)), via: 'lastAt' }
  return { start: 0, via: 'unresolved' }
}

/** rows 按 at 有序：返回 at <= ms 的条数（=第一条比它新的下标）。 */
function posOfAt(rows, ms) {
  if (!Number.isFinite(ms)) return 0
  let n = 0
  for (const r of rows) { const m = atMs(r.at); if (Number.isFinite(m) && m <= ms) n += 1 }
  return n
}

// ── 谁看到哪儿了：身体是共用的（同一个 QQ 号），眼睛各有一双 ──
// 大鱼和小鱼登的是同一个号，所以收件箱只有一份；已读到哪一条，每人各记一份。
const READS = path.join(INBOX, '.reads.json')

/** 读某个角色的已读位（坏文件/坏字段一律当没记过，不抛）。 */
export function roleReads(role) {
  const doc = readJson(READS, { version: 1, roles: {} })
  const roles = doc && typeof doc === 'object' && doc.roles && typeof doc.roles === 'object' && !Array.isArray(doc.roles) ? doc.roles : {}
  const row = roles[String(role)]
  const channels = row && typeof row === 'object' && row.channels && typeof row.channels === 'object' && !Array.isArray(row.channels) ? row.channels : {}
  return { channels }
}

/**
 * 她还没看的：从自己的已读位往后取。不许跨角色借用别人的位。
 * - 未读位可能停在昨天：结论按跨天窗口算（跨天不会全部算未读）；
 * - 第一次启用（没有已读位）：落到现有最新一条，从这一刻起算「新来的」；
 * - lastId 找不到就退到 lastAt，再不行才 degraded（不崩、不假装看过）。
 */
export function unreadFor(role, { channel = 'qq', day = '', limit = 50 } = {}) {
  const roleKey = String(role || '').trim()
  const askedDay = isDay(String(day)) ? String(day) : ''
  const targetDay = askedDay || dayKey(Date.now())
  const lim = Math.max(1, Number(limit) || 50)

  let cursor = normalizeCursor(roleReads(roleKey).channels?.[channel])
  let initialized = false
  if (!cursor && !askedDay && roleKey) {
    // 第一次启用：落到最新一条（写不进也不影响读：最多这次按全部未读返回）
    try {
      const init = ensureReadCursor(roleKey, { channel })
      if (init && init.initialized) {
        cursor = normalizeCursor(roleReads(roleKey).channels?.[channel])
        initialized = true
      }
    } catch { /* 已读位写不进去，读口不能跟着挂 */ }
  }

  const cursorDay = cursor ? (cursor.day || dayOfAt(cursor.lastAt)) : ''
  const fromDay = cursorDay && cursorDay <= targetDay ? cursorDay : ''
  let rows = loadRows({ channel, fromDay, upToDay: targetDay })
  let { start, via } = resolveStart(cursor, rows)
  if (cursor && cursor.lastId && via !== 'lastId' && fromDay) {
    // 老 cursor 的 lastAt 是「标记那一刻」而不是「消息那一刻」：消息可能记在更早的文件里。
    // 窄窗口找不到 lastId 就扩到全量再定位一次——否则跨零点标的那次会被误算成「今天全部没看」。
    const wide = loadRows({ channel, upToDay: targetDay })
    const wideRes = resolveStart(cursor, wide)
    if (wideRes.via === 'lastId') { rows = wide; start = wideRes.start; via = 'lastId' }
  }
  const from = Math.max(0, Math.min(rows.length, Number(start) || 0))
  const unreadRows = rows.slice(from)
  return {
    ok: true,
    rows: unreadRows.slice(-lim),
    total: rows.length,
    from,
    unread: unreadRows.length,
    count: unreadRows.length,
    via,
    degraded: Boolean(cursor) && via === 'unresolved',
    initialized,
    day: targetDay,
  }
}

/**
 * 看到哪儿了：只记她的已读位，不删任何东西。
 * 游标只前进：新位置不比旧的靠后就不写（返回 moved:false），防止并发/乱序把已读位拨回去。
 */
export function markRoleRead(role, { channel = 'qq', upToId = '', upToAt = '', upToSeq = 0, upToKey = '' } = {}) {
  const key = String(role || '').trim()
  if (!key) return { ok: false, reason: '没有角色' }
  const doc = readJson(READS, { version: 1, roles: {} })
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, reason: '已读位文件坏了（先不覆盖）' }
  doc.roles = doc.roles && typeof doc.roles === 'object' && !Array.isArray(doc.roles) ? doc.roles : {}
  const prevRow = doc.roles[key] && typeof doc.roles[key] === 'object' ? doc.roles[key] : {}
  const prevChannels = prevRow.channels && typeof prevRow.channels === 'object' && !Array.isArray(prevRow.channels) ? prevRow.channels : {}
  const prev = normalizeCursor(prevChannels[channel])

  const targetId = String(upToId || '').trim()
  const targetAt = String(upToAt || '').trim()
  if (!targetId && !targetAt) return { ok: false, reason: '没给看到哪儿（upToId/upToAt 都空）' }

  const rows = loadRows({ channel })
  const target = targetId ? rows.find((r) => String(r.id) === targetId) : null
  const next = target
    ? {
      lastId: String(target.id),
      lastAt: targetAt || String(target.at || ''),
      day: dayOfAt(target.at) || '',
      seq: Number(target.seq) || 0,
      key: String(target.key || ''),
    }
    : {
      lastId: targetId,
      lastAt: targetAt,
      day: dayOfAt(targetAt) || '',
      seq: Number(upToSeq) || 0,
      key: String(upToKey || ''),
    }

  // 目标位置：按 id 找得到就按 id；找不到就只能按 lastAt（外部消息/心跳行之类）
  let nextPos = -1
  if (target) nextPos = rows.findIndex((r) => String(r.id) === targetId) + 1
  else if (Number.isFinite(atMs(next.lastAt))) nextPos = posOfAt(rows, atMs(next.lastAt))
  if (nextPos < 0) return { ok: false, reason: `找不到这条消息：${targetId || targetAt}（已读位没动）` }

  const prevPos = prev ? resolveStart(prev, rows).start : 0
  if (prev && nextPos <= prevPos) {
    return { ok: true, role: key, channel, moved: false, ...prev }
  }
  const stored = { ...next, lastAt: next.lastAt || new Date().toISOString() }
  prevChannels[channel] = stored
  doc.roles[key] = { ...prevRow, channels: prevChannels }
  writeJsonAtomic(READS, doc)
  return { ok: true, role: key, channel, moved: true, ...stored }
}

/**
 * 第一次启用已读位：落到当前最新一条，从这一刻起算「新来的」。
 * 不这么做，「未读」恒等于历史总量——2026-10-26 实测收件箱 2024 条、未读 2024 条，
 * 报出来的数是假的（她从来没标过已读位）。
 * 落位看的是全部日文件（今天没消息时落到最近一天），不是只看当天文件。
 */
export function ensureReadCursor(role, { channel = 'qq', now = Date.now() } = {}) {
  const key = String(role || '').trim()
  if (!key) return { ok: false, reason: '没有角色' }
  const existing = normalizeCursor(roleReads(key).channels?.[channel])
  if (existing) return { ok: true, initialized: false, role: key, channel, cursor: existing }
  const rows = loadRows({ channel, upToDay: dayKey(now) })
  const last = rows[rows.length - 1]
  if (!last || !last.id) return { ok: true, initialized: false, reason: '收件箱还空着', role: key, channel }
  const res = markRoleRead(key, {
    channel,
    upToId: String(last.id),
    upToAt: String(last.at || new Date(now).toISOString()),
  })
  if (res.ok === false) return { ...res, initialized: false, role: key, channel }
  return { ...res, initialized: true, upToId: String(last.id) }
}

/** 收件箱概况：哪天有多少条、最后一条是谁说的。 */
export function inboxStatus() {
  const out = { channels: {}, cursor: readJson(CURSOR, { channels: {} }) }
  for (const channel of ['qq']) {
    const dir = path.join(INBOX, channel)
    const days = []
    let files = []
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort() } catch { /* 还没镜像过 */ }
    for (const f of files.slice(-7)) {
      const rows = readInbox({ day: f.replace(/\.jsonl$/, ''), channel, limit: 1 })
      days.push({ day: f.replace(/\.jsonl$/, ''), count: rows.count, last: rows.rows[0]?.text?.slice(0, 40) || '' })
    }
    out.channels[channel] = days
  }
  return out
}
