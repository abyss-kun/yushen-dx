/* 标签
 * id: lib-memory-triggers
 * kind: module
 * tags: 记忆, 触发器, 前瞻, 到期, 幂等
 * created: 2026-11-07 21:40:00
 * changed: 2026-11-07 21:42:01
 * author: 照微·子会话（实现代理）
 * authority: 老板（2026-11-07 融合方案 P4 前瞻触发器：docs/融合方案-记忆.md §5 P4、§8.1）
 * why: 只有「想起来」还不够——说到某个话题才该提的那件事、承诺到期当天该说的那句话，
 *      现在都没有地方存，只能靠每次现场猜。
 * result: <role>.triggers.json 存触发器：{ version:1, triggers:[{ id, text, when:{entities?,keywords?,dueAt?},
 *         createdAt, firedAt?, firedCount }] }。接口 add / list / match / fire；
 *         id 走内容哈希（同内容同 id，可复现）；fire 按「同一天同一个 id 只算一次」幂等；
 *         坏 JSON 一律当空库返回，不抛。
 * mutable: 可改
 *
 * 边界（写清楚，别让下一个人猜）：
 *   · 纯 JS、无外部依赖；不读人格/角色卡/宪章，将来可以整份搬进 memory-core；
 *   · 匹配只看「触发器自己存下的实体/关键词」+ dueAt，不在这里做实体抽取（抽取在 P2/P3）；
 *   · cue 传字符串就按字面包含匹配；传 { text, entities } 时实体再跟 entities 交集；
 *   · 已触发过的触发器仍然会被 match 返回（要不要再说由调用方按 firedAt/firedCount 决定），
 *     listTriggers({ open:true }) 只给「还没触发过」的；
 *   · dueAt 只认能被 Date.parse 解析的时间；写盘前统一成 ISO。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

export const TRIGGER_VERSION = 1
export const ID_PREFIX = 'tr-'
export const ENTITY_WEIGHT = 2   // 实体命中一次算 2 分（比关键词更准）
export const KEYWORD_WEIGHT = 1  // 关键词命中一次算 1 分
export const DUE_WEIGHT = 1.5    // 到期本身算 1.5 分（不抢实体命中，但单独也能冒头）

const home = () => process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const memDir = () => path.join(home(), 'dayu', 'soul', 'memory')

/** 角色名只允许字母数字下划线横线：拼路径前先卡一道，别让 role 拐到别的目录去。 */
export function safeRole(role) {
  const r = String(role ?? '').trim()
  if (!/^[a-z0-9_-]{1,32}$/i.test(r)) {
    throw new Error(`角色名不合法：${JSON.stringify(role)}（只允许字母数字下划线横线，1~32 位）`)
  }
  return r
}

/** 触发器文件路径（导出给 CLI/测试用；路径由 DSH_HOME 懒取）。 */
export function triggerFile(role) {
  return path.join(memDir(), `${safeRole(role)}.triggers.json`)
}

function toMs(value) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value === undefined || value === null || value === '') return Date.now()
  const ms = Date.parse(String(value))
  return Number.isFinite(ms) ? ms : Date.now()
}

/** 本地日键（YYYY-MM-DD）：fire 的「同一天只算一次」按本地日算，跨时区不会半夜重记。 */
function dayKey(ms) {
  const d = new Date(ms)
  const p2 = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

/** 去空、去重（大小写不敏感），保留第一次出现的原词。 */
function normalizeList(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const out = []
  for (const x of list) {
    const word = String(x ?? '').trim()
    if (!word) continue
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(word)
  }
  return out
}

function normalizeCue(cue) {
  const text = typeof cue === 'string' ? cue : String(cue?.text ?? '')
  const entities = new Set()
  if (Array.isArray(cue?.entities)) {
    for (const x of cue.entities) entities.add(String(x ?? '').trim().toLowerCase())
  }
  return { text: text.toLowerCase(), entities }
}

// ── 读 / 写 ────────────────────────────────────────────────────────────────
function emptyStore(file) {
  return { version: TRIGGER_VERSION, triggers: [], broken: false, file }
}

/**
 * 读库。文件不在 = 空库；文件坏了 = 空库 + broken=true。
 * 两种情况都不抛：触发器是「锦上添花」，不能因为一个坏文件把整轮对话拖垮。
 */
function readStore(role) {
  const file = triggerFile(role)
  if (!fs.existsSync(file)) return emptyStore(file)
  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    const triggers = Array.isArray(doc?.triggers)
      ? doc.triggers.filter((t) => t && typeof t === 'object' && t.id && t.text)
        .map((t) => ({
          ...t,
          when: t.when && typeof t.when === 'object' ? t.when : {},
          firedCount: Number(t.firedCount) || 0,
        }))
      : []
    return { version: Number(doc?.version) || TRIGGER_VERSION, triggers, broken: false, file }
  } catch {
    return { ...emptyStore(file), broken: true }
  }
}

function writeAtomic(file, doc) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, file)
}

/** id = 内容哈希：同一角色 + 同一正文 + 同一实体/关键词/到期时间 → 永远同一个 id（可复现）。 */
function triggerId(role, { text, entities, keywords, dueAt }) {
  const payload = [
    'v1',
    role,
    text,
    [...entities].map((x) => x.toLowerCase()).sort().join(','),
    [...keywords].map((x) => x.toLowerCase()).sort().join(','),
    dueAt || '',
  ].join('|')
  return `${ID_PREFIX}${crypto.createHash('sha1').update(payload).digest('hex').slice(0, 12)}`
}

// ── 对外接口 ───────────────────────────────────────────────────────────────
/**
 * 新增一个触发器。同内容（正文 + 实体 + 关键词 + dueAt）重复调用不会重复写，返回已有 id。
 * @param {string} role
 * @param {{text:string, entities?:string[], keywords?:string[], dueAt?:string|number|Date}} spec
 * @returns {{id:string, existed:boolean, file:string}}
 */
export function addTrigger(role, { text, entities, keywords, dueAt } = {}) {
  const r = safeRole(role)
  const body = String(text ?? '').trim()
  if (!body) throw new Error('触发器正文不能为空')
  const ents = normalizeList(entities)
  const kws = normalizeList(keywords)
  let due = ''
  if (dueAt !== undefined && dueAt !== null && String(dueAt).trim() !== '') {
    const ms = Date.parse(String(dueAt))
    if (!Number.isFinite(ms)) throw new Error(`dueAt 不是合法时间：${JSON.stringify(dueAt)}`)
    due = new Date(ms).toISOString()
  }
  const when = {}
  if (ents.length) when.entities = ents
  if (kws.length) when.keywords = kws
  if (due) when.dueAt = due

  const id = triggerId(r, { text: body, entities: ents, keywords: kws, dueAt: due })
  const store = readStore(r)
  if (store.triggers.some((t) => t.id === id)) return { id, existed: true, file: store.file }

  store.triggers.push({
    id,
    text: body,
    when,
    createdAt: new Date(toMs()).toISOString(),
    firedCount: 0,
  })
  writeAtomic(store.file, { version: TRIGGER_VERSION, triggers: store.triggers })
  return { id, existed: false, file: store.file }
}

/**
 * 列触发器。
 * @param {string} role
 * @param {{open?:boolean}} opts open:true 只列「还没触发过」（没有 firedAt）的
 * @returns {object[]}
 */
export function listTriggers(role, { open } = {}) {
  const store = readStore(safeRole(role))
  const rows = open === true ? store.triggers.filter((t) => !t.firedAt) : store.triggers
  return rows.map((t) => ({ ...t, when: { ...(t.when || {}) } }))
}

/**
 * 用当前线索找该提的触发器。
 * 命中规则（满足任意一条）：实体交集 / 关键词包含 / dueAt 已到期。
 * @param {string} role
 * @param {string|{text?:string, entities?:string[]}} cue
 * @param {{now?:number|string|Date}} opts
 * @returns {object[]} 命中项（原字段 + score + matched），按命中强度降序；同分按 id
 */
export function matchTriggers(role, cue, { now = Date.now() } = {}) {
  const store = readStore(safeRole(role))
  const c = normalizeCue(cue)
  const nowMs = toMs(now)
  const out = []
  for (const t of store.triggers) {
    const when = t.when && typeof t.when === 'object' ? t.when : {}
    const entHits = normalizeList(when.entities).filter((word) => {
      const w = word.toLowerCase()
      return c.entities.has(w) || c.text.includes(w)
    })
    const kwHits = normalizeList(when.keywords).filter((word) => c.text.includes(word.toLowerCase()))
    let due = false
    if (when.dueAt) {
      const dueMs = Date.parse(String(when.dueAt))
      if (Number.isFinite(dueMs) && nowMs >= dueMs) due = true
    }
    if (!entHits.length && !kwHits.length && !due) continue
    const score = entHits.length * ENTITY_WEIGHT + kwHits.length * KEYWORD_WEIGHT + (due ? DUE_WEIGHT : 0)
    out.push({
      ...t,
      when: { ...when },
      score,
      matched: { entities: entHits, keywords: kwHits, due },
    })
  }
  out.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return out
}

/**
 * 记一次触发：写 firedAt / firedCount。
 * 幂等：同一 id 同一个本地日只算一次——同一天再调返回 fired:false，计数不动。
 * @param {string} role
 * @param {string} id
 * @param {{now?:number|string|Date}} opts
 * @returns {{id:string, fired:boolean, firedAt?:string, firedCount:number, reason?:string}}
 */
export function fireTrigger(role, id, { now = Date.now() } = {}) {
  const store = readStore(safeRole(role))
  const key = String(id ?? '').trim()
  const t = store.triggers.find((x) => x.id === key)
  if (!t) return { id: key, fired: false, firedCount: 0, reason: '没有这个触发器' }

  const nowMs = toMs(now)
  const lastMs = t.firedAt ? Date.parse(String(t.firedAt)) : NaN
  if (Number.isFinite(lastMs) && dayKey(lastMs) === dayKey(nowMs)) {
    return {
      id: t.id,
      fired: false,
      firedAt: t.firedAt,
      firedCount: Number(t.firedCount) || 0,
      reason: '今天已经记过一次',
    }
  }

  t.firedAt = new Date(nowMs).toISOString()
  t.firedCount = (Number(t.firedCount) || 0) + 1
  writeAtomic(store.file, { version: TRIGGER_VERSION, triggers: store.triggers })
  return { id: t.id, fired: true, firedAt: t.firedAt, firedCount: t.firedCount }
}
