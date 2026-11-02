// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-01 19:22｜大鱼·工作台(子代理)｜授权：主人｜lib/memory-links.js 全文件（同批新增 scripts/memory-chain.mjs，改 scripts/find-any.mjs:43 加「链条」一路、scripts/regression.mjs 第 134 条断言，只加没删）｜关联记忆：链条.jsonl 记线（标题/步骤/教训）、链接.jsonl 记点（事件 id 挂到链 id），chainOf 按词搜链并带出事件原文｜为什么：老板要「别一条条孤零零记『今天被骂了』，记成『因为我没看参考图 → 被指出来 → 我改错方向』，以后问一句就能顺着线翻回去」｜可改：可改；红线只追加两个 jsonl，<role>.json 一个字节不许动
// 关联记忆：把孤立的记忆事件串成一条线（前因 → 谁做了什么 → 结果 → 教训）。
//
// 2026-11-01 老板原话：
//   「别一条条孤零零记『今天被骂了』，记成『因为我没看参考图 → 被指出来 → 我改错方向』。
//     以后问一句就能顺着线翻回去。」
//
// 为什么另开一份、不动 <role>.json（2026-11-01 派活红线）：
//   · memory/<role>.json 里的 events[] 是一条条"点"——字段/清晰度/冷档都绑在那份上，动它就是动她的记忆本体；
//   · 链是"线"：标题 + 若干步（时间/谁/做了什么）+ 教训，再加一份「哪条事件挂在哪条链上」的链接表；
//   · 所以点一个字段都不改，只在旁边追加两个 jsonl。跑前跑后哈希一致，回归也盯这一条。
//
// 存放（都在 ~/.dsh/dayu/soul/memory/，和 <role>.json 同一个目录，翻起来不换地方）：
//   链条.jsonl  一行一条链：{ id, role, title, steps:[{at,who,what}], lesson, tags, createdAt }
//   链接.jsonl  一行一条挂载：{ eventId, chainId, at }
//
// 规矩：只读已有文件、坏行跳过（半行/断行/手改坏了都不许炸）、路径认 DSH_HOME。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
/** 记忆目录（和 <role>.json 同层）。 */
export const CHAIN_DIR = path.join(HOME, 'dayu', 'soul', 'memory')
export const CHAIN_FILE = path.join(CHAIN_DIR, '链条.jsonl')
export const LINK_FILE = path.join(CHAIN_DIR, '链接.jsonl')

// 角色 id 的口径跟 characters.js 一致：小写字母开头，2–32 位。不合法就当场拒，别让路径跑出去。
const ROLE_RE = /^[a-z][a-z0-9_-]{1,31}$/
const MAX_STEPS = 60
const MAX_TEXT = 400

function fail(message) { throw new TypeError(message) }

function roleOf(role, { allowEmpty = false } = {}) {
  const id = String(role || '').trim()
  if (!id) {
    if (allowEmpty) return ''
    fail('要给 role（比如 dayu）')
  }
  if (!ROLE_RE.test(id)) fail(`role 不合法：${id}`)
  return id
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '') } catch { return '' }
}

function readJson(file, fallback) {
  try { return JSON.parse(readText(file)) } catch { return fallback }
}

/** 读 jsonl：一行一条；坏行（半行、手改坏、空行）跳过，不抛。只读，不修文件。 */
function readJsonl(file) {
  const text = readText(file)
  if (!text.trim()) return []
  const out = []
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim()
    if (!s) continue
    try {
      const row = JSON.parse(s)
      if (row && typeof row === 'object') out.push(row)
    } catch { /* 坏行跳过：数据能读多少算多少，别让一行坏字把整条链带走 */ }
  }
  return out
}

function appendJsonl(file, row) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`, { encoding: 'utf8', mode: 0o600 })
}

/** 一步：接受 {at, who, what} 或 "at|who|what" 三段（CLI 直接传后者）。 */
function normalizeStep(step) {
  if (!step) return null
  if (typeof step === 'string') {
    const [at = '', who = '', ...rest] = step.split('|')
    return normalizeStep({ at, who, what: rest.join('|') })
  }
  if (typeof step !== 'object') return null
  const what = String(step.what ?? step.text ?? '').trim()
  if (!what) return null
  return {
    at: String(step.at ?? '').trim().slice(0, 40),
    who: String(step.who ?? '').trim().slice(0, 20),
    what: what.slice(0, MAX_TEXT),
  }
}

/**
 * 追加一条链。
 * 同一 role + 同标题 + 同步骤 + 同教训 → 同一个 id（内容哈希），已经存在就返回 duplicate，不重复堆。
 * @returns {{ok:boolean, id:string, role:string, duplicate?:boolean, count:number, file:string}}
 */
export function appendLink(role, { title, steps = [], lesson = '', tags = [] } = {}) {
  const who = roleOf(role)
  const name = String(title || '').trim()
  if (!name) fail('链条要有标题（--title）')
  const list = (Array.isArray(steps) ? steps : [steps]).map(normalizeStep).filter(Boolean).slice(0, MAX_STEPS)
  const note = String(lesson || '').trim().slice(0, MAX_TEXT)
  const tagList = (Array.isArray(tags) ? tags : String(tags || '').split(/[,，、]/))
    .map((t) => String(t).trim()).filter(Boolean).slice(0, 12)

  const id = 'c-' + crypto.createHash('sha1')
    .update(JSON.stringify({ role: who, title: name, steps: list, lesson: note }))
    .digest('hex').slice(0, 10)

  const rows = readJsonl(CHAIN_FILE)
  if (rows.some((r) => r.id === id)) {
    return { ok: true, id, role: who, duplicate: true, count: rows.length, file: CHAIN_FILE }
  }
  const row = { id, role: who, title: name, steps: list, lesson: note, tags: tagList, createdAt: new Date().toISOString() }
  appendJsonl(CHAIN_FILE, row)
  return { ok: true, id, role: who, count: rows.length + 1, file: CHAIN_FILE, chain: row }
}

/** 列链：role 留空 = 所有角色。 */
export function readChains(role = '') {
  const who = roleOf(role, { allowEmpty: true })
  const rows = readJsonl(CHAIN_FILE).filter((r) => r && typeof r.id === 'string' && r.id && typeof r.title === 'string')
  const list = who ? rows.filter((r) => String(r.role || '') === who) : rows
  return list.map((r) => ({
    id: String(r.id),
    role: String(r.role || ''),
    title: String(r.title || '').trim(),
    steps: (Array.isArray(r.steps) ? r.steps : []).map(normalizeStep).filter(Boolean),
    lesson: String(r.lesson || '').trim(),
    tags: (Array.isArray(r.tags) ? r.tags : []).map((t) => String(t).trim()).filter(Boolean),
    createdAt: String(r.createdAt || ''),
  }))
}

export function getChain(role, id) {
  const key = String(id || '').trim()
  if (!key) return null
  return readChains(role).find((c) => c.id === key) || null
}

/** 某条角色记忆里的事件（id → 事件）。只读。 */
function eventsOf(role) {
  const map = new Map()
  if (!role) return map
  const memory = readJson(path.join(CHAIN_DIR, `${role}.json`), null)
  const events = Array.isArray(memory?.events) ? memory.events : []
  for (const e of events) {
    if (!e || typeof e !== 'object') continue
    const id = String(e.id || '').trim()
    if (id) map.set(id, e)
  }
  return map
}

/**
 * 把一条已有记忆事件挂到一条链上。
 * **只往 链接.jsonl 追加一行**，绝不改 <role>.json —— 这条是红线，回归里有哈希断言盯着。
 * @returns {{ok:boolean, eventId:string, chainId:string, event?:'found'|'not-in-hot-memory', count?:number, reason?:string}}
 */
export function linkEvent(role, eventId, chainId) {
  const who = roleOf(role)
  const ev = String(eventId || '').trim()
  const ch = String(chainId || '').trim()
  if (!ev || !ch) fail('linkEvent 要 eventId 和 chainId')
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(ev)) fail(`eventId 不合法：${ev}`)
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(ch)) fail(`chainId 不合法：${ch}`)
  const chain = getChain(who, ch)
  if (!chain) return { ok: false, reason: `没有这条链：${ch}` }
  const known = eventsOf(who).has(ev)
  const rows = readJsonl(LINK_FILE)
  if (rows.some((r) => String(r.eventId) === ev && String(r.chainId) === ch)) {
    return { ok: true, duplicate: true, eventId: ev, chainId: ch, event: known ? 'found' : 'not-in-hot-memory', count: rows.length }
  }
  appendJsonl(LINK_FILE, { eventId: ev, chainId: ch, at: new Date().toISOString() })
  return { ok: true, eventId: ev, chainId: ch, event: known ? 'found' : 'not-in-hot-memory', count: rows.length + 1 }
}

/** 某条链上挂的事件（原文照抄，不改动）。 */
export function eventsOfChain(role, chainId) {
  // 手改过的链可能没写 role：这种直接当"没有挂事件"，别让一行缺字段把整个 list/search 弄崩
  const who = roleOf(role, { allowEmpty: true })
  if (!who) return []
  const ch = String(chainId || '').trim()
  if (!ch) return []
  const ids = readJsonl(LINK_FILE).filter((r) => String(r.chainId) === ch).map((r) => String(r.eventId))
  const map = eventsOf(who)
  return ids.map((id) => {
    const e = map.get(id)
    return e
      ? { id, at: String(e.at || ''), channel: String(e.channel || ''), kind: String(e.kind || ''), text: String(e.text || ''), found: true }
      : { id, at: '', channel: '', kind: '', text: '', found: false }
  })
}

/** 链的全部可搜文本：标题 + 教训 + 标签 + 每一步。 */
function chainBlob(chain) {
  const parts = [chain.title, chain.lesson, ...(chain.tags || [])]
  for (const s of chain.steps || []) parts.push(s.at, s.who, s.what)
  return parts.join(' ').toLowerCase()
}

/**
 * 按词搜链：标题 / 步骤 / 教训 / 标签，命中就带出整条线 + 挂在上面的记忆事件原文。
 * role 留空 = 所有角色一起搜。
 * @returns {{ok:boolean, q:string, chains:Array}}
 */
export function chainOf(role, query, { limit = 10 } = {}) {
  const who = roleOf(role, { allowEmpty: true })
  const needle = String(query || '').trim()
  if (!needle) return { ok: true, q: '', chains: [] }
  const tokens = needle.toLowerCase().split(/\s+/).filter(Boolean)
  const hit = readChains(who).filter((c) => {
    const blob = chainBlob(c)
    return tokens.every((t) => blob.includes(t))
  })
  hit.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  const chains = hit.slice(0, Math.max(1, Math.min(50, Number(limit) || 10))).map((c) => ({
    ...c,
    events: eventsOfChain(c.role, c.id),
  }))
  return { ok: true, q: needle, chains, total: hit.length }
}
