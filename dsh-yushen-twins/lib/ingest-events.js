/* 标签
 * id: lib-ingest-events
 * kind: module
 * summary: 事件层：心跳/体检/群消息按天聚合成一行 + 计数；不按条写（否则一天灌满手抄本）。
 * audience: 她（醒来那段读它）、提炼脚本
 * owner: 框架；只许三种 kind，加之前先问老板
 * mutable: 可改（聚合口径别动）
 * defaults: 同一天+同 kind+同通道只留最新一条，count 累加
 * usage: ingestEvent({kind,text,ref}) 写一条；ingestEvents 批量；EVENT_KINDS 是白名单
 * off: 上游不调 ingestEvent 就不写；已写的聚合行不删
 */

// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-02 22:45｜大鱼·子会话（工作台）｜授权：主人（本次任务书：系统事件要进事件层，范围只三种）｜lib/ingest-events.js:1-140｜新增：ingestEvent / ingestEvents（心跳·体检·群消息 → 手抄本/事件 + 待提炼指针；按「天+类别+通道」聚合成一行，只留最新一条并累加 count）｜为什么：心跳 30 分钟一次、群消息一次几十条，按条写会把手抄本当天灌满；可她要知道的只是「今天心跳几次、最后一条体检什么样、群里来过几条」｜验证：node --check lib/ingest-events.js；node scripts/test-ingest-events.mjs（心跳 3 次=1 行 count=3、体检一条、群消息 5 条=1 行 count=5）；node scripts/regression.mjs 不新增红｜可改：可改（聚合口径别动：同一天同一 kind 同一通道只留最新一条；要加事件种类先问老板）
//
// 事件层：系统这边发生过什么——不是她说的话，也不是她干的活。
//
// 范围（任务书限定三种，别扩）：
//   心跳  自省那一跳（runSelfCheckOnce）
//   体检  selfCheck() 产出报告的那一刻
//   群消息 QQ 入站（lib/inbox.js 镜像写盘处）
//
// 聚合规则：同一天 + 同一 kind + 同一通道，只留最新一条，count 累加。
// 为什么不是按条写：心跳 30 分钟一次（一天 48 条）、群消息一次几十条，
// 手抄本是「完整未提炼」不是「流水账」；原文在 live / inbox 里一条不少，这里只留索引。
import { clip, ensurePointer, layerFileOf, stamp, upsertRow } from './ingest-store.js'
import { keywords } from './library-chain.js'

export const LAYER = '事件'
export const EVENT_KINDS = Object.freeze(['心跳', '体检', '群消息'])

const idOf = (kind, channel, day) => `e-${kind}-${channel}-${day}`

/**
 * 记一条系统事件。
 * n = 这一条代表多少个原始事件（群消息批量镜像时一次补 N 条）。
 * 返回 { ok, id, file, count, row }；写不进去返回 { ok:false }，不抛。
 */
export function ingestEvent({ kind, at, channel = '本机', text = '', ref = '', n = 1, firstAt = '' } = {}) {
  try {
    const k = String(kind || '').trim()
    if (!EVENT_KINDS.includes(k)) return { ok: false, reason: `只收这三种：${EVENT_KINDS.join(' / ')}` }
    const ch = clip(channel, 20) || '本机'
    const { at: iso, day } = stamp(at)
    const body = clip(text, 120)
    // 「只写摘要一行」：正文压到 120 字，标题 60 字。
    const file = layerFileOf(LAYER, day)
    // 2026-11-02 23:35 主人改口径：手抄本不再存原文全文（全文只在 live / inbox），
    // 这里只留 head(≤60) + 关键词 + 标签 + ref；body 只用来算 head/keywords，不落盘。
    const row = {
      id: idOf(k, ch, day),
      kind: k,
      layer: LAYER,
      event: true,
      type: 'event',
      at: iso,
      // 一天聚合一行时，「最早那条」和「最新那条」不是同一刻：firstAt 单独给。
      firstAt: firstAt ? stamp(firstAt).at : iso,
      day,
      channel: ch,
      who: k === '群消息' ? '别人' : '系统',
      head: clip(body, 60),
      keywords: keywords(body),
      tags: [k, ch],
      ref: clip(ref, 160),
      sourceLevel: k === '群消息' ? '别人说的' : '系统记的',
      confidence: '确定',
      importance: k === '群消息' ? '普通' : '低',
      coarse: true,
      state: 'queued',
    }
    const merged = upsertRow(file, row, n)
    if (!merged) return { ok: false, reason: '写不进去' }
    ensurePointer(LAYER, day, merged)
    return { ok: true, id: merged.id, file, count: merged.count, day, row: merged }
  } catch (e) {
    return { ok: false, reason: clip(e?.message || e, 120) }
  }
}

/**
 * 批量：一次镜像可能进来几十条群消息。
 * 先按 (kind|channel|day) 归组，每组只 upsert 一次——不然 30 条就是 30 次整文件重写。
 * 每组的 text 取组内最后一条，count 一次加上本批条数。
 */
export function ingestEvents(list = []) {
  const items = (Array.isArray(list) ? list : []).filter(Boolean)
  if (!items.length) return { ok: true, groups: 0, added: 0, rows: [] }
  const groups = new Map()
  for (const it of items) {
    const k = String(it?.kind || '').trim()
    if (!EVENT_KINDS.includes(k)) continue
    const ch = clip(it?.channel, 20) || '本机'
    const { at: iso, day } = stamp(it?.at)
    const key = `${k}|${ch}|${day}`
    const g = groups.get(key) || { kind: k, channel: ch, day, last: null, first: null, n: 0 }
    // 一批里 earliest 也要留：一天一行的 firstAt 不能写成「最后一条的时间」。
    if (!g.first || String(iso) < String(g.first)) g.first = iso
    g.last = { ...it, at: iso }
    g.n += 1
    groups.set(key, g)
  }
  const rows = []
  let added = 0
  for (const g of groups.values()) {
    const r = ingestEvent({
      kind: g.kind,
      at: g.last.at,
      channel: g.channel,
      text: g.last.text,
      ref: g.last.ref,
      n: g.n,
      firstAt: g.first,
    })
    if (!r.ok) continue
    added += 1
    rows.push(r.row)
  }
  return { ok: true, groups: groups.size, added, rows }
}
