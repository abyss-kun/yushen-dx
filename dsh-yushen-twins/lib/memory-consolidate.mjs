/* 标签
 * id: lib-memory-consolidate
 * kind: module
 * tags: 记忆, 巩固, 情节, 实体画像, 边权重, 幂等
 * created: 2026-11-07 21:50:00
 * changed: 2026-11-07 21:42:01
 * author: 照微·子会话（实现代理）
 * authority: 老板（2026-11-07 融合方案 P3 夜间巩固：docs/融合方案-记忆.md §5 P3、§8.4 第 4 步）
 * why: 夜里没有巩固——同一件事说五遍就是五条（11-06 实测一句话出现 5 次），实体之间没有权重，
 *      第二次聊到同一件事只能靠关键词再撞一次。
 * result: 只读 <role>.json，产出 <role>.episodes.json：
 *         ① 近似重复（同实体 + 字符 bigram Jaccard ≥0.6 + 7 天内；或双方都没实体时
 *            Jaccard ≥0.8 + 距锚点 3 天内）合成一个情节，memberIds 全留，原文一条不删；
 *         ② 每个实体 count / firstAt / lastAt / sampleIds（≤5）；
 *         ③ 边 = 同屏一次 +1、同一天一次 +0.5；
 *         ④ id 走内容哈希（角色 + 锚点事件 id），同一批事件跑两次字节级一致，dry 不落盘。
 * mutable: 可改
 *
 * 边界（写清楚，别让下一个人猜）：
 *   · 只加不改：<role>.json 一个字节都不写，episodes 是派生索引，删了能重算；
 *   · 实体沿用 P2 的白名单（lib/aliases.json + lib/memory-pick.js 的 entityIdsOf），
 *     所以情节里的实体和注入侧「相关」用的是同一套分组，不另起一套；
 *   · 不总结、不编结论：情节正文取「最后一条成员的原文」，压空白后截 120 字；
 *   · 7 天窗口按「锚点（最早那条）→ 新事件」算，不链式延长（跨月的老账不会被并成一条）；
 *   · 双方都抽不到实体时按「同文（Jaccard ≥0.8）+ 距锚点 3 天内」合并——治「同一句话接五遍」
 *     这种没有实体可连的重复；一边有实体一边没有不算「双方都没有」，仍不合并。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { entityIdsOf } from './memory-pick.js'

// ── 常量（都是能写进断言的数）──────────────────────────────────────────────
export const MERGE_WINDOW_MS = 7 * 86400000 // 7 天内
export const SIMILARITY = 0.6               // 字符 bigram Jaccard 门槛
export const NO_ENTITY_SIMILARITY = 0.8     // 双方都没实体时：要求更像才合并（没有实体可作保）
export const NO_ENTITY_WINDOW_MS = 3 * 86400000 // 双方都没实体时：只并 3 天内（防止把口头禅串成一条）
export const TEXT_MAX = 120                 // 情节正文上限
export const SAMPLE_MAX = 5                 // 实体画像最多留 5 条样本
export const EPISODES_VERSION = 1
export const KNOWN_ROLES = Object.freeze(['dayu', 'xiaoyu', 'dragon'])

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ALIAS_FILE = path.join(HERE, 'aliases.json')

const home = () => process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const memDir = () => path.join(home(), 'dayu', 'soul', 'memory')
const srcFile = (role) => path.join(memDir(), `${role}.json`)
const outFile = (role) => path.join(memDir(), `${role}.episodes.json`)

/** 角色名只允许字母数字下划线横线：拼路径前先卡一道，别让 --role 拐到别的目录去。 */
export function safeRole(role) {
  const r = String(role ?? '').trim()
  if (!/^[a-z0-9_-]{1,32}$/i.test(r)) {
    throw new Error(`角色名不合法：${JSON.stringify(role)}（只允许字母数字下划线横线，1~32 位）`)
  }
  return r
}

// ── 文本工具 ───────────────────────────────────────────────────────────────
/** 压空白：JSON 里的正文带换行/缩进，情节要一行读得完。 */
export function compact(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

/** 按「字」截断（Array.from 按码点切，不会把 emoji 切成半个）。 */
export function clip(text, n = TEXT_MAX) {
  return Array.from(String(text || '')).slice(0, n).join('')
}

function bigrams(text) {
  const chars = Array.from(String(text || '').toLowerCase().replace(/\s+/g, ''))
  const out = new Set()
  if (chars.length === 1) out.add(chars[0])
  for (let i = 0; i + 1 < chars.length; i += 1) out.add(chars[i] + chars[i + 1])
  return out
}

/** 字符 bigram Jaccard：|交集| / |并集|。导出是为了能测，也方便 P4 复用。 */
export function textSimilarity(a, b) {
  const x = bigrams(a)
  const y = bigrams(b)
  if (!x.size || !y.size) return 0
  let inter = 0
  for (const g of x) if (y.has(g)) inter += 1
  const union = x.size + y.size - inter
  return union > 0 ? inter / union : 0
}

// ── 实体名（把 P2 的实体组号翻成人看得懂的标签）────────────────────────────
// 为什么还要翻：entityIdsOf 返回的是 aliases.json 里的组号，存进 episodes 后没人读得懂，
// 而且组号会随别名表增删漂移。标签取「同一实体组里第一个出现的别名原词」（如 封面 / GitHub / 手机），
// 反查也走公开入口 entityIdsOf，不复制 memory-pick 里那套并查集（那边改了这边也不跟错）。
let labelCache = { key: '', labels: new Map() }

function labelMap() {
  let st
  try { st = fs.statSync(ALIAS_FILE) } catch { return new Map() }
  const key = `${st.mtimeMs}|${st.size}`
  if (labelCache.key === key) return labelCache.labels
  const labels = new Map()
  try {
    const raw = JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8').replace(/^\uFEFF/, ''))
    for (const [k, list] of Object.entries(raw || {})) {
      if (!k || k.startsWith('_') || !Array.isArray(list)) continue
      for (const w of [k, ...list]) {
        const word = String(w || '').trim()
        if (word.length < 2) continue // 单字别名（「仓」「怕」）不进索引，也当不了标签
        for (const id of entityIdsOf(word)) {
          if (!labels.has(id)) labels.set(id, word) // 先出现者为准：别名表是人工排的，顺序即偏好
        }
      }
    }
  } catch { /* 别名表坏了就退回 E<组号>，不抛：巩固不该因为别名表拖垮 */ }
  labelCache = { key, labels }
  return labels
}

function labelOf(id) {
  const word = labelMap().get(id)
  // 边键用 | 拼，标签里万一有 | 会切坏键——统一换成 /（别名表目前没有，属于防一手）。
  return String(word || `E${id}`).replace(/\|/g, '/').replace(/[\r\n\t]/g, ' ')
}

/** 一句话里的实体（标签数组，已排序去重）。P4 想和情节对实体就用这个入口。 */
export function entityKeysOf(text) {
  const out = new Set()
  for (const id of entityIdsOf(text)) out.add(labelOf(id))
  return [...out].sort()
}

// ── 读源事件 ───────────────────────────────────────────────────────────────
function eventTime(e) {
  const raw = String(e?.at || '')
  const ms = Date.parse(raw)
  return { raw, ms: Number.isFinite(ms) ? ms : NaN }
}

/**
 * 读 <role>.json 的全部事件，补上 entities。
 * 排序 = 时间升序、同时间按 id；时间坏掉的排最后（只影响展示与合并，不丢事件）。
 * 老事件没有 id 时用「时间|正文」派生一个；万一撞了，追加 #序号，保证 memberIds 不重复。
 */
function readSource(role) {
  const file = srcFile(role)
  if (!fs.existsSync(file)) return { ok: false, reason: '没有记忆文件', file, events: [] }
  let doc
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) }
  catch { return { ok: false, reason: '记忆文件读不出来', file, events: [] } }
  const raw = Array.isArray(doc?.events) ? doc.events : []
  const events = []
  const seen = new Map()
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue
    const text = String(e.text || '')
    if (!text.trim()) continue
    const { raw: at, ms } = eventTime(e)
    const base = String(e.id || `${at}|${text}`)
    const n = seen.get(base) || 0
    seen.set(base, n + 1)
    events.push({ id: n ? `${base}#${n}` : base, at, atMs: ms, text, entities: entityKeysOf(text) })
  }
  events.sort((a, b) => {
    const ta = Number.isFinite(a.atMs) ? a.atMs : Number.MAX_SAFE_INTEGER
    const tb = Number.isFinite(b.atMs) ? b.atMs : Number.MAX_SAFE_INTEGER
    return ta - tb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  })
  return { ok: true, reason: '', file, events }
}

// ── 合并近似重复 → 情节 ────────────────────────────────────────────────────
function sharesEntity(a, b) {
  if (!a.length || !b.length) return false
  const set = new Set(b)
  return a.some((k) => set.has(k))
}

/**
 * 聚类：按时间顺序扫一遍，能并进已有情节就并。
 * 两条路：
 *   ① 双方都有实体：同实体 + 距锚点 ≤7 天 + bigram Jaccard ≥0.6；
 *   ② 双方都没有实体：距锚点 ≤3 天 + Jaccard ≥0.8（治「同一句话接五遍」）。
 * 一边有实体、一边没有，不算「双方都没有」，仍不合并（抽不到实体就不猜着连，方案 §7）。
 * 锚点固定为最早那条 —— 不链式延长，跨月的老账不会被串成一条。
 */
function clusterEvents(events) {
  const clusters = []
  for (const ev of events) {
    let hit = null
    for (const cluster of clusters) {
      const anchor = cluster[0]
      if (!Number.isFinite(ev.atMs) || !Number.isFinite(anchor.atMs)) continue // 时间不明不合并
      const bothNoEntity = !ev.entities.length && !anchor.entities.length
      if (bothNoEntity) {
        if (ev.atMs - anchor.atMs > NO_ENTITY_WINDOW_MS) continue
        if (textSimilarity(anchor.text, ev.text) < NO_ENTITY_SIMILARITY) continue
        hit = cluster
        break
      }
      if (ev.atMs - anchor.atMs > MERGE_WINDOW_MS) continue
      if (!sharesEntity(ev.entities, anchor.entities)) continue
      if (textSimilarity(anchor.text, ev.text) < SIMILARITY) continue
      hit = cluster
      break
    }
    if (hit) hit.push(ev)
    else clusters.push([ev])
  }
  return clusters
}

function episodeOf(role, members) {
  const anchor = members[0]
  const last = members[members.length - 1]
  const ids = members.map((m) => m.id)
  const entitySet = new Set()
  for (const m of members) for (const k of m.entities) entitySet.add(k)
  // id = 内容哈希：角色 + 锚点事件 id。事件正文/时间去算哈希，不掺运行时间——
  // 同一批事件跑两次 id 必然一样；以后同一情节又添了重复，锚点不变，id 也不飘。
  const digest = crypto.createHash('sha1').update(`v1|${role}|${anchor.id}`).digest('hex').slice(0, 12)
  return {
    id: `ep-${digest}`,
    at: last.at || anchor.at,
    entities: [...entitySet].sort(),
    text: clip(compact(last.text), TEXT_MAX),
    memberIds: ids,
    count: ids.length,
  }
}

// ── 实体画像 + 边权重 ──────────────────────────────────────────────────────
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)
const dayOf = (at) => (/^\d{4}-\d{2}-\d{2}/.test(String(at || '')) ? String(at).slice(0, 10) : '')

function profileEntities(events) {
  const profiles = new Map()
  for (const ev of events) {
    for (const key of ev.entities) {
      let p = profiles.get(key)
      if (!p) {
        p = { count: 0, firstAtMs: NaN, lastAtMs: NaN, firstAt: '', lastAt: '', sampleIds: [] }
        profiles.set(key, p)
      }
      p.count += 1
      if (Number.isFinite(ev.atMs)) {
        if (!Number.isFinite(p.firstAtMs) || ev.atMs < p.firstAtMs) { p.firstAtMs = ev.atMs; p.firstAt = ev.at }
        if (!Number.isFinite(p.lastAtMs) || ev.atMs > p.lastAtMs) { p.lastAtMs = ev.atMs; p.lastAt = ev.at }
      }
      if (p.sampleIds.length < SAMPLE_MAX) p.sampleIds.push(ev.id) // 事件已按时间排好 = 最早的 5 条
    }
  }
  const out = {}
  for (const key of [...profiles.keys()].sort()) {
    const p = profiles.get(key)
    out[key] = { count: p.count, firstAt: p.firstAt || '', lastAt: p.lastAt || '', sampleIds: p.sampleIds }
  }
  return out
}

/**
 * 边权重：同一条事件里一起出现 = 同屏，一次 +1；
 * 同一天出现但没同屏过的一对实体 = 弱边，一天 +0.5（不重复叠：同屏那天不再补 0.5）。
 * 只连「同实体/同天」，不按语义相似连（方案 §8.2 明令）。
 */
function weighEdges(events) {
  const strong = new Map()                 // 边键 → 同屏次数
  const dayEntities = new Map()            // 日 → Set(实体)
  const dayStrongPairs = new Map()         // 日 → Set(那天同屏过的边)
  for (const ev of events) {
    const keys = ev.entities
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        const k = pairKey(keys[i], keys[j])
        strong.set(k, (strong.get(k) || 0) + 1)
      }
    }
    const day = dayOf(ev.at)
    if (!day || !keys.length) continue
    let ents = dayEntities.get(day)
    if (!ents) { ents = new Set(); dayEntities.set(day, ents) }
    let pairs = dayStrongPairs.get(day)
    if (!pairs) { pairs = new Set(); dayStrongPairs.set(day, pairs) }
    for (const k of keys) ents.add(k)
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) pairs.add(pairKey(keys[i], keys[j]))
    }
  }
  const weights = new Map(strong)
  for (const [day, ents] of dayEntities) {
    const pairs = dayStrongPairs.get(day) || new Set()
    const list = [...ents].sort()
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const k = pairKey(list[i], list[j])
        if (pairs.has(k)) continue // 那天已经同屏过，按强边算，不再补弱边
        weights.set(k, (weights.get(k) || 0) + 0.5)
      }
    }
  }
  const out = {}
  for (const key of [...weights.keys()].sort()) out[key] = Number(weights.get(key).toFixed(2))
  return out
}

// ── 写盘 ───────────────────────────────────────────────────────────────────
function stampOf(now) {
  const ms = now instanceof Date ? now.getTime() : Number(now) || Date.parse(String(now || ''))
  return new Date(Number.isFinite(ms) ? ms : Date.now()).toISOString()
}

function writeAtomic(file, doc) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, file)
}

// ── 对外入口 ───────────────────────────────────────────────────────────────
/**
 * 跑一趟巩固。
 * @param {string} role dayu / xiaoyu / dragon（也接受别的不带路径分隔符的名字）
 * @param {{ now?: number|string|Date, dry?: boolean }} opts dry=true 只返回结果，不写盘
 * @returns {{role:string,file:string,eventCount:number,episodeCount:number,mergedGroups:number,
 *            absorbedEvents:number,entityCount:number,edgeCount:number,wrote:boolean,skipped:string,
 *            doc:object|null}}
 */
export function consolidate(role, { now = Date.now(), dry = false } = {}) {
  const r = safeRole(role)
  const file = outFile(r)
  const src = readSource(r)
  if (!src.ok) {
    return {
      role: r, file, eventCount: 0, episodeCount: 0, mergedGroups: 0, absorbedEvents: 0,
      entityCount: 0, edgeCount: 0, wrote: false, skipped: src.reason, doc: null,
    }
  }
  const clusters = clusterEvents(src.events)
  const episodes = clusters
    .map((members) => episodeOf(r, members))
    .sort((a, b) => {
      const ta = Date.parse(a.at)
      const tb = Date.parse(b.at)
      return (Number.isFinite(ta) ? ta : Number.MAX_SAFE_INTEGER) - (Number.isFinite(tb) ? tb : Number.MAX_SAFE_INTEGER)
        || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    })
  const entities = profileEntities(src.events)
  const edges = weighEdges(src.events)
  const doc = { version: EPISODES_VERSION, at: stampOf(now), episodes, entities, edges }
  if (!dry) writeAtomic(file, doc)
  return {
    role: r,
    file,
    eventCount: src.events.length,
    episodeCount: episodes.length,
    mergedGroups: clusters.filter((c) => c.length > 1).length,
    absorbedEvents: src.events.length - episodes.length,
    entityCount: Object.keys(entities).length,
    edgeCount: Object.keys(edges).length,
    wrote: !dry,
    skipped: '',
    doc,
  }
}
