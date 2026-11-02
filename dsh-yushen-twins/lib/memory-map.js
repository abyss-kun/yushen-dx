// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 记忆地图：只给标题，要看全文再点开；点开一次记一次数（2026-10-31 老板让做的）。
//
// 为什么（照 南竹0v0 的那个思路，砍掉"销毁"那一半）：
//   简报里写着「更早的 45 条习惯、200 件做过的事…想翻就用 yushen_self 翻」——
//   可她根本不知道该翻什么。给一份**标题索引**，翻的成本才降得下来。
//   被翻过一次就记一次数：谁常被想起、谁一直没人问，这个数据我们现在完全没有。
//
// 不做的事：
//   · 不物理删除任何记忆（跟"写下来才算记住"打架）；沉底可以，删不行。
//   · 不用次数决定重要性——被反复点的不等于重要。承诺/底线不进衰减，单独拎着。
import fs from 'node:fs'
import path from 'node:path'
import { dshHome } from './paths.js'
import { readMemory } from './soul.js'
import { listMindItems } from './mind-store.js'

const MAX_TITLE = 34
// 超过这些天没被翻过、又从没被翻过 = 沉底（只影响显示，不动文件）
const SINK_DAYS = 14

function countsFile(role) {
  return path.join(dshHome(), 'dayu', 'runtime', role, '召回计数.json')
}

function readCounts(role) {
  try { return JSON.parse(fs.readFileSync(countsFile(role), 'utf8').replace(/^\uFEFF/, '')) || {} } catch { return {} }
}

function bumpCount(role, id) {
  const doc = readCounts(role)
  doc[id] = { n: Number(doc?.[id]?.n || 0) + 1, at: new Date().toISOString() }
  try {
    const p = countsFile(role)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    const tmp = `${p}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 1), 'utf8')
    fs.renameSync(tmp, p)
  } catch { /* 记不上不影响看 */ }
  return doc[id].n
}

/** 多少天了（读不出时间就当 0，不硬算）。 */
function ageOf(at) {
  const t = Date.parse(String(at || ''))
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((Date.now() - t) / 86400000))
}

const title = (s, n = MAX_TITLE) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)

/** 经历（events）+ 心念（mind）的标题索引。按"翻过几次"再按"时间"排。 */
export function memoryMap(role, { limit = 40, kind = '', deep = false } = {}) {
  const m = readMemory(role)
  const counts = readCounts(role)
  const items = []
  const events = Array.isArray(m.events) ? m.events : []
  events.forEach((e, i) => {
    const id = `event:${i}`
    items.push({
      id,
      kind: '经历',
      ageDays: ageOf(e?.at),
      title: title(e?.text || e),
      at: String(e?.at || ''),
      channel: String(e?.channel || ''),
      hits: Number(counts?.[id]?.n || 0),
      lastHit: String(counts?.[id]?.at || ''),
    })
  })
  let mind = []
  try { mind = listMindItems(role, { limit: 48 }) || [] } catch { mind = [] }
  for (const x of mind) {
    const id = `mind:${x.id}`
    items.push({
      id,
      kind: String(x.kind || '心念'),
      ageDays: ageOf(x.at || x.createdAt),
      title: title(x.text),
      at: String(x.at || x.createdAt || ''),
      channel: String(x.scope?.channel || ''),
      hits: Number(counts?.[id]?.n || 0),
      lastHit: String(counts?.[id]?.at || ''),
    })
  }
  for (const x of items) x.sunken = Number(x.hits || 0) === 0 && Number(x.ageDays || 0) > SINK_DAYS
  const forKind = kind ? items.filter((x) => x.kind === kind) : items
  const sunkenCount = forKind.filter((x) => x.sunken).length
  // 热档只有 200 条；被挤出去的都在冷档里（只增不删），这里报个数和位置。
  let coldCount = 0
  let coldDir = ''
  try {
    coldDir = path.join(dshHome(), 'dayu', 'runtime', role, '记忆冷档')
    if (fs.existsSync(coldDir)) {
      for (const f of fs.readdirSync(coldDir)) {
        if (!f.endsWith('.jsonl')) continue
        coldCount += fs.readFileSync(path.join(coldDir, f), 'utf8').split(/\r?\n/).filter(Boolean).length
      }
    }
  } catch { /* 没有冷档就是 0 */ }
  const filtered = deep ? forKind : forKind.filter((x) => !x.sunken)
  // 心念（承诺/疑问/兴趣）排在经历前面：经历有 200 条，按时间排会把心念整个挤没。
  const rank = (x) => (x.id.startsWith('mind:') ? 0 : 1)
  filtered.sort((a, b) => (rank(a) - rank(b)) || (b.hits - a.hits) || String(b.at).localeCompare(String(a.at)))
  const picked = filtered.slice(0, limit)
  return {
    ok: true,
    role,
    total: items.length,
    shown: picked.length,
    没被翻过: forKind.filter((x) => x.hits === 0).length,
    沉底: sunkenCount,
    冷档: coldCount,
    冷档在哪: coldDir,
    items: picked,
    note: '这是标题；要看全文用 yushen_self action=open id=<这个 id>（翻开一次会记一次数）。心念在前，经历只列最近的。',
  }
}

/** 点开一条：返回全文，并把"被想起的次数"加一。 */
export function openMemory(role, id) {
  const key = String(id || '').trim()
  if (!key) return { ok: false, error: 'id 不能为空（先 action=map 看标题）' }
  const m = readMemory(role)
  if (key.startsWith('event:')) {
    const i = Number(key.slice(6))
    const e = (m.events || [])[i]
    if (!e) return { ok: false, error: `没有这一条：${key}` }
    return { ok: true, id: key, kind: '经历', at: e.at || '', channel: e.channel || '', text: String(e.text || e), hits: bumpCount(role, key) }
  }
  if (key.startsWith('mind:')) {
    const mid = key.slice(5)
    let x = null
    try { x = (listMindItems(role, { limit: 48 }) || []).find((it) => it.id === mid) } catch { x = null }
    if (!x) return { ok: false, error: `没有这一条：${key}` }
    return {
      ok: true,
      id: key,
      kind: String(x.kind || '心念'),
      at: x.at || x.createdAt || '',
      text: String(x.text || ''),
      detail: String(x.detail || ''),
      scope: x.scope || {},
      hits: bumpCount(role, key),
    }
  }
  return { ok: false, error: 'id 得是 event:数字 或 mind:xxx（先 action=map）' }
}
