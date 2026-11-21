/* 标签
 * id: lib-hot
 * kind: module
 * summary: 分层热档投影（2026-11-03）
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；记忆内容归角色本人
 * mutable: 可改
 * usage: readInUse / baseTier / projectHot / hotText（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
// 分层热档投影（2026-11-03）
// 老板定的三档：底档（不淘汰）/ 钉子（承诺·决定·教训，不淘汰）/ 余温（按半衰期掉）。
// 它不是存储，是**从「在用」算出来的视图**：算错、算旧了重启一下就重算，不怕坏。
// 底档来自角色卡（身份/原则），不来自「在用」——卡是卡，结论是结论。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const LIB = path.join(HOME, 'dayu', 'library')
const CARDS = path.join(HOME, 'dayu', 'soul', 'cards')

// 半衰期：普通结论 7 天掉一半；钉子不掉
const HALF_LIFE_DAYS = 7
const EMBER_MIN_SCORE = 0.15

const NAIL_RE = /承诺|答应|决定|定了|教训|不许|必须|规则|底线|以后都|下次一定/i

function readJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}
function walk(dir, fn) {
  if (!fs.existsSync(dir)) return
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, fn)
    else if (p.endsWith('.jsonl')) fn(p)
  }
}

/** 读「在用」的全部结论。 */
export function readInUse() {
  const out = []
  walk(path.join(LIB, '在用'), (p) => out.push(...readJsonl(p)))
  return out
}

/** 底档：卡里最稳的那几句（身份/原则），从卡正文抽「- **xxx**：」开头的行。 */
export function baseTier(role = 'dayu', limit = 8) {
  const file = path.join(CARDS, `${role}.md`)
  let t = ''
  try { t = fs.readFileSync(file, 'utf8') } catch { return [] }
  const picked = []
  for (const line of t.split('\n')) {
    const m = /^-\s*\*\*(.+?)\*\*/.exec(line.trim())
    if (!m) continue
    const head = m[1].trim()
    if (head.length < 2 || head.length > 18) continue
    if (!/身份|名字|不是|不许|只有|原则|规矩|称呼|说不|边界|职责/.test(line)) continue
    if (picked.some((p) => p.head === head)) continue
    picked.push({ head, from: `${path.basename(file)}` })
    if (picked.length >= limit) break
  }
  return picked
}

/** 投影：底档 + 钉子 + 余温。 */
let _cache = { key: '', at: 0, value: null }
function cacheKey() {
  let key = ''
  try {
    walk(path.join(LIB, '在用'), (p) => { const s = fs.statSync(p); key += p + s.mtimeMs + s.size + '|' })
  } catch { /* 读不到就用空 key，不强缓存 */ }
  return key
}

export function projectHot({ role = 'dayu', now = Date.now(), inUse = null, emberLimit = 12 } = {}) {
  const rows = inUse || (() => {
    const key = cacheKey()
    if (_cache.value && _cache.key === key && Date.now() - _cache.at < 60000) return _cache.value
    const v = readInUse()
    _cache = { key, at: Date.now(), value: v }
    return v
  })()
  const nails = []
  const embers = []
  for (const r of rows) {
    // 2026-11-03 老板：「标了不用等于没标」——role 存着就要在投影时用：只取本角色 + 老数据(unknown)
  if (role && r.role && r.role !== role && r.role !== 'unknown') continue
  // 2026-11-03：被卷进「分歧」的卡不进热档——它在分歧块里原话出现，别再重复一次
  if (r.divergence) continue
  const text = `${r.head || ''} ${r.detail || ''} ${(r.tags || []).join(' ')}`
    const at = Date.parse(String(r.at || '')) || now
    const ageDays = Math.max(0, (now - at) / 86400e3)
    const decay = Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
    // 2026-11-03 老板：「有点水，是那种不值得记忆但是可以记的」——水的不删，但不进她每轮的脑子。
    const watery = r.importance === '水'
    const isNail = !watery && (NAIL_RE.test(text) || r.kind === '规则')
    const score = Number((decay * (isNail ? 2 : 1)).toFixed(3))
    const item = { head: String(r.head || '').slice(0, 40), kind: r.kind || '', at: String(r.at || r.createdAt || '').slice(0, 19), score, from: r.fromRef || '' }
    if (isNail) nails.push(item)
    else if (!watery && (r.importance === '高' || score >= EMBER_MIN_SCORE)) embers.push(item)
  }
  // 钉子：按重要性（score）——承诺/决定/教训不随时间让位
  nails.sort((a, b) => b.score - a.score || String(b.at).localeCompare(String(a.at)))
  // 余温：按时间倒序（新的先出来）；score 只用来决定"掉不掉"，不参与排序
  embers.sort((a, b) => String(b.at).localeCompare(String(a.at)) || b.score - a.score)
  return {
    role,
    at: new Date(now).toISOString(),
    base: baseTier(role),
    nails: nails.slice(0, 10),
    embers: embers.slice(0, emberLimit),
    counts: { inUse: rows.length, nails: nails.length, embers: embers.length },
  }
}

/** 投影成一段给注入看的文字（≤200 字，超了先砍余温）。 */
export function hotText(p, budget = 200) {
  const line = (it) => {
    const t = fmtAt(it.at)                          // 2026-11-02 13:38:06（有秒带秒）
    const guess = it.confidence === '推测' ? '（推测）' : ''
    return t ? `· [${t}] ${it.head}${guess}` : `· ${it.head}${guess}`
  }
  const head = '## 我记牢的'
  const build = (nails, embers) => {
    const ls = [head, '钉子（不淘汰）：' + (nails.length ? '' : '（还没有）')]
    for (const n of nails) ls.push('  ' + line(n))
    if (embers.length) {
      ls.push('余温（会掉的）：')
      for (const e of embers) ls.push('  ' + line(e))
    }
    return ls.join('\n')
  }
  let n = p.nails.slice(0, 5)
  let e = p.embers.slice(0, 5)
  let text = build(n, e)
  while (text.length > budget && (e.length > 0 || n.length > 1)) {
    if (e.length) e = e.slice(0, -1)
    else n = n.slice(0, -1)
    text = build(n, e)
  }
  return text
}

/** 时间显示：2026-11-02T13:38:06 → 2026-11-02 13:38:06（有多少位给多少位，不编秒）。 */
export function fmtAt(at) {
  const s = String(at || '').trim()
  if (!s) return ''
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}${m[6] ? ':' + m[6] : ''}`
  const d = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return d ? `${d[1]}-${d[2]}-${d[3]}` : s.slice(0, 19)
}
