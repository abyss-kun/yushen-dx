// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-event-toc
 * kind: module
 * summary: 整件事目录：给事件段 id，只读列出时间/人物/标签、轮次、原文指针、挂在它上面的卡、卡上的机制，外加一个全文入口。
 * tags: 事件段, 目录, 卡, 机制, 只读, 零模型
 * created: 2026-11-17 18:55:00
 * changed: 2026-11-17 18:55:00
 * author: 大鱼·子代理（整件事目录最小模块）
 * authority: 老板（2026-11-17：做「整件事目录 + 全文入口」只读模块；只新增文件，不改已有文件）
 * audience: 她（以后按事件段看「这件事包含什么」）、维护者、脚本
 * owner: 框架；只读事件段/卡/机制三处真源，自己不留数据
 * defaults: limit=20（卡最多几条）；机制默认读 docs/记忆架构-节点图.json
 * off: 不调用就完全不参与任何流程；不影响 capture/refine/注入
 * mutable: 可改；**只读**，不写盘、不调模型、不建新表
 * usage: buildEventToc(role, episodeId, {limit}) → {ok,episode,cards,mechanisms,counts,fullEntry,note}
 * why: 事件段只有一句标签，问「这件事里都有什么、原文在哪」得自己拼卡和机制
 * result: 一份目录 + 一个全文入口；卡按 canRead 过滤；机制只给 id/名字/文件；不返回全文
 */
// 整件事目录 + 全文入口（只读最小模块）：
//
// 输入一个事件段 id，输出**目录**，不输出全文：
//   · episode    时间 / 人物 / 标签 / turnIds / refs（refs 只是指针，不是原文）；
//   · cards      卡上显式写着 episodeId 的卡（本角色 + 别的角色的公开共享卡），按 canRead 过滤；
//   · mechanisms 可见卡上 mechanismIds 指到的机制，**只给 id / 名字 / 文件**，不读正文；
//   · counts     轮次 / 指针 / 人物 / 卡 / 机制各几条；
//   · fullEntry  {kind:'episode', id, ref}：想读全文就用 expandEpisode(role,id) 或 expandEpisodeAny(id)。
//
// 跨角色：事件段是公共时间线，按 id 先看本角色；同 id 有多个版本时取 endAt 最新的一版，
// endAt 一样时**优先本角色**（本角色内同分则后追加的算新版本）。
//
// 隐私口径（和 graph.js / share.js 一致，不另立一套）：
//   · 卡：只有 canRead(role, card) 才返回；role 为空时一张卡都不返回；
//   · 事件段：公共时间线，找到就返回，episode.role 标明是谁的；
//   · 机制：公共，不属于哪个角色；但只从**可见卡**上取，不从看不见的卡上漏出。
//
// 纯读：不联网、不叫模型、不写任何文件、不建新表；坏行/坏文件跳过，不抛。
import fs from 'node:fs'
import path from 'node:path'
import { dataRoot } from '../memory-core/runtime/root.js'
import { readEpisodes, cardsForEpisode } from '../memory-core/runtime/episode.js'
import { canRead } from '../memory-core/runtime/share.js'
import { findMechanism } from './mechanism-registry.js'

export const DEFAULT_LIMIT = 20
const MAX_HEAD = 200

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
const endRank = (ep) => {
  const ms = Date.parse(str(ep?.endAt))
  return Number.isFinite(ms) ? ms : -Infinity
}

/** library/meta 下现有事件段文件的角色名（只用来枚举公共时间线，不按它做权限）。 */
function metaRoles() {
  let files = []
  try { files = fs.readdirSync(path.join(dataRoot(), 'library', 'meta')) } catch { return [] }
  return uniq(files.filter((f) => /^episodes-.+\.jsonl$/.test(f)).map((f) => f.replace(/^episodes-/, '').replace(/\.jsonl$/, '')))
}

/** 同角色内按 id 找事件段：同分取后追加的（追加写 = 新版本）。 */
function bestInRole(role, id) {
  let best = null
  for (const ep of readEpisodes(role)) {
    if (str(ep.id) !== id) continue
    const rank = endRank(ep)
    if (!best || rank >= best.rank) best = { episode: ep, rank }
  }
  return best
}

/**
 * 按 id 找事件段（公共时间线）：先本角色，再看别的角色。
 * endAt 最新的一版胜出；endAt 一样时先遇到的（本角色在前）胜出。
 */
function findEpisode(id, preferRole) {
  const want = str(id)
  if (!want) return null
  let best = null
  for (const role of uniq([str(preferRole), ...metaRoles()])) {
    const hit = bestInRole(role, want)
    if (!hit) continue
    if (!best || hit.rank > best.rank) best = { episode: hit.episode, role, rank: hit.rank }
  }
  return best ? { episode: best.episode, role: best.role } : null
}

/** 事件段 → 目录条目：只给时间和指针，不给原文。 */
function episodeEntry(ep, role) {
  const turnIds = strList(ep.turnIds)
  const turns = Number.isFinite(Number(ep.turns)) && Number(ep.turns) > 0 ? Number(ep.turns) : turnIds.length
  return {
    id: str(ep.id),
    role: str(role),
    startAt: str(ep.startAt),
    endAt: str(ep.endAt),
    label: str(ep.label),
    people: strList(ep.people),
    turnIds,
    refs: strList(ep.refs),
    channel: str(ep.channel),
    sessionId: str(ep.sessionId),
    turns,
    topic: str(ep.topic),
    keywords: strList(ep.keywords),
    domain: str(ep.domain),
    domainKind: str(ep.domainKind),
    confidence: str(ep.confidence),
  }
}

/** 卡 → 目录条目：只给一句标题和指针，**不带** detail/text/summary，也不重扫文件找行号。 */
function cardEntry(row) {
  return {
    id: str(row.id || row.ref || ''),
    role: str(row.authorRole || row.role),
    cardKind: str(row.kind),
    head: str(row.head || row.title).slice(0, MAX_HEAD),
    at: whenOf(row),
    episodeId: str(row.episodeId),
    mechanismIds: mechanismIdsOf(row),
    visibility: str(row.visibility),
  }
}

/**
 * 事件段 → 可见卡：先按本角色查，再按其它角色查（公开/共享的卡也要能列出来），
 * 最后统一用 canRead 卡一遍；role 空 → 一张都不返回。
 */
function visibleCards(role, episodeId, limit) {
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

/** 机制 id → {id,name,files}；查不到的不编，跳过。 */
function mechanismEntries(ids, mechFile, limit) {
  const out = []
  for (const id of ids) {
    let rec = null
    try { rec = findMechanism(id, mechFile ? { file: mechFile } : {}) } catch { rec = null }
    if (!rec) continue
    if (out.some((m) => m.id === str(rec.mechanismId))) continue
    out.push({ id: str(rec.mechanismId), name: str(rec.name), files: strList(rec.files) })
    if (out.length >= limit) break
  }
  return out
}

function emptyToc(role) {
  return {
    ok: false,
    role: str(role),
    episode: null,
    cards: [],
    mechanisms: [],
    counts: { people: 0, turns: 0, refs: 0, cards: 0, mechanisms: 0 },
    fullEntry: null,
    note: '',
  }
}

/**
 * 整件事目录 + 全文入口。
 *
 * @param {string} role 当前角色（隐私过滤用）。不给时事件段照读（公共），卡一律不返回。
 * @param {string} episodeId 事件段 id。
 * @param {{limit?: number, mechanismFile?: string}} [opts]
 *   - limit：卡最多几条，默认 20（机制也按这个上限收）。
 *   - mechanismFile：机制真源（默认 docs/记忆架构-节点图.json；测试/夹具可换）。
 * @returns {{ok: boolean, role: string, episode: object|null, cards: object[], mechanisms: object[],
 *   counts: {people: number, turns: number, refs: number, cards: number, mechanisms: number},
 *   fullEntry: {kind: 'episode', id: string, ref: string}|null, note: string}}
 *   找不到事件段 → ok:false，其余为空/0，note 说明原因；不抛。
 *   不写盘、不调模型、不建新表；坏行/坏文件跳过。
 */
export function buildEventToc(role, episodeId, opts = {}) {
  const who = str(role)
  const want = str(episodeId)
  const limit = Math.max(1, Math.floor(num(opts?.limit, DEFAULT_LIMIT)))
  const mechFile = str(opts?.mechanismFile)
  const toc = emptyToc(who)

  if (!want) return { ...toc, note: 'episodeId 不能为空（没有 id 就不知道是哪件事）' }

  const hit = findEpisode(want, who)
  if (!hit) return { ...toc, note: `找不到这个事件段：${want}` }

  const episode = episodeEntry(hit.episode, hit.role)
  // 卡：隐私在这里一次卡死（canRead）；没给 role 就一张都不返回。
  const cards = visibleCards(who, episode.id, limit).map(cardEntry)
  // 机制只从**可见卡**上取，且只带 id/名字/文件，不读正文。
  const mechIds = uniq(cards.flatMap((c) => c.mechanismIds))
  const mechanisms = mechanismEntries(mechIds, mechFile, limit)
  const fullEntry = { kind: 'episode', id: episode.id, ref: episode.refs[0] || '' }
  const counts = {
    people: episode.people.length,
    turns: episode.turns,
    refs: episode.refs.length,
    cards: cards.length,
    mechanisms: mechanisms.length,
  }

  let note = '整件事目录：事件段（公共时间线）+ 挂在它上面的卡（按 canRead 过滤）+ 卡上的机制（只给 id/名字/文件）。'
  note += ' refs 只是指针；要读原文用 expandEpisode(role, id) 或 expandEpisodeAny(id)（fullEntry）。'
  note += ' 不返回全文、不写盘、不调模型。'
  if (!who) note += ' 没给 role，卡一律不返回。'

  return { ok: true, role: who, episode, cards, mechanisms, counts, fullEntry, note }
}
