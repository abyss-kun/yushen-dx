// 社交分寸：上次因为这个被纠正过，这次同类消息进来，先提醒她一声。
//
// 不是禁止，是"你还记得吗"——接不接、改不改，她自己定。
import fs from 'node:fs'
import path from 'node:path'
import { runtimeDir } from './runtime.js'
import { listCorrections } from './corrections.js'

function hintFile(role) { return path.join(runtimeDir(role), 'manners-hint.json') }

function grams(s) {
  const t = String(s || '').replace(/[^\u4e00-\u9fa5a-z0-9]/gi, '')
  const set = new Set()
  for (let i = 0; i < t.length - 1; i += 1) set.add(t.slice(i, i + 2))
  return set
}

/** 这条消息像不像上次被纠正的那类。 */
export function similarCorrection(role, text, { min = 0.15 } = {}) {
  const rows = listCorrections(role, { limit: 30 })
  if (!rows.length) return null
  const g = grams(text)
  if (!g.size) return null
  let best = null
  for (const r of rows) {
    const target = grams(`${r.what} ${r.was || ''}`)
    if (!target.size) continue
    let hit = 0
    for (const x of g) if (target.has(x)) hit += 1
    const score = hit / Math.min(g.size, target.size)
    if (score >= min && (!best || score > best.score)) best = { score: Math.round(score * 100) / 100, correction: r }
  }
  return best
}

/** 收件箱 tick 用：有新消息像"被纠正过的那类"，记一条提醒。 */
export function noteManners(role, rows = [], { now = Date.now() } = {}) {
  let n = 0
  for (const row of rows) {
    if (!row || row.isSelf) continue
    const hit = similarCorrection(role, row.text)
    if (!hit) continue
    const hint = { at: new Date(now).toISOString(), atMs: now, text: String(row.text || '').slice(0, 120), what: hit.correction.what, should: hit.correction.should || '', score: hit.score }
    try {
      fs.mkdirSync(path.dirname(hintFile(role)), { recursive: true })
      fs.writeFileSync(hintFile(role), `${JSON.stringify(hint, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      n += 1
    } catch { /* 写不进就算了 */ }
  }
  return n
}

/** 注入：最近一条提醒（30 分钟内有效）。 */
export function mannersLine(role, { now = Date.now(), ttlMs = 30 * 60 * 1000 } = {}) {
  let h = null
  try { h = JSON.parse(fs.readFileSync(hintFile(role), 'utf8')) } catch { return '' }
  if (!h || now - Number(h.atMs || 0) > ttlMs) return ''
  return `## 提醒你一下\n刚才那条「${h.text}」像你上次被纠正过的那类：${h.what}${h.should ? `（他当时说：${h.should}）` : ''}。这回怎么回，你自己定。`
}
