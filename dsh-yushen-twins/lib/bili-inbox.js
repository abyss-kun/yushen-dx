// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// B站收件里「谁 @ 了我」这一段：读当天文件 / 挑主人自己那条 / 落成 runtime 文件。
// 2026-11-01 主人：在 B站 @我，我这头得看得见。
//
// 边界：只读 dayu/inbox 下当天那份 jsonl（python 拉好的），只写 dayu/runtime 自己这一份；
// 不回复、不发任何东西、不碰 python 的登录态、不在这里调任何 B站 接口。
import fs from 'node:fs'
import path from 'node:path'

/**
 * B站 那边的日期口径。python 用 `datetime.now(timezone(timedelta(hours=8)))` 命名文件，
 * 这里必须按同一个时区算：用 toISOString() 直接切在凌晨 0–8 点会差一天，读不到当天的文件。
 */
export function atDate(ms = Date.now()) {
  return new Date(ms + 8 * 3600e3).toISOString().slice(0, 10)
}

/** 当天的 @我 收件箱：<home>/dayu/inbox/bili-at-<日期>.jsonl */
export function atFileOf(home, date = atDate()) {
  return path.join(home, 'dayu', 'inbox', `bili-at-${date}.jsonl`)
}

/** 给简报/面板读的那份：<home>/dayu/runtime/bili-owner-mentions.json */
export function ownerMentionsFileOf(home) {
  return path.join(home, 'dayu', 'runtime', 'bili-owner-mentions.json')
}

/**
 * 读 jsonl。读不到就空数组；坏行跳过。
 * 一行坏掉不该让「当天所有 @」都读不出来——这不是宽容，是别让局部脏数据变成整段失明。
 */
export function readRows(file) {
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { return [] }
  const out = []
  for (const line of text.split('\n')) {
    const s = line.trim()
    if (!s) continue
    try { out.push(JSON.parse(s)) } catch { /* 坏行跳过 */ }
  }
  return out
}

/** 主人本人吗？python 的 at 分支标 from_owner（owner.json 的 biliUid，没有就用登录账号）。 */
export function isOwnerMention(row) {
  return !!row && row.from_owner === true
}

/**
 * 本次新增里主人自己 @ 的：fromIndex 是「这次跑之前已经有几行」。
 * tick 里就是这么用的——先数行数，再拉，再从这个水位往后看，老的不会每小时重报一次。
 */
export function pickFreshOwnerMentions(rows, fromIndex = 0) {
  const list = Array.isArray(rows) ? rows : []
  const start = Math.max(0, Number(fromIndex) || 0)
  return list.slice(start).filter(isOwnerMention)
}

/** 日志那一行：`B站：主人 @ 了你 N 条（前 40 字）`。没 @ 就返回空串，不占日志。 */
export function ownerMentionLine(items, max = 40) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return ''
  const head = String(list[0].text || list[0].title || '').replace(/\s+/g, ' ').trim()
  const cut = head.length > max ? `${head.slice(0, max)}…` : head
  return `B站：主人 @ 了你 ${list.length} 条（${cut}）`
}

// 只留该留的字段：text/at/title 是要求的，其余几个是为了点得开、认得出是谁。
const slim = (row) => ({
  key: String(row.key || `${row.at}|${row.text}`),
  at: String(row.at || ''),
  text: String(row.text || ''),
  title: String(row.title || ''),
  from_name: String(row.from_name || ''),
  from_uid: row.from_uid ?? null,
  uri: String(row.uri || ''),
  from_owner: true,
})

/** 新的叠在旧的上面，按 key 去重，只留最近 keep 条（新的在前）。 */
export function mergeOwnerMentions(fresh, prev = [], keep = 20) {
  const out = []
  const seen = new Set()
  for (const row of [...(Array.isArray(fresh) ? fresh : []), ...(Array.isArray(prev) ? prev : [])]) {
    if (!row) continue
    const item = slim(row)
    if (seen.has(item.key)) continue
    seen.add(item.key)
    out.push(item)
    if (out.length >= keep) break
  }
  return out
}

/** 读回那份 runtime 文件（没有就是 items: []）。 */
export function readOwnerMentions(home) {
  try {
    const d = JSON.parse(fs.readFileSync(ownerMentionsFileOf(home), 'utf8'))
    return { ok: true, ...d, items: Array.isArray(d.items) ? d.items : [] }
  } catch {
    return { ok: false, items: [] }
  }
}

/**
 * 写 <home>/dayu/runtime/bili-owner-mentions.json：最近 keep 条主人 @（新的在前）。
 * 写之前先读旧的合起来——每小时跑一次，一次只来一两条，覆盖写会把「最近 20 条」变成「最近这一小时」。
 */
export function writeOwnerMentions(home, fresh, { keep = 20, now = Date.now() } = {}) {
  const file = ownerMentionsFileOf(home)
  const prev = readOwnerMentions(home).items
  const before = new Set(prev.map((r) => String(r.key)))
  const items = mergeOwnerMentions(fresh, prev, keep)
  const added = items.filter((r) => !before.has(String(r.key))).length
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const payload = {
    updatedAt: new Date(now).toISOString(),
    date: atDate(now),
    count: items.length,
    added,
    items,
  }
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return { ok: true, file, added, total: items.length }
}
