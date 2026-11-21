/* 标签
 * id: memory-core-query
 * kind: module
 * summary: 跨层查找：深层 turns / 中层手抄本 / 浅层在用；命中都带 turnId 和出处；支持自然语言时间窗。
 * tags: 查找, 召回, 跨层, turnId, 出处, 时间
 * created: 2026-11-13 00:10:00
 * changed: 2026-11-20 18:18:31
 * author: 大鱼·本班
 * authority: 老板（2026-11-13：跑通不出厂，继续完善记忆架构）
 * audience: turn-find、本体召回、未来 dsh-memory
 * owner: 框架；只读，不写、不删
 * mutable: 可改；命中必须带 turnId/出处，不许只给文件行
 * usage: find(q,{layers,limit,role}) / readableRoles(role) / view(turnId) / resolve(ref)
 * why: 之前新投影写出来只能手动翻文件，召回还在老库
 * result: 深层/中层/浅层能被同一次查找命中；卡上写了 episodeId 的浅层命中会原样带出
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from './root.js'
import { tokenizeForBM25, tokensWithAliases, bm25Scores } from '../pick.mjs'
import { heatMap } from './heat.js'
import { feedbackIndex } from './feedback.js'
import { tierOf, tierRank } from './tier.js'
import { tombstoneIndex, isTombstoned } from './tombstone.js'
import { linksOf } from './links.js'
import { parseTimeRange } from './time-range.js'
import { canRead } from './share.js'
// 2026-11-20：被召回记一次弱使用（老板「可以」），让经验/知识卡也能凭被想起次数上浮。
import { noteRecall } from './recall-use.js'
// 本地词频余弦：只为排序补漏，不冒充语义嵌入；不依赖外部模型。
function vectorFallback(needle, role, limit) {
  try {
    const safe = String(role || 'workbench').replace(/[\\/:*?"<>|\s]/g, '_')
    const file = path.join(dataRoot(HOME), 'runtime', safe, 'vector-index.json')
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    if (!Array.isArray(raw?.items)) return []
    const q = String(needle || '').trim()
    if (!q) return []
    const scored = raw.items.map((it) => ({ it, score: lexicalScore(q, it.text) }))
      .filter((x) => x.score >= 0.01)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Number(limit) || 20))
    return scored.map(({ it, score }) => ({
      turnId: it.meta?.turnId || '',
      key: it.meta?.key || it.id,
      layer: it.meta?.layer || '向量',
      snippet: String(it.text || '').replace(/\s+/g, ' ').slice(0, 120),
      ref: it.meta?.ref || '',
      at: it.meta?.at || '',
      why: '持久词频补漏',
      vectorScore: score,
      _ring: 0,
      _bm25: 0,
      _lex: score,
      _exact: false,
      heat: 0,
    }))
  } catch { return [] }
}
function lexicalScore(query, doc) {
  const tokenize = (text) => {
    const out = []
    const s = String(text || '').toLowerCase()
    for (const w of s.match(/[a-z0-9_]+/g) || []) out.push(w)
    const han = s.replace(/[^\u4e00-\u9fff]+/g, '')
    for (let i = 0; i + 1 < han.length; i += 1) out.push(han.slice(i, i + 2))
    return out.filter((t) => t.length >= 2)
  }
  const vec = (text) => {
    const m = new Map()
    for (const t of tokenize(text)) m.set(t, (m.get(t) || 0) + 1)
    return m
  }
  const a = vec(query)
  const b = vec(doc)
  if (!a.size || !b.size) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (const x of a.values()) na += x * x
  for (const x of b.values()) nb += x * x
  const small = a.size <= b.size ? a : b
  const other = small === a ? b : a
  for (const [k, x] of small) if (other.has(k)) dot += x * other.get(k)
  return dot / Math.sqrt(na * nb)
}


const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

// 人物别名：只用于“问 A 却命中 B”的硬排除，不做语义判断。
const PERSON_ALIASES = {
  老板: 'owner', 主人: 'owner', 从零开始: 'owner',
  大鱼: 'dayu', 大肥鱼: 'dayu',
  小鱼: 'xiaoyu', 小肥鱼: 'xiaoyu',
  照微: 'zhaowei',
}
function personsIn(text) {
  const s = String(text || '')
  const out = new Set()
  for (const [name, id] of Object.entries(PERSON_ALIASES)) if (s.includes(name)) out.add(id)
  return out
}

// 2026-11-17 老板：未绑卡会话的台账/结论落 workbench，图书馆查询却按角色过滤，
// 结果 workbench 的公共记录对谁都查不到。这里把可见范围定成：
//   有角色 → 本角色 + workbench 公共层；无角色/workbench → 只查 workbench 公共层。
// 别的角色私账（authorRole/role 是另一个人、又没 public/shared 给它）一律不进。
export const WORKBENCH_ROLE = 'workbench'

/** 查询可见范围（有顺序：本角色优先，workbench 兜底）。空角色=全库排障（显式无角色）；workbench=只看工作台。 */
export function readableRoles(role = '') {
  const r = String(role || '').trim()
  if (!r) return null
  if (r.toLowerCase() === WORKBENCH_ROLE) return [WORKBENCH_ROLE]
  return [r, WORKBENCH_ROLE]
}

/** 同一行记录是否落在可见范围内；旧的无主行（没有 authorRole/role）仍算公共。 */
function readableIn(row, roles) {
  if (!roles) return true
  return roles.some((r) => canRead(row, r))
}

const filesUnder = (dir, ext = '.jsonl', out = []) => {
  let es = []
  try { es = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of es) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) filesUnder(p, ext, out)
    else if (p.endsWith(ext)) out.push(p)
  }
  return out
}
const readRows = (files) => {
  const rows = []
  for (const f of files) {
    try {
      for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue
        try { rows.push({ ...JSON.parse(line), _file: f }) } catch { /* 坏行跳过 */ }
      }
    } catch { /* 读不到跳过 */ }
  }
  return rows
}
const textOfTurn = (r) => [
  ...(r.user || []).map((x) => x.text),
  ...(r.steps || []).flatMap((s) => (s.say || []).map((x) => x.text)),
  ...(r.thinkDigest || []).map((x) => x.text),
  ...(r.steps || []).flatMap((s) => (s.tools || []).map((t) => t.purpose || '')),
].join('\n')
const textOfMiddle = (r) => [r.head, r.body, ...(r.keywords || [])].join('\n')
const textOfInuse = (r) => [r.head, r.detail, ...(r.tags || []), ...(r.keywords || [])].join('\n')

const layerFiles = () => {
  const D = dataRoot(HOME)
  return {
    turns: filesUnder(path.join(D, '思考', 'turns')),
    middle: [
      ...filesUnder(path.join(D, 'library', '中层')),
      ...filesUnder(path.join(D, 'library', '手抄本')),
    ],
    inuse: filesUnder(path.join(D, 'library', '在用')),
  }
}

function snippet(text, q) {
  const s = String(text || '')
  const at = s.toLowerCase().indexOf(String(q).toLowerCase())
  if (at < 0) return s.replace(/\s+/g, ' ').slice(0, 120)
  return s.slice(Math.max(0, at - 40), at + String(q).length + 80).replace(/\s+/g, ' ')
}

export function find(q, {
  layers = ['turns', 'middle', 'inuse'],
  limit = 20,
  rings = 1,
  dedupe = false,
  now,
  timeZone,
  role = '',
  // 2026-11-20：只有“显式检索”才记弱使用；每轮自动联想/预注入默认不记（auto 太松）。
  recordUse = false,
} = {}) {
  const needle = String(q || '').trim()
  if (!needle) return []
  // 图书馆三层都按同一套可见范围筛：角色=本角色+workbench；workbench=只工作台；空角色=全库排障。
  // 以前只有浅层过滤，深层/中层会把别的角色的私账一起带出来。
  const scopeRoles = readableRoles(role)
  const visible = (r) => readableIn(r, scopeRoles)
  const qPersons = personsIn(needle)
  // 自然语言时间：先解析出时间窗和剩下的关键词；没有时间词就完全走原来的关键词/BM25。
  const timeOpts = {}
  if (now !== undefined) timeOpts.now = now
  if (timeZone) timeOpts.timeZone = timeZone
  const tr = parseTimeRange(needle, timeOpts)
  const kw = tr ? tr.rest : needle
  const f = layerFiles()
  const fb = feedbackIndex()
  const tombs = tombstoneIndex()
  const candidates = []
  const add = (layer, r, text) => {
    if (!text) return
    // 问“老板生日”却只命中“小鱼生日”：人物明确冲突时不做近似冒充。
    if (layer === '浅层' && qPersons.size && Array.isArray(r.people) && r.people.length) {
      const cardPersons = new Set(r.people.flatMap((p) => [...personsIn(p)]))
      if (![...qPersons].some((p) => cardPersons.has(p))) return
    }
    // 旧卡没有 turnId，但有 id/ref：仍然能按词查，只是不参与连线/按圈。
    const key = String(r.turnId || r.id || r.fromRef || r.ref || `${layer}:${r._file || ''}:${r.head || ''}`)
    if (!key) return
    const ref = layer === 'turns'
      ? String(r.source?.rawFile || r._file || '')
      : String(r.rawRef || r.ref || r._file || '')
    if (isTombstoned({ turnId: r.turnId, ref }, tombs)) return
    const feedback = fb.get(String(r.turnId)) || fb.get(ref) || null
    const tier = layer === '浅层' ? tierOf(r, feedback) : ''
    candidates.push({
      layer, text, ref, turnId: r.turnId || '', key, legacy: !r.turnId,
      eventKey: String(r.eventKey || ''),
      topicKey: String(r.topicKey || ''),
      links: linksOf(r),
      at: String(r.startedAt || r.at || ''),
      ...(tier ? { tier } : {}),
      ...(feedback ? { feedback } : {}),
      ...(r.modality ? { modality: r.modality } : {}),
      ...(r.speaker ? { speaker: r.speaker } : {}),
      // 事件段 ↔ 卡：卡上写了 episodeId 就原样带出；旧卡没有就是空，不现编。
      ...(r.episodeId ? { episodeId: String(r.episodeId) } : {}),
      ...(Array.isArray(r.mechanismIds) && r.mechanismIds.length ? { mechanismIds: r.mechanismIds } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.role ? { role: r.role } : {}),
      ...(r.sessionId ? { sessionId: r.sessionId } : {}),
      ...(r.authorRole ? { authorRole: r.authorRole } : {}),
      ...(r.visibility ? { visibility: r.visibility } : {}),
      ...(Array.isArray(r.sharedWith) && r.sharedWith.length ? { sharedWith: r.sharedWith } : {}),
    })
  }
  if (layers.includes('turns')) for (const r of readRows(f.turns)) {
    if (!visible(r)) continue
    add('深层', r, textOfTurn(r))
  }
  if (layers.includes('middle')) for (const r of readRows(f.middle)) {
    if (!visible(r)) continue
    add('中层', r, textOfMiddle(r))
  }
  if (layers.includes('inuse')) for (const r of readRows(f.inuse)) {
    // 只放行“自己的/显式共享的/公开的/旧的无主卡”，以及 workbench 公共层；私有卡不串角色。
    if (!visible(r)) continue
    add('浅层', r, textOfInuse(r))
  }

  const heats = heatMap({ now: Date.now() })
  candidates.forEach((c) => {
    c.heat = Number(heats.get(String(c.turnId || '')) || heats.get(String(c.ref || '')) || 0)
  })

  const score = (h) => {
    const x = h.feedback || {}
    return (x.good || 0) * 2 + (x.used || 0) - (x.bad || 0) * 2 - (x.unused || 0)
  }
  const toHit = (c, ring, why = '') => ({
    turnId: c.turnId,
    key: c.key,
    ...(c.legacy ? { legacy: true } : {}),
    layer: c.layer,
    snippet: ring === 0 ? snippet(c.text, kw) : c.text.replace(/\s+/g, ' ').slice(0, 120),
    ref: c.ref,
    at: c.at,
    ...(ring ? { related: true, why } : {}),
    ...(why && !ring ? { why } : {}),
    ...(c.eventKey ? { eventKey: c.eventKey } : {}),
    ...(c.topicKey ? { topicKey: c.topicKey } : {}),
    ...(c.links?.length ? { links: c.links } : {}),
    ...(c.tier ? { tier: c.tier } : {}),
    ...(c.feedback ? { feedback: c.feedback } : {}),
    ...(c.modality ? { modality: c.modality } : {}),
    ...(c.speaker ? { speaker: c.speaker } : {}),
    ...(c.episodeId ? { episodeId: c.episodeId } : {}),
    ...(Array.isArray(c.mechanismIds) && c.mechanismIds.length ? { mechanismIds: c.mechanismIds } : {}),
    ...(c.status ? { status: c.status } : {}),
    ...(c.role ? { role: c.role } : {}),
    ...(c.sessionId ? { sessionId: c.sessionId } : {}),
    ...(c.authorRole ? { authorRole: c.authorRole } : {}),
    ...(c.visibility ? { visibility: c.visibility } : {}),
    ...(c.sharedWith?.length ? { sharedWith: c.sharedWith } : {}),
    _ring: ring,
    _bm25: c._bm25 || 0,
    _lex: c._lex || 0,
    _exact: Boolean(c._exact),
    heat: Number(c.heat || 0),
  })

  // 时间短语：先按 at 收紧候选（半开 [from, to)）。at 认不出的记录证明不了在那段时间里，时间查询时排除。
  let pool = candidates
  if (tr) {
    const fromMs = Date.parse(tr.from)
    const toMs = Date.parse(tr.to)
    pool = Number.isFinite(fromMs) && Number.isFinite(toMs)
      ? candidates.filter((c) => {
          const t = Date.parse(c.at)
          return Number.isFinite(t) && t >= fromMs && t < toMs
        })
      : []
  }

  const finish = (hits) => {
    const out = (dedupe ? collapseByTurn(hits) : hits).slice(0, Math.max(1, Number(limit) || 20))
    // 2026-11-20：只有显式检索（recordUse=true）才记弱使用；自动联想/预注入不记。
    if (recordUse) {
      for (const h of out) {
        const key = String(h?.key || h?.turnId || '')
        const layer = String(h?.layer || '')
        if (key && (layer === '卡片' || layer === '浅层' || /^r-/.test(key))) {
          try { noteRecall(key, { source: 'explicit' }) } catch { /* 记不上不影响查询 */ }
        }
      }
    }
    return tr ? out.map((h) => ({ ...h, timeRange: { from: tr.from, to: tr.to, label: tr.label } })) : out
  }

  // 只有时间、没有剩下的关键词：返回那一段里的事件本身，按时间倒序。
  if (tr && !kw) {
    const timeHits = pool
      .map((c) => toHit(c, 0, '时间命中'))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    return finish(timeHits)
  }

  // 关键词 + 别名 + BM25：换说法/近义也能进候选；最终仍带出处、可解释。
  const qTokens = tokensWithAliases(kw)
  const bm = bm25Scores(pool.map((c) => tokenizeForBM25(c.text)), qTokens)
  pool.forEach((c, i) => {
    c._bm25 = Number(bm[i]) || 0
    c._lex = lexicalScore(needle, c.text)
  })

  for (const c of pool) c._exact = c.text.toLowerCase().includes(kw.toLowerCase())
  const directExact = pool.filter((c) => c._exact).map((c) => toHit(c, 0))
  const weakAll = pool.filter((c) => !c._exact && c._bm25 > 0)
  const weakNew = weakAll.filter((c) => !c.legacy).sort((a, b) => b._bm25 - a._bm25).slice(0, Math.max(5, Math.floor((Number(limit) || 20) / 2)))
  const weakOld = weakAll.filter((c) => c.legacy).sort((a, b) => b._bm25 - a._bm25).slice(0, 5)
  const directWeak = [...weakNew, ...weakOld].map((c) => toHit(c, 0, '词/别名命中'))
  const direct = [...directExact, ...directWeak]
  if (!direct.length || !rings) {
    if (!direct.length) {
      const vh = vectorFallback(needle, role, limit)
      if (vh.length) return finish(vh)
    }
    return finish(direct.sort(byRelevance))
  }

  const eventKeys = new Set(direct.map((h) => h.eventKey).filter(Boolean))
  const topicKeys = new Set(direct.map((h) => h.topicKey).filter(Boolean))
  const linked = new Set()
  for (const h of direct) for (const l of (h.links || [])) linked.add(String(l.to))
  const directKeys = new Set(direct.map((h) => `${h.layer}|${h.key || h.turnId}`))
  const maxRelated = Math.min(10, Math.max(2, Math.floor((Number(limit) || 20) / 2)))
  const related = []
  // 时间查询只在一圈内看时间窗里的候选，免得把窗外同一话题的旧事也拉回来。
  for (const c of pool) {
    if (directKeys.has(`${c.layer}|${c.key || c.turnId}`)) continue
    let why = ''
    if (c.eventKey && eventKeys.has(c.eventKey)) why = '同一件事'
    else if (c.topicKey && topicKeys.has(c.topicKey)) why = '同一话题'
    else if (linked.has(String(c.turnId)) || linked.has(String(c.ref))) why = '直接关联'
    if (!why) continue
    related.push(toHit(c, 1, why))
    if (related.length >= maxRelated) break
  }
  const all = [...direct, ...related].sort(byRelevance)
  return finish(all)
}

/** 同一 turn 在深层/中层/浅层各有一份时，只留最精的一张：浅层 > 中层 > 深层。 */
function collapseByTurn(hits) {
  const rank = { 浅层: 0, 中层: 1, 深层: 2 }
  const by = new Map()
  const out = []
  for (const h of hits) {
    const key = String(h.key || h.turnId || '')
    if (!key) { out.push(h); continue }
    const prev = by.get(key)
    if (!prev) { by.set(key, h); out.push(h); continue }
    const keep = (rank[h.layer] ?? 3) < (rank[prev.layer] ?? 3) ? h : prev
    const drop = keep === h ? prev : h
    const also = [...new Set([...(keep.alsoLayers || []), drop.layer, ...(drop.alsoLayers || [])])].filter((x) => x && x !== keep.layer)
    keep.alsoLayers = also
    if (keep !== prev) {
      const i = out.indexOf(prev)
      if (i >= 0) out[i] = keep
      by.set(key, keep)
    }
  }
  return out
}

function byRelevance(a, b) {
  if ((a._ring || 0) !== (b._ring || 0)) return (a._ring || 0) - (b._ring || 0)
  if (Boolean(a._exact) !== Boolean(b._exact)) return a._exact ? -1 : 1
  // 同样相关时，新卡优先；旧卡仍能查，但不抢新卡的位。
  if (Boolean(a.legacy) !== Boolean(b.legacy)) return a.legacy ? 1 : -1
  // 都是“词/别名候选”时，先看 BM25 相关度，再看游/反馈/时间。
  if (!a._exact && !b._exact) {
    // 词频只做补漏：BM25 为主，词频余弦加一点权重，避免压过精确命中。
    const rel = (c) => Number(c._bm25 || 0) + Number(c._lex || 0) * 0.25
    const d = rel(b) - rel(a)
    if (Math.abs(d) > 1e-6) return d
  }
  const score = (h) => {
    const x = h.feedback || {}
    return (x.good || 0) * 2 + (x.used || 0) - (x.bad || 0) * 2 - (x.unused || 0)
  }
  return (tierRank(a.tier) - tierRank(b.tier)) || (score(b) - score(a)) || String(b.at).localeCompare(String(a.at))
}

export function recentRows(limit = 20) {
  const D = dataRoot(HOME)
  const rows = readRows(filesUnder(path.join(D, '思考', 'turns')))
  return rows
    .sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')))
    .slice(0, Math.max(1, Number(limit) || 20))
}

export function view(turnId) {
  const id = String(turnId || '').trim()
  if (!id) return null
  const D = dataRoot(HOME)
  for (const f of filesUnder(path.join(D, '思考', 'turns'))) {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      let r = null
      try { r = JSON.parse(line) } catch { continue }
      if (String(r.turnId || '') === id) return r
    }
  }
  return null
}

export function resolve(ref) {
  const s = String(ref || '')
  const m = /^turn:([^#]+)#(\d+)/.exec(s)
  if (m) return view(`${m[1]}#${m[2]}`)
  return null
}
