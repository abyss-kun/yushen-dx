/* 标签
 * id: recall-auto
 * kind: module
 * tags: 检索, 自主, 不问也搜, 心念, 承诺
 * created: 2026-11-04 13:40:00
 * changed: 2026-11-04 16:22:28
 * author: 照微·工作台
 * authority: 老板（2026-11-04：都做——别人不问，自己会搜）
 * why: 检索只在"被问"时发生；没人问就永远不翻，旧事和新事连不上
 * result: 每天用「未完成的心念 + 逾期承诺」当搜索词各搜一次，只报新命中的，没命中不报
 * mutable: 可改
 */
// 用法：
//   node scripts/recall-auto.mjs            # 跑一遍，打印新命中（人看）
//   node scripts/recall-auto.mjs --json     # 机器读
//   node scripts/recall-auto.mjs --days 3   # 只看新命中里 3 天内改过的文件
//
// 去重：命中的 (query + 出处) 记进 runtime/recall-auto-seen.json，见过的就不再报。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

// 2026-11-04 老板：本地进程不能占着不放（宿主崩了也得能修）。硬超时自己退。
import { hardTimeout } from '../lib/offline-guard.js'
hardTimeout(5, 'recall-auto.mjs')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const SEEN = path.join(HOME, 'dayu', 'runtime', 'recall-auto-seen.json')
const args = process.argv.slice(2)
const json = args.includes('--json')
const roleIdx = args.indexOf('--role')
const role = roleIdx >= 0 ? String(args[roleIdx + 1] || 'dragon') : 'dragon'
const daysIdx = args.indexOf('--days')
const days = daysIdx >= 0 ? Math.max(1, Number(args[daysIdx + 1]) || 7) : 7

const { listMindItems } = await import(pathToFileURL(path.join(ROOT, 'lib', 'mind-store.js')).href)
const { duePromises } = await import(pathToFileURL(path.join(ROOT, 'lib', 'promises-rel.js')).href)
const { activeItems } = await import(pathToFileURL(path.join(ROOT, 'lib', 'agenda.js')).href)
const { findAnything } = await import(pathToFileURL(path.join(ROOT, 'lib', 'find.js')).href)
const { logRecall } = await import(pathToFileURL(path.join(ROOT, 'lib', 'recall-log.js')).href)

function seeds() {
  const out = []
  try {
    for (const item of listMindItems(role, { statuses: ['active'], limit: 8 })) {
      const text = String(item.text || item.what || '').trim()
      if (text.length >= 4) out.push({ kind: '心念', query: text.slice(0, 30) })
    }
  } catch { /* 读不到就没有 */ }
  try {
    // duePromises 返回的是 { ok, overdue:[], soon:[], undated:[], … }——不是数组，别直接 for-of。
    const due = duePromises(Date.now(), {}) || {}
    const all = [...(due.overdue || []), ...(due.soon || []), ...(due.undated || [])]
    for (const p of all) {
      const text = String(p.what || p.text || '').trim()
      if (text.length >= 4) out.push({ kind: '承诺', query: text.slice(0, 30) })
    }
  } catch { /* 同上 */ }
  // 议程：她手上"想做/在做/在等"的事，是最自然的搜索词——搜到旧材料，正好接上。
  try {
    for (const item of activeItems(role)) {
      const text = String(item.what || '').trim()
      if (text.length >= 4) out.push({ kind: '议程', query: text.slice(0, 30) })
    }
  } catch { /* 同上 */ }
  return out.slice(0, 10)
}

function loadSeen() {
  try { return new Set(JSON.parse(fs.readFileSync(SEEN, 'utf8')).keys || []) } catch { return new Set() }
}
function saveSeen(set) {
  try {
    fs.mkdirSync(path.dirname(SEEN), { recursive: true })
    fs.writeFileSync(SEEN, JSON.stringify({ at: new Date().toISOString(), keys: [...set].slice(-2000) }, null, 2), 'utf8')
  } catch { /* 存不下不影响本次 */ }
}

const cutoff = Date.now() - days * 86400 * 1000
const seen = loadSeen()
const fresh = []
for (const seed of seeds()) {
  let res = { items: [] }
  try { res = findAnything(seed.query, { limit: 6 }) } catch { continue }
  const items = (res.items || []).filter((it) => {
    // 别拿"刚发生的事"和"自己的记录"当新材料：事件流水、runtime、还有本脚本自己的 seen/log。
    const p = String(it.path || '')
    if (/\/dayu\/(events|runtime)\//.test(p)) return false
    if (/sleep\.jsonl$|recall-auto-seen\.json$|recall-log\.jsonl$/.test(p)) return false
    const t = Date.parse(it.at || '')
    return !Number.isFinite(t) || t >= cutoff
  })
  if (items.length) logRecall({ who: role, why: `自主搜索：${seed.kind}`, query: seed.query, hits: items.length, refs: items.slice(0, 3).map((i) => `${i.path || i.title}`), source: 'recall-auto' })
  for (const it of items.slice(0, 3)) {
    const key = `${seed.query}|${it.path || it.title}`
    if (seen.has(key)) continue
    seen.add(key)
    fresh.push({ seed: seed.kind, query: seed.query, path: it.path || '', title: it.title || '', snippet: String(it.snippet || '').slice(0, 120) })
  }
}
saveSeen(seen)

if (json) {
  console.log(JSON.stringify({ role, seeds: seeds().length, fresh: fresh.length, items: fresh }, null, 2))
} else if (!fresh.length) {
  console.log(`没有新东西（${seeds().length} 个种子都见过了，或者搜不到新的）。没发现就不报。`)
} else {
  console.log(`自己翻到 ${fresh.length} 条新东西：`)
  for (const f of fresh) console.log(`  · [${f.seed}] ${f.query} → ${f.title || f.path}\n    ${f.snippet}`)
}
