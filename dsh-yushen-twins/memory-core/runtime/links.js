/* 标签
 * id: memory-core-links
 * kind: module
 * summary: 纸与纸之间的“线”：承上启下用；只算关系，不读写文件。
 * tags: 线, 关联, 承上启下, 硬线中线软线, 纯函数, 单一实现
 * created: 2026-11-13 18:36:00
 * changed: 2026-11-13 18:36:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-13：每张纸要把线留好，查的时候按圈拉）
 * audience: 精提炼、手动写卡、query 的按圈拉
 * owner: 框架；线的类型和强弱只在这里定
 * mutable: 可改；别处不另起一套 links
 * usage: normalizeLink(link) / addLinks(card,links) / linksOf(card) / relatedKeys(card)
 * why: 之前每张纸只有 turnId/ref，没有统一的 links，纸与纸之间连不起来
 * result: 卡上多一个 links 数组；归一、去重、按圈收集都有唯一实现
 */
export const LINK_TYPES = Object.freeze({
  prev: '上一轮',
  next: '下一轮',
  same_event: '同一件事',
  same_topic: '同一话题',
  cause: '因为',
  effect: '导致',
  task: '任务',
  result: '结果',
  person: '人物',
  emotion: '情绪',
})

export const STRENGTHS = Object.freeze({ hard: 1, medium: 0.5, soft: 0.2 })

// 一张纸最多带 20 条线；再多查的时候也拉不动，先这样。
const MAX_LINKS = 20
// why 只留一句，别把整段正文塞进来。
const MAX_WHY = 200

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)
const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n)

/**
 * 强度归一：认 hard/medium/soft，也认数字（夹在 0~1），JSON 里写成字符串的“0.8”也收。
 * 认不出来就按中线 medium，不猜它是硬线。
 */
function strengthOf(s) {
  if (typeof s === 'number' && Number.isFinite(s)) return clamp01(s)
  const k = String(s ?? '').trim().toLowerCase()
  if (k && has(STRENGTHS, k)) return STRENGTHS[k]
  if (k && Number.isFinite(Number(k))) return clamp01(Number(k))
  return STRENGTHS.medium
}

/**
 * 一条线归一：{type,to,strength,why}；不认识就返回 null，不猜、不硬塞。
 * - type 必须是 LINK_TYPES 的键（上一轮/下一轮/同一件事/…）；
 * - to 必须是非空字符串（目标 card id，或 turnId/ref）；
 * - strength 缺省 medium；why 只留一句，可以为空，但最好写清“为什么连着”。
 */
export function normalizeLink(link = {}) {
  if (!link || typeof link !== 'object' || Array.isArray(link)) return null
  const type = String(link.type ?? '').trim()
  if (!has(LINK_TYPES, type)) return null
  if (typeof link.to !== 'string') return null
  const to = link.to.trim()
  if (!to) return null
  return {
    type,
    to,
    strength: strengthOf(link.strength),
    why: String(link.why ?? '').trim().slice(0, MAX_WHY),
  }
}

/**
 * 读一张纸上的线：容忍坏数据（没 links、links 不是数组、里面混了 null/坏对象）。
 * 返回的是归一后的新数组，原卡不动。
 */
export function linksOf(card = {}) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return []
  const raw = Array.isArray(card.links) ? card.links : []
  const out = []
  for (const x of raw) {
    const l = normalizeLink(x)
    if (l) out.push(l)
  }
  return out
}

/**
 * 往一张纸上添线，返回新的 card 对象（不修改入参，新旧数组也不共用）。
 * - 旧线留着，同样过一遍归一；坏的丢掉；
 * - 按 type+to 去重，先来的留下；
 * - 最多 20 条，按顺序截断；
 * - 非法新线直接丢，不报错。
 */
export function addLinks(card = {}, links = []) {
  const base = card && typeof card === 'object' && !Array.isArray(card) ? { ...card } : {}
  const out = []
  const seen = new Set()
  const push = (l) => {
    if (!l || out.length >= MAX_LINKS) return
    const k = `${l.type}|${l.to}`
    if (seen.has(k)) return
    seen.add(k)
    out.push(l)
  }
  for (const l of linksOf(base)) push(l)
  // 一次只给一条也收，图个方便。
  const list = Array.isArray(links)
    ? links
    : (links && typeof links === 'object' ? [links] : [])
  for (const x of list) push(normalizeLink(x))
  return { ...base, links: out }
}

/**
 * 按圈拉时用的键：本轮、出处、上一张、这件事、这个话题，加上每条线的 to。
 * 只收非空字符串，去重，保持“先本纸自己的，再线上的”顺序。
 */
export function relatedKeys(card = {}) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return []
  const out = []
  const seen = new Set()
  const add = (v) => {
    if (typeof v !== 'string' && typeof v !== 'number') return
    const k = String(v).trim()
    if (!k || seen.has(k)) return
    seen.add(k)
    out.push(k)
  }
  for (const f of ['turnId', 'ref', 'fromRef', 'eventKey', 'topicKey']) add(card[f])
  for (const l of linksOf(card)) add(l.to)
  return out
}
