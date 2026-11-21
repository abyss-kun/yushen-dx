/* 标签
 * id: lib-meta-memory
 * kind: module
 * tags: 记忆, 元记忆, 三态, 失效过滤, 情节
 * created: 2026-11-07 21:42:00
 * changed: 2026-11-07 21:42:01
 * author: 照微·子会话（实现代理）
 * authority: 老板（2026-11-07 融合方案 P4 元记忆三态：docs/融合方案-记忆.md §5 P4、§9.1）
 * why: 现在被问旧事只有两种结果——答，或者不谈；缺第三种「我记得有这回事，细节想不起来」。
 *      更危险的是把已经被顶替/进了冷档的旧结论当现行证据拿出来说。
 * result: metaAnswer(role, cue)：用 P3 的 episodes/entities 判三态——
 *         没实体或实体不在画像 → unknown；样本够（≥3）且最近 30 天内出现 → know；
 *         实体在画像但样本少/很久没出现 → partial（note=细节可能记不全）。
 *         evidence 一律只取「源事件里没有 supersededBy 且 cold !== true」的成员；
 *         episodeEvidence(role, episodeId) 返回该情节里仍然活着的成员事件。
 * mutable: 可改
 *
 * 边界（写清楚，别让下一个人猜）：
 *   · 纯 JS；只读 <role>.json（源事件）与 P3 的 <role>.episodes.json，一个字节都不写；
 *   · 实体抽取直接用 P3 的 entityKeysOf（同一套 aliases 分组，不另起）；
 *   · 只看画像里的 sampleIds（≤5 条）判断「样本够不够、最近有没有出现」——
 *     样本被顶替/冷档后宁可说 partial，也不拿死证据冒充「最近还提过」；
 *   · 没有 episodes 文件、文件坏了、角色没记忆：一律 unknown，不抛；
 *   · 不总结、不补细节：partial 时只说「细节可能记不全」，正文仍回原文查。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { entityKeysOf } from './memory-consolidate.mjs'

export const META_MIN_SAMPLES = 3          // 样本至少 3 条才算「知道」
export const META_RECENT_MS = 30 * 86400000 // 最近 30 天内出现过才算「还记得」
export const META_PARTIAL_NOTE = '细节可能记不全'

const home = () => process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const memDir = () => path.join(home(), 'dayu', 'soul', 'memory')
const srcFile = (role) => path.join(memDir(), `${role}.json`)
const epFile = (role) => path.join(memDir(), `${role}.episodes.json`)

/** 角色名只允许字母数字下划线横线：拼路径前先卡一道。 */
export function safeRole(role) {
  const r = String(role ?? '').trim()
  if (!/^[a-z0-9_-]{1,32}$/i.test(r)) {
    throw new Error(`角色名不合法：${JSON.stringify(role)}（只允许字母数字下划线横线，1~32 位）`)
  }
  return r
}

function toMs(value) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value === undefined || value === null || value === '') return Date.now()
  const ms = Date.parse(String(value))
  return Number.isFinite(ms) ? ms : Date.now()
}

/** 「活着」的唯一判据：源事件没有被顶替、也没有进冷档（与 memory-pick 的注入口径一致）。 */
export function isAliveEvent(e) {
  return Boolean(e) && !e.supersededBy && e.cold !== true
}

/**
 * 读 <role>.json 的源事件，id 派生规则与 P3 完全一致（老事件没 id 时用「时间|正文」，
 * 撞了追加 #序号），否则 memberIds 会对不上。
 */
function readSourceEvents(role) {
  const file = srcFile(role)
  if (!fs.existsSync(file)) return []
  let doc
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return [] }
  const raw = Array.isArray(doc?.events) ? doc.events : []
  const events = []
  const seen = new Map()
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue
    const text = String(e.text || '')
    if (!text.trim()) continue
    const at = String(e.at || '')
    const base = String(e.id || `${at}|${text}`)
    const n = seen.get(base) || 0
    seen.set(base, n + 1)
    events.push({ ...e, id: n ? `${base}#${n}` : base, at, text })
  }
  return events
}

function readEpisodes(role) {
  const file = epFile(role)
  if (!fs.existsSync(file)) return null
  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    if (!doc || !Array.isArray(doc.episodes) || !doc.entities || typeof doc.entities !== 'object') return null
    return doc
  } catch {
    return null
  }
}

function eventMs(e) {
  const ms = Date.parse(String(e?.at || ''))
  return Number.isFinite(ms) ? ms : NaN
}

function byTimeThenId(a, b) {
  const ta = eventMs(a)
  const tb = eventMs(b)
  const va = Number.isFinite(ta) ? ta : Number.MAX_SAFE_INTEGER
  const vb = Number.isFinite(tb) ? tb : Number.MAX_SAFE_INTEGER
  return va - vb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * 元记忆三态回答。
 * @param {string} role
 * @param {string|{text?:string}} cue 当前这句话
 * @param {{now?:number|string|Date}} opts
 * @returns {{state:'unknown'|'know'|'partial', evidence:string[], note?:string}}
 */
export function metaAnswer(role, cue, { now = Date.now() } = {}) {
  const r = safeRole(role)
  const unknown = { state: 'unknown', evidence: [] }
  const doc = readEpisodes(r)
  if (!doc) return unknown

  const text = typeof cue === 'string' ? cue : String(cue?.text ?? '')
  const keys = entityKeysOf(text).filter((k) => doc.entities[k])
  if (!keys.length) return unknown // 抽不到实体，或实体根本不在画像里

  const byId = new Map(readSourceEvents(r).map((e) => [e.id, e]))
  const nowMs = toMs(now)
  const know = []
  const partial = []

  for (const key of keys) {
    const profile = doc.entities[key]
    const alive = (Array.isArray(profile?.sampleIds) ? profile.sampleIds : [])
      .map((id) => byId.get(String(id)))
      .filter(isAliveEvent)
      .sort(byTimeThenId)
    const ids = alive.map((e) => e.id)
    let lastMs = -Infinity
    for (const e of alive) {
      const ms = eventMs(e)
      if (Number.isFinite(ms) && ms > lastMs) lastMs = ms
    }
    const recent = Number.isFinite(lastMs) && nowMs - lastMs <= META_RECENT_MS
    if (alive.length >= META_MIN_SAMPLES && recent) know.push(...ids)
    else partial.push(...ids)
  }

  const uniq = (ids) => [...new Set(ids)]
  if (know.length) return { state: 'know', evidence: uniq(know) }
  // 实体在画像里、但样本被顶替/冷档/太少/太久没出现：明说「细节可能记不全」，不硬答。
  return { state: 'partial', evidence: uniq(partial), note: META_PARTIAL_NOTE }
}

/**
 * 一个情节里仍然活着的成员事件（不含被顶替、cold:true 的）。
 * @param {string} role
 * @param {string} episodeId
 * @returns {object[]} 按 memberIds 原顺序返回完整事件
 */
export function episodeEvidence(role, episodeId) {
  const r = safeRole(role)
  const doc = readEpisodes(r)
  if (!doc) return []
  const episode = doc.episodes.find((x) => x && x.id === String(episodeId ?? ''))
  if (!episode) return []
  const byId = new Map(readSourceEvents(r).map((e) => [e.id, e]))
  const out = []
  for (const id of (Array.isArray(episode.memberIds) ? episode.memberIds : [])) {
    const ev = byId.get(String(id))
    if (isAliveEvent(ev)) out.push(ev)
  }
  return out
}
