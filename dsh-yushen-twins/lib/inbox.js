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

export function inboxRoot() { return INBOX }

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
    if (lastSeq && minSeq > lastSeq + 1) gaps.push({ key, from: lastSeq + 1, to: minSeq - 1, missing: minSeq - lastSeq - 1 })
    prevSeq[key] = lastSeq
    chan[key] = { lastSeq: maxSeq, lastAt: new Date(now).toISOString() }
  }

  rows.sort((a, b) => String(a.at).localeCompare(String(b.at)) || a.seq - b.seq)

  if (!dryRun) {
    if (rows.length) {
      fs.mkdirSync(path.dirname(outFile), { recursive: true })
      fs.appendFileSync(outFile, rows.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8')
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

// ── 谁看到哪儿了：身体是共用的（同一个 QQ 号），眼睛各有一双 ──
// 管家和助手登的是同一个号，所以收件箱只有一份；已读到哪一条，每人各记一份。
const READS = path.join(INBOX, '.reads.json')

export function roleReads(role) {
  const doc = readJson(READS, { version: 1, roles: {} })
  return doc.roles?.[String(role)] || { channels: {} }
}

/** 她还没看的：从自己的已读位往后取。不许跨角色借用别人的位。 */
export function unreadFor(role, { channel = 'qq', day = '', limit = 50 } = {}) {
  const { rows } = readInbox({ day, channel, limit: 100000 })
  const st = roleReads(role).channels?.[channel] || {}
  let start = 0
  if (st.lastId) {
    const i = rows.findIndex((r) => r.id === st.lastId)
    if (i >= 0) start = i + 1
  } else if (st.lastAt) {
    start = rows.filter((r) => String(r.at || '') <= String(st.lastAt)).length
  }
  return { rows: rows.slice(start).slice(-Math.max(1, Number(limit) || 50)), total: rows.length, from: start }
}

/** 看到哪儿了：只记她的已读位，不删任何东西。 */
export function markRoleRead(role, { channel = 'qq', upToId = '', upToAt = '' } = {}) {
  const doc = readJson(READS, { version: 1, roles: {} })
  doc.roles = doc.roles || {}
  const key = String(role || '').trim()
  if (!key) return { ok: false, reason: '没有角色' }
  const row = (doc.roles[key] = doc.roles[key] || { channels: {} })
  row.channels = row.channels || {}
  row.channels[channel] = {
    lastId: String(upToId || row.channels[channel]?.lastId || ''),
    lastAt: String(upToAt || new Date().toISOString()),
  }
  writeJsonAtomic(READS, doc)
  return { ok: true, role: key, channel, ...row.channels[channel] }
}

/**
 * 第一次启用已读位：落到当前最新一条，从这一刻起算「新来的」。
 * 不这么做，「未读」恒等于历史总量——2026-10-26 实测收件箱 2024 条、未读 2024 条，
 * 报出来的数是假的（她从来没标过已读位）。
 */
export function ensureReadCursor(role, { channel = 'qq', now = Date.now() } = {}) {
  const key = String(role || '').trim()
  if (!key) return { ok: false, reason: '没有角色' }
  const doc = readJson(READS, { version: 1, roles: {} })
  const cur = doc.roles?.[key]?.channels?.[channel]
  if (cur && (cur.lastId || cur.lastAt)) return { ok: true, initialized: false, role: key, channel }
  const { rows } = readInbox({ channel, limit: 1 })
  const last = rows[rows.length - 1]
  if (!last || !last.id) return { ok: true, initialized: false, reason: '收件箱还空着', role: key, channel }
  const res = markRoleRead(key, {
    channel,
    upToId: String(last.id),
    upToAt: String(last.at || new Date(now).toISOString()),
  })
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
