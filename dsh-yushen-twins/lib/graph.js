// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-graph
 * kind: module
 * summary: 记忆图「从任意点拉一层」：给事件段/卡/机制的 id，只读拉出它本身和一层邻居。
 * tags: 记忆图, 节点, 一层邻居, 只读, 零模型
 * created: 2026-11-16 22:32:30
 * changed: 2026-11-16 22:32:30
 * author: 大鱼·子代理（记忆图最小模块）
 * authority: 老板（2026-11-16：从任意点拉一层，先做只读最小模块，不建新表）
 * audience: 她（以后按点查「这件事连着什么」）、维护者、脚本
 * owner: 框架；只读事件段/卡/机制三处真源，自己不留数据
 * defaults: limit=5（每类邻居最多几条）；机制默认读 docs/记忆架构-节点图.json
 * off: 不调用就完全不参与任何流程；不影响 capture/refine/注入
 * mutable: 可改；**只读**，不写盘、不调模型、不建新记忆表
 * usage: expandPoint({kind:'episode'|'card'|'mechanism', id, role, limit}) → {ok,node,related:{episodes,cards,mechanisms},note}
 * why: 事件段/卡/机制三处已经互相写着指针，却没有一个入口能「从任意一点往外看一层」
 * result: 一个节点 + 一层邻居；卡按 canRead 过滤；找不到就 ok:false，不编、不补
 */
// 记忆图「从任意点拉一层」（最小模块）：
//
// 三个起点，各自只拉**一层**：
//   episode   读段 → refs 指针 → cardsForEpisode 找挂在它上面的卡；
//   card      findCard → episodeId 对应事件段 → mechanismIds 对应机制；
//   mechanism findMechanism → 按名字查相关事件段（findEpisodesAny）→ 按 mechanismIds 扫卡。
//
// 隐私口径（和 share.js 一致，不另立一套）：
//   · 卡：只有 canRead(role, card) 才返回；role 为空时一张卡都不返回；
//   · 事件段：公共时间线，找到就返回（可以来自别的角色，node.role 标明是谁的）；
//   · 机制：公共，不属于哪个角色。
//
// 纯读：不联网、不叫模型、不写任何文件、不建新表；坏行/坏文件跳过，不抛。
import fs from 'node:fs'
import path from 'node:path'
import { dataRoot } from '../memory-core/runtime/root.js'
import { readEpisodes, cardsForEpisode, findEpisodesAny } from '../memory-core/runtime/episode.js'
import { findCard, canRead } from '../memory-core/runtime/share.js'
import { findMechanism } from './mechanism-registry.js'

export const DEFAULT_LIMIT = 5
const KINDS = new Set(['episode', 'card', 'mechanism'])

const str = (v) => (v === null || v === undefined ? '' : String(v).trim())
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d }

function uniq(xs) {
  const out = []
  const seen = new Set()
  for (const x of xs) {
    const s = str(x)
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

const strList = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : [])

/** 卡的机制指针：新卡是 mechanismIds（数组/逗号串），老卡兼容单数 mechanismId。 */
function mechanismIdsOf(row) {
  const out = []
  const push = (v) => {
    if (v === null || v === undefined) return
    const items = Array.isArray(v) ? v : String(v).split(/[,，、/|;；]+/)
    for (const x of items) {
      const s = str(x)
      if (s) out.push(s)
    }
  }
  push(row?.mechanismIds)
  push(row?.mechanismId)
  return uniq(out)
}

const whenOf = (row) => str(row?.at || row?.createdAt)
const byNewest = (a, b) => whenOf(b).localeCompare(whenOf(a))

function walkJsonl(dir, out = []) {
  let es = []
  try { es = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of es) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walkJsonl(p, out)
    else if (p.endsWith('.jsonl')) out.push(p)
  }
  return out
}

/** library/meta 下现有事件段文件的角色名（只用来枚举公共时间线，不按它做权限）。 */
function metaRoles() {
  let files = []
  try { files = fs.readdirSync(path.join(dataRoot(), 'library', 'meta')) } catch { return [] }
  return uniq(files.filter((f) => /^episodes-.+\.jsonl$/.test(f)).map((f) => f.replace(/^episodes-/, '').replace(/\.jsonl$/, '')))
}

/**
 * 按 id 找事件段（公共时间线：先看本角色，再看别的角色）。
 * 同 id 多个版本时取 endAt 最新的一版；解析不了 endAt 的排最后。
 */
function findEpisodeById(id, preferRole) {
  const want = str(id)
  if (!want) return null
  let best = null
  for (const role of uniq([str(preferRole), ...metaRoles()])) {
    for (const ep of readEpisodes(role)) {
      if (str(ep.id) !== want) continue
      const endMs = Date.parse(str(ep.endAt))
      const rank = Number.isFinite(endMs) ? endMs : -Infinity
      if (!best || rank >= best.rank) best = { episode: ep, role, rank }
    }
  }
  return best ? { episode: best.episode, role: best.role } : null
}

function episodeNode(ep, role) {
  return {
    kind: 'episode',
    id: str(ep.id),
    role: str(role),
    startAt: str(ep.startAt),
    endAt: str(ep.endAt),
    sessionId: str(ep.sessionId),
    channel: str(ep.channel),
    label: str(ep.label),
    people: strList(ep.people),
    turnIds: strList(ep.turnIds),
    refs: strList(ep.refs),
    topic: str(ep.topic),
    keywords: strList(ep.keywords),
    domain: str(ep.domain),
    domainKind: str(ep.domainKind),
    confidence: str(ep.confidence),
  }
}

function episodeBrief(ep, role) {
  return {
    id: str(ep.id),
    role: str(role),
    startAt: str(ep.startAt),
    endAt: str(ep.endAt),
    label: str(ep.label),
    ref: strList(ep.refs)[0] || '',
  }
}

function cardNode(row, hit, role) {
  const index = Number(hit?.index)
  return {
    kind: 'card',
    id: str(row.id || row.ref || ''),
    role: str(row.authorRole || row.role), // 作者；旧卡没有作者就是空
    readableBy: str(role),
    cardKind: str(row.kind),
    head: str(row.head || row.title).slice(0, 200),
    detail: str(row.detail || row.text || row.summary).slice(0, 600),
    at: whenOf(row),
    episodeId: str(row.episodeId),
    mechanismIds: mechanismIdsOf(row),
    visibility: str(row.visibility),
    sharedWith: strList(row.sharedWith),
    file: str(hit?.file),
    line: Number.isFinite(index) && index >= 0 ? index + 1 : 0,
  }
}

function cardBrief(row) {
  return {
    id: str(row.id || row.ref || ''),
    role: str(row.authorRole || row.role),
    cardKind: str(row.kind),
    head: str(row.head || row.title).slice(0, 200),
    at: whenOf(row),
    episodeId: str(row.episodeId),
    mechanismIds: mechanismIdsOf(row),
    visibility: str(row.visibility),
  }
}

function mechanismNode(rec) {
  return {
    kind: 'mechanism',
    id: str(rec.mechanismId),
    role: '', // 机制是公共的，不属于哪个角色
    name: str(rec.name),
    principle: str(rec.principle),
    input: str(rec.input),
    output: str(rec.output),
    files: strList(rec.files),
    tests: strList(rec.tests),
    status: str(rec.status),
    notes: str(rec.notes),
    source: str(rec.source),
  }
}

/**
 * 事件段 → 卡：先按本角色查，再按其它角色查（公开共享的卡也要能拉出来），
 * 最后统一用 canRead 卡一遍。role 空 → 一张都不返回。
 */
function readableCardsForEpisode(role, episodeId, limit) {
  const who = str(role)
  const want = str(episodeId)
  if (!who || !want) return []
  const rows = []
  const seen = new Set()
  for (const r of uniq([who, ...metaRoles()])) {
    for (const row of cardsForEpisode(r, want, { limit })) {
      if (!canRead(row, who)) continue
      const key = str(row.id || row.ref || row.fromRef || row.head)
      if (key && seen.has(key)) continue
      if (key) seen.add(key)
      rows.push(row)
    }
  }
  rows.sort(byNewest)
  return rows.slice(0, limit)
}

/**
 * 机制 → 卡：扫 library/在用 下所有 .jsonl，只认卡上显式写着的 mechanismIds。
 * 坏行/坏文件跳过；卡再按 canRead 过滤；同 id 只留一张（按 at 倒序）。
 */
function cardsForMechanism(role, mechanismId, limit) {
  const who = str(role)
  const want = str(mechanismId).toLowerCase()
  if (!who || !want) return []
  const rows = []
  for (const file of walkJsonl(path.join(dataRoot(), 'library', '在用'))) {
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch { continue }
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue
      let row = null
      try { row = JSON.parse(line.replace(/^\uFEFF/, '')) } catch { continue }
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue
      if (!mechanismIdsOf(row).some((x) => x.toLowerCase() === want)) continue
      if (!canRead(row, who)) continue
      rows.push(row)
    }
  }
  rows.sort(byNewest)
  const seen = new Set()
  const out = []
  for (const row of rows) {
    const key = str(row.id || row.ref || row.fromRef || row.head)
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    out.push(row)
    if (out.length >= limit) break
  }
  return out
}

/** 卡上的 mechanismIds → 机制记录；查不到的不编，跳过。 */
function mechanismsByIds(ids, opts, limit) {
  const out = []
  for (const id of ids) {
    let rec = null
    try { rec = findMechanism(id, opts) } catch { rec = null }
    if (!rec || out.some((m) => m.id === rec.mechanismId)) continue
    out.push(mechanismNode(rec))
    if (out.length >= limit) break
  }
  return out
}

/**
 * 从任意一个点拉一层。
 *
 * @param {{kind?: 'episode'|'card'|'mechanism', id?: string, role?: string, limit?: number, mechanismFile?: string}} [point]
 *   - kind：起点类型；episode / card / mechanism，其它值返回 ok:false。
 *   - id：起点 id；card 是卡 id，mechanism 可以是 id 或名字（同 findMechanism）。
 *   - role：当前角色（隐私过滤用）。不给时：卡一律不返回，事件段/机制照常（公共）。
 *   - limit：每类邻居最多几条，默认 5。
 *   - mechanismFile：机制真源文件（默认 docs/记忆架构-节点图.json；测试/夹具可换）。
 * @returns {{ok: boolean, node: object|null, related: {episodes: object[], cards: object[], mechanisms: object[]}, note: string}}
 *   找不到 → ok:false、node:null、related 三个空数组；note 说明原因。
 *   不写盘、不调模型；坏行/坏文件跳过，不抛。
 */
export function expandPoint(point = {}) {
  const kind = str(point?.kind)
  const id = str(point?.id)
  const role = str(point?.role)
  const limit = Math.max(1, Math.floor(num(point?.limit, DEFAULT_LIMIT)))
  const mechOpts = str(point?.mechanismFile) ? { file: str(point.mechanismFile) } : {}
  const related = { episodes: [], cards: [], mechanisms: [] }
  const miss = (note) => ({ ok: false, node: null, related, note })

  if (!KINDS.has(kind)) return miss(`不认识的起点类型：${kind || '（空）'}；只支持 episode / card / mechanism`)
  if (!id) return miss('id 不能为空（没有 id 就不知道从哪个点拉）')

  if (kind === 'episode') {
    const hit = findEpisodeById(id, role)
    if (!hit) return miss(`找不到这个事件段：${id}`)
    related.cards = role ? readableCardsForEpisode(role, hit.episode.id, limit).map(cardBrief) : []
    return {
      ok: true,
      node: episodeNode(hit.episode, hit.role),
      related,
      note: role
        ? '只拉一层：事件段（公共时间线）→ 挂在它上面的卡（按 canRead 过滤）。refs 只是指针，原文用 expandEpisode 展开；不写盘、不调模型。'
        : '只拉一层：事件段（公共时间线）→ 卡。没给 role，卡一律不返回；refs 只是指针；不写盘、不调模型。',
    }
  }

  if (kind === 'card') {
    // findCard 内部直接 readFileSync：文件在扫描后消失/读不了时会抛，这里兜住（坏行/坏文件不崩）。
    let hit = null
    try { hit = findCard(id) } catch { hit = null }
    if (!hit || !hit.row) return miss(`找不到这张卡：${id}`)
    // 隐私：读不了就当「找不到」，不吐正文、也不额外确认它的存在。
    if (!canRead(hit.row, role)) return miss(`找不到这张卡：${id}（不存在，或当前角色无权读）`)
    const row = hit.row
    const epId = str(row.episodeId)
    if (epId) {
      const ep = findEpisodeById(epId, str(row.authorRole || row.role))
      if (ep) related.episodes.push(episodeBrief(ep.episode, ep.role))
    }
    related.mechanisms = mechanismsByIds(mechanismIdsOf(row), mechOpts, limit)
    return {
      ok: true,
      node: cardNode(row, hit, role),
      related,
      note: '只拉一层：卡 → 所属事件段（公共时间线）/ 卡上 mechanismIds 指的机制。卡已按 canRead 过滤；不写盘、不调模型。',
    }
  }

  // kind === 'mechanism'
  let rec = null
  try { rec = findMechanism(id, mechOpts) } catch { rec = null }
  if (!rec) return miss(`找不到这个机制：${id}`)
  // 机制公共、事件段公共：这两个不看 role；卡仍按 canRead 过滤。
  let eps = []
  try { eps = findEpisodesAny(rec.name, { limit }) } catch { eps = [] }
  related.episodes = eps.map((ep) => episodeBrief(ep, ep.role))
  related.cards = role ? cardsForMechanism(role, rec.mechanismId, limit).map(cardBrief) : []
  return {
    ok: true,
    node: mechanismNode(rec),
    related,
    note: role
      ? '只拉一层：机制（公共）→ 按名字查到的相关事件段（公共）/ 卡上 mechanismIds 命中它的卡（按 canRead 过滤）。不写盘、不调模型。'
      : '只拉一层：机制（公共）→ 按名字查到的相关事件段（公共）。没给 role，卡一律不返回；不写盘、不调模型。',
  }
}

/** 从任意点往外拉多层；每层仍走 expandPoint，隐私/坏行规则不变。 */
export function expandGraph(point = {}) {
  const depth = Math.max(1, Math.min(3, Math.floor(num(point?.depth, 2))))
  const role = str(point?.role)
  const limit = Math.max(1, Math.floor(num(point?.limit, DEFAULT_LIMIT)))
  const start = expandPoint(point)
  if (!start.ok) return { ...start, graph: null }
  if (depth <= 1) return { ...start, graph: null }

  const nodes = new Map()
  const edges = []
  const addNode = (n) => {
    const k = `${str(n?.kind)}:${str(n?.id)}`
    if (!n || !str(n.id) || nodes.has(k)) return
    nodes.set(k, n)
  }
  const addEdge = (fromKind, fromId, toKind, toId, via) => {
    if (!fromId || !toId) return
    const key = `${fromKind}:${fromId}->${toKind}:${toId}`
    if (edges.some((e) => e.key === key)) return
    edges.push({ key, from: { kind: fromKind, id: fromId }, to: { kind: toKind, id: toId }, via: str(via) })
  }
  const flatten = (rel) => [
    ...(rel?.episodes || []).map((x) => ({ ...x, kind: 'episode' })),
    ...(rel?.cards || []).map((x) => ({ ...x, kind: 'card' })),
    ...(rel?.mechanisms || []).map((x) => ({ ...x, kind: 'mechanism' })),
  ]
  const labelOf = (n) => str(n?.label || n?.head || n?.name || n?.id)
  const card = (n) => ({ kind: n.kind, id: n.id, role: str(n.role), label: labelOf(n) })

  addNode(start.node)
  let frontier = flatten(start.related)
  for (const n of frontier) addNode(card(n))
  for (const n of frontier) addEdge(start.node.kind, start.node.id, n.kind, n.id, 'related')

  let level = 1
  while (level < depth && frontier.length && nodes.size < 60) {
    const next = []
    for (const f of frontier) {
      if (nodes.size >= 60) break
      const r = expandPoint({ kind: f.kind, id: f.id, role, limit, ...(point.mechanismFile ? { mechanismFile: point.mechanismFile } : {}) })
      if (!r.ok) continue
      for (const n of flatten(r.related)) {
        addNode(card(n))
        addEdge(f.kind, f.id, n.kind, n.id, 'related')
        next.push(n)
      }
    }
    frontier = next
    level += 1
  }
  return {
    ok: true,
    node: start.node,
    related: start.related,
    graph: {
      depth,
      nodes: [...nodes.values()],
      edges,
      truncated: nodes.size >= 60,
      note: '多层只拉有 id/出处的边；每张卡仍按 canRead 过滤，事件段/机制公共；不写盘、不调模型。',
    },
  }
}
