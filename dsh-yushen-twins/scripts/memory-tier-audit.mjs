// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-01 02:25｜子会话（记忆分级）｜授权：主人派活｜scripts/memory-tier-audit.mjs｜核心记忆定规矩并瘦身：core 只放身份/承诺/关系/事故，上限 30；新增 memory-tier-audit.mjs（体检/降档/备份/往返校验）并真跑 --apply｜为什么：125 条 core 每轮只带 1 条，反而不聚焦；判据和上限要落成机器能查的东西｜可改：是（判据放 docs/记忆分级.md，改前跑回归）
// 记忆分级体检：core 只放「不知道就会做错事」的，超了上限就降档（只改 tier，不改正文）。
//
// 判据（2026-11-01 主人定，细则见 docs/记忆分级.md，两边数必须一致——回归会查）：
//   core       · 上限 30 条（三人合计）
//              只放：身份/称呼、底线/承诺、关系（谁是姐妹、谁是主人）、事故教训一句。
//              判据是「不知道就会做错事」；每轮注入只带 1 条（lib/soul.js recentEvents），
//              条目再多也不会更聚焦，只会让「什么算重要」失效。
//   important  · 上限 200 条（三人合计）：决定、分工、关键事实。按需翻。
//   normal     · 不设上限：其余日常，只留检索，不进每轮。
//
// 两条口径（写过一次，别再改回去）：
//   · **上限是天花板，不是指标**。够格进 core 的有几条就是几条，不拿最近的聊天记录凑满 30 条——
//     那样 core 里就会躺着一堆「做好了」「看漏了」，照样不聚焦。
//   · **「提到」不等于「记住」**：关键词出现在 400 字的工作汇报里，那是提过这件事，不是记住这件事。
//     所以身份/关系/事故都要短句（≤200 字）才算；只有底线/承诺不看长短（底线本来就是一条一条列的）。
//
// 降档顺序：
//   1. 受保护的（身份/承诺/关系/事故 + pinned）留在 core，其余降 important。
//   2. 降完 important 超 200，按「最久未用到」再往 normal 压。
//   3. 「最久未用到」= 召回计数（`yushen_self action=open` 翻一次记一次）→ lastSeenAt → at，越久没翻过越先降。
//   4. 万一只剩受保护的也超了上限，按最久未用到继续降，输出里单列 `强制降档`，不静默。
//
// 用法：
//   node scripts/memory-tier-audit.mjs            # 体检，只读
//   node scripts/memory-tier-audit.mjs --apply    # 真降档（改前备份 .bak-tieraudit-<时间戳>）
//   node scripts/memory-tier-audit.mjs --json     # 机器可读
//
// 红线：不改正文、不删事件；只写 tier；写回前做「解析→重排→逐字节比对」往返校验；
//       落盘前再读一次，按 at+正文认人合并，绝不覆盖这中间插件新写的事件。
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { dayuHome } from '../lib/paths.js'

export const CAPS = Object.freeze({ core: 30, important: 200 })
export const TIERS = Object.freeze(['core', 'important', 'normal'])

const MEMORY_DIR = path.join(dayuHome(), 'soul', 'memory')
const SHORT_TEXT = 200 // 「提到」和「记住」的分界：一句话才算事实，长报告只是记录
const TEXT_PREVIEW = 60

// 受保护的四类事实。any = 不看长短；short = 只有短句才算。
export const PROTECT_RULES = Object.freeze([
  { tag: '承诺', any: /不为祸|底线|承诺过|答应过|说好了|约定好|不许再|再也不|不会忘|不能碰/ },
  { tag: '身份', short: /callName|称呼|叫我|我的名字|名字叫|我叫|身份是|自称/ },
  { tag: '关系', short: /姐姐|妹妹|姐妹|同住|一家人|我的主人|你的主人|主人是|认主人|谁是主人/ },
  { tag: '事故', short: /教训|踩坑|踩过|下次不|再犯/ },
])

// 显式标记：写记忆时把 kind 写成这几类，就直接算「事实」，不靠关键词猜。
// 现在库里一条都没有（kind 只有 say/note/input），留着这扇门给以后用。
export const PROTECT_KINDS = Object.freeze(['identity', 'promise', 'incident', 'relation', 'bottomline', '身份', '承诺', '事故', '关系', '底线'])

/** 生效档位：没写 tier 的按老规矩（pinned → core，其余 normal）。 */
export function effectiveTier(ev) {
  const t = String(ev?.tier || '')
  if (TIERS.includes(t)) return t
  return ev?.pinned ? 'core' : 'normal'
}

/** 命中哪几类保护（空数组 = 谁都不是，优先降它）。 */
export function protectOf(ev) {
  const tags = []
  if (ev?.pinned) tags.push('钉过')
  if (PROTECT_KINDS.includes(String(ev?.kind || ''))) tags.push('标记')
  const text = String(ev?.text || '')
  const short = text.length <= SHORT_TEXT
  for (const rule of PROTECT_RULES) {
    const re = rule.any || rule.short
    if (!re) continue
    if (rule.any || short) if (re.test(`${ev?.kind || ''} ${text}`)) tags.push(rule.tag)
  }
  return [...new Set(tags)]
}

const stamp = () => {
  const d = new Date(Date.now() + 8 * 3600e3) // Asia/Shanghai
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
}

const day = (at) => String(at || '').slice(0, 10) || '（无日期）'
const preview = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, TEXT_PREVIEW)

/** 记忆目录里有哪些角色：目录里已经存在的（干净装时可能只有一两个，不硬凑三个人）。 */
export function roleFiles() {
  let names = []
  try { names = fs.readdirSync(MEMORY_DIR).filter((f) => f.endsWith('.json') && !f.includes('.bak')) } catch { return [] }
  return names.sort().map((f) => ({ role: f.slice(0, -'.json'.length), file: path.join(MEMORY_DIR, f) }))
    .filter((x) => /^[a-z0-9_-]+$/i.test(x.role))
}

/** 读一份记忆：事件数组 + 召回计数（翻一次记一次）。读不出来就跳过，不猜。 */
export function readRole(role, file) {
  let doc = null
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
  let recall = {}
  try { recall = JSON.parse(fs.readFileSync(path.join(dayuHome(), 'runtime', role, '召回计数.json'), 'utf8').replace(/^\uFEFF/, '')) || {} } catch { /* 没翻过就是空 */ }
  return { role, file, doc, events: Array.isArray(doc.events) ? doc.events : [], recall }
}

/** 最近一次被用到：召回计数 > lastSeenAt > at；读不出时间当 0（也就是「很久没用了」）。 */
export function lastUsedOf(ev, index, recall) {
  for (const t of [recall?.[`event:${index}`]?.at, ev?.lastSeenAt, ev?.at]) {
    const ms = Date.parse(String(t || ''))
    if (Number.isFinite(ms)) return ms
  }
  return 0
}

const sigOf = (ev) => [String(ev?.at || ''), String(ev?.text || '')]

/**
 * 纯计算（不碰磁盘）：拿一组 {role, events, recall} 算出体检结果与降档计划。
 * 回归用合成数据直接调这里，不需要动真记忆。
 */
export function analyze(rows, caps = CAPS) {
  const roles = rows.map((row) => {
    const events = row.events || []
    const items = events.map((ev, i) => ({
      role: row.role, index: i, ev,
      tier: effectiveTier(ev),
      protect: protectOf(ev),
      lastUsed: lastUsedOf(ev, i, row.recall),
      sig: sigOf(ev),
    }))
    const count = { core: 0, important: 0, normal: 0, untiered: 0 }
    for (const it of items) {
      count[it.tier] += 1
      if (!TIERS.includes(String(it.ev?.tier || ''))) count.untiered += 1
    }
    return { role: row.role, file: row.file || '', items, count }
  })

  const totals = { core: 0, important: 0, normal: 0, untiered: 0 }
  for (const r of roles) for (const k of Object.keys(totals)) totals[k] += r.count[k]

  const coreOver = Math.max(0, totals.core - caps.core)
  const importantOver = Math.max(0, totals.important - caps.important)

  // ── 第一步：core 只留受保护的事实（上限是天花板，不凑数）───────────────
  const keepCore = new Set()
  const key = (it) => `${it.role}#${it.index}`
  let forcedCore = 0
  for (const r of roles) {
    for (const it of r.items) if (it.tier === 'core' && it.protect.length) keepCore.add(key(it))
  }
  // 受保护的自己就超上限：按最久未用到继续降，单列出来
  if (keepCore.size > caps.core) {
    const prot = roles.flatMap((r) => r.items.filter((it) => keepCore.has(key(it))))
    prot.sort((a, b) => a.lastUsed - b.lastUsed || String(a.role).localeCompare(String(b.role)) || a.index - b.index)
    for (const it of prot) {
      if (keepCore.size <= caps.core) break
      keepCore.delete(key(it))
      forcedCore += 1
    }
  }

  const demoteCore = []
  for (const r of roles) for (const it of r.items) if (it.tier === 'core' && !keepCore.has(key(it))) demoteCore.push(it)
  const keep = roles.flatMap((r) => r.items.filter((it) => keepCore.has(key(it))))
  keep.sort((a, b) => b.lastUsed - a.lastUsed || String(a.role).localeCompare(String(b.role)) || a.index - b.index)

  // ── 第二步：important 溢出再往下压（最久未用到的先走）──────────────────
  const importantNeedDrop = Math.max(0, totals.important + demoteCore.length - caps.important)
  const demoteImportant = []
  let forcedImportant = 0
  if (importantNeedDrop > 0) {
    const pool = roles.flatMap((r) => r.items.filter((it) => it.tier === 'important'))
    const byAge = (a, b) => a.lastUsed - b.lastUsed || String(a.role).localeCompare(String(b.role)) || a.index - b.index
    const free = pool.filter((it) => !it.protect.length).sort(byAge)
    for (const it of free) { if (demoteImportant.length >= importantNeedDrop) break; demoteImportant.push(it) }
    if (demoteImportant.length < importantNeedDrop) {
      for (const it of pool.filter((it) => it.protect.length).sort(byAge)) {
        if (demoteImportant.length >= importantNeedDrop) break
        demoteImportant.push(it)
        forcedImportant += 1
      }
    }
  }

  // ── 第三步：没有 tier 字段的写实（按生效档位落定，不新造档）──────────────
  const normalize = roles.flatMap((r) => r.items.filter((it) => !TIERS.includes(String(it.ev?.tier || ''))))

  const after = {
    core: totals.core - demoteCore.length,
    important: totals.important + demoteCore.length - demoteImportant.length,
    normal: totals.normal + demoteImportant.length,
  }

  return {
    caps, roles, totals, after, coreOver, importantOver, keep,
    demoteCore, demoteImportant, normalize,
    forced: { core: forcedCore, important: forcedImportant },
    // 只表示「现在已经在上限内」；降档后会不会绿，看 after
    ok: coreOver === 0 && importantOver === 0,
    changed: demoteCore.length + demoteImportant.length + normalize.filter((it) => it.tier !== 'normal').length,
  }
}

// ── 落盘 ─────────────────────────────────────────────────────────────

/** 解析 → 重排 → 逐字节比对：格式变了就不写（宁可不动，也不留一份被我改过格式的记忆）。 */
function roundTripOk(text) {
  try { return JSON.stringify(JSON.parse(text), null, 2) + '\n' === text } catch { return false }
}

/** 改 tier：只写 tier 一个字段，其余保持原样；写前备份，写时原子替换。 */
function writeRole(sheet, picks, tags) {
  // 落盘前重读一次：这中间插件可能又写了新事件，按 at+正文认人合并，绝不覆盖新内容
  const before = fs.readFileSync(sheet.file, 'utf8')
  if (!roundTripOk(before)) return { ok: false, reason: '格式往返校验没过（会改动排版），先不动', file: sheet.file }
  const doc = JSON.parse(before)
  const events = Array.isArray(doc.events) ? doc.events : []
  let changed = 0
  let missing = 0
  for (const it of picks) {
    const [at, text] = it.sig
    let ev = events[it.index]
    if (!ev || String(ev.at || '') !== at || String(ev.text || '') !== text) {
      ev = events.find((e) => String(e?.at || '') === at && String(e?.text || '') === text)
    }
    if (!ev) { missing += 1; continue }
    if (String(ev.tier || '') !== it.next) { ev.tier = it.next; changed += 1 }
  }
  if (!changed) return { ok: true, changed: 0, missing, file: sheet.file }

  const backup = `${sheet.file}.bak-tieraudit-${tags.stamp}`
  if (!fs.existsSync(backup)) fs.copyFileSync(sheet.file, backup)
  const tmp = `${sheet.file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, sheet.file)

  // 复核：事件一条都不许少，正文一条都不许变
  const back = JSON.parse(fs.readFileSync(sheet.file, 'utf8'))
  const backEvents = Array.isArray(back.events) ? back.events : []
  const lost = events.filter((e) => !backEvents.some((x) => String(x?.at || '') === String(e?.at || '') && String(x?.text || '') === String(e?.text || '')))
  if (backEvents.length < events.length || lost.length) {
    fs.copyFileSync(backup, sheet.file)
    return { ok: false, reason: `写回后复核失败（事件少了 ${lost.length} 条），已用备份还原`, file: sheet.file }
  }
  return { ok: true, changed, missing, file: sheet.file, backup }
}

// ── 输出 ─────────────────────────────────────────────────────────────

function reportHuman(result) {
  const { caps, roles, totals } = result
  const L = []
  L.push(`记忆分级体检（上限：core ${caps.core} · important ${caps.important}，合计）`)
  L.push('')
  for (const r of roles) {
    const c = r.count
    L.push(`${r.role}：core ${c.core} / important ${c.important} / normal ${c.normal}${c.untiered ? `（无档 ${c.untiered}）` : ''} · 合计 ${r.items.length}`)
  }
  L.push(`合计：core ${totals.core} · important ${totals.important} · normal ${totals.normal}${totals.untiered ? ` · 无档 ${totals.untiered}` : ''}`)
  L.push('')
  if (result.ok) {
    L.push(`都在上限内（core ${totals.core} ≤ ${caps.core}，important ${totals.important} ≤ ${caps.important}），不用降。`)
    return L.join('\n')
  }
  L.push(`core 超上限 ${result.coreOver} 条 → 降 important；降完 important ${totals.important + result.demoteCore.length} 条${result.demoteImportant.length ? `，仍超 ${result.demoteImportant.length} 条 → 降 normal` : ''}。`)
  L.push('')
  L.push(`降完留在 core 的（${result.keep.length} 条，全是身份/承诺/关系/事故）：`)
  for (const it of result.keep) L.push(`  + [${it.role}] ${day(it.ev?.at)} · 〔${it.protect.join('/')}〕${preview(it.ev?.text)}`)
  L.push('')
  if (result.demoteCore.length) {
    L.push(`降 core → important：${result.demoteCore.length} 条（不是身份/承诺/关系/事故，全降；按人）`)
    const byRole = {}
    for (const it of result.demoteCore) byRole[it.role] = (byRole[it.role] || 0) + 1
    L.push(`  ${Object.entries(byRole).map(([r, n]) => `${r} ${n}`).join(' · ')}`)
    for (const it of result.demoteCore.slice(0, 6)) L.push(`  - [${it.role}] ${day(it.ev?.at)} · ${preview(it.ev?.text)}`)
    if (result.demoteCore.length > 6) L.push(`  …另有 ${result.demoteCore.length - 6} 条（--json 看全部）`)
    L.push('')
  }
  if (result.demoteImportant.length) {
    L.push(`降 important → normal：${result.demoteImportant.length} 条（最久未用到的先走）`)
    for (const it of result.demoteImportant.slice(0, 6)) L.push(`  - [${it.role}] ${day(it.ev?.at)} · ${preview(it.ev?.text)}`)
    if (result.demoteImportant.length > 6) L.push(`  …另有 ${result.demoteImportant.length - 6} 条（--json 看全部）`)
    L.push('')
  }
  if (result.normalize.length) L.push(`顺手写实 tier：${result.normalize.length} 条原来没有档位（按生效档位落定，只写 tier）。`)
  if (result.forced.core || result.forced.important) {
    L.push(`⚠ 受保护的自己就超上限，强制降档：core ${result.forced.core} 条 · important ${result.forced.important} 条（没静默，记在这里）。`)
  }
  L.push('')
  L.push(`降完：core ${result.after.core} · important ${result.after.important} · normal ${result.after.normal}`)
  L.push('这次只是体检，没有改文件。要真降档：加 --apply')
  return L.join('\n')
}

function summaryJson(result, extra = {}) {
  const pick = (it) => ({ role: it.role, index: it.index, at: String(it.ev?.at || ''), protect: it.protect, text: preview(it.ev?.text) })
  return {
    caps: result.caps,
    roles: result.roles.map((r) => ({ role: r.role, ...r.count })),
    totals: result.totals,
    after: result.after,
    kept: result.keep.map(pick),
    demoted: { 'core→important': result.demoteCore.map(pick), 'important→normal': result.demoteImportant.map(pick) },
    normalized: result.normalize.map((it) => ({ role: it.role, index: it.index, was: it.ev?.tier ?? null })),
    forced: result.forced,
    ...extra,
  }
}

// ── 入口 ─────────────────────────────────────────────────────────────

async function main(argv) {
  const apply = argv.includes('--apply')
  const json = argv.includes('--json')

  const sheets = roleFiles().map((x) => readRole(x.role, x.file)).filter(Boolean)
  if (!sheets.length) {
    console.error(`没有读到任何记忆文件（${MEMORY_DIR}）。`)
    process.exit(2)
  }
  const result = analyze(sheets)
  if (!json) console.log(reportHuman(result))

  if (!apply) {
    if (json) console.log(JSON.stringify(summaryJson(result, { applied: false }), null, 2))
    return
  }

  const picks = []
  for (const it of result.demoteCore) picks.push({ role: it.role, index: it.index, next: 'important', sig: it.sig })
  for (const it of result.demoteImportant) picks.push({ role: it.role, index: it.index, next: 'normal', sig: it.sig })
  for (const it of result.normalize) picks.push({ role: it.role, index: it.index, next: it.tier, sig: it.sig })
  const byRole = new Map()
  for (const p of picks) {
    if (!byRole.has(p.role)) byRole.set(p.role, [])
    byRole.get(p.role).push(p)
  }

  const tags = { stamp: stamp() }
  const writes = []
  for (const sheet of sheets) {
    const mine = byRole.get(sheet.role) || []
    if (!mine.length) continue
    writes.push({ role: sheet.role, ...writeRole(sheet, mine, tags) })
  }

  // 改完重新数一遍（按磁盘上的实际结果，不按计划）
  const after = sheets.map((s) => {
    const now = readRole(s.role, s.file)
    const c = { core: 0, important: 0, normal: 0 }
    for (const ev of now?.events || []) c[effectiveTier(ev)] = (c[effectiveTier(ev)] || 0) + 1
    return { role: s.role, ...c, total: (now?.events || []).length }
  })
  const sum = after.reduce((a, x) => ({ core: a.core + x.core, important: a.important + x.important, normal: a.normal + x.normal }), { core: 0, important: 0, normal: 0 })
  const failed = writes.filter((w) => !w.ok)

  if (!json) {
    console.log('')
    for (const w of writes) {
      if (!w.ok) console.log(`✗ ${w.role}：${w.reason}`)
      else if (!w.changed) console.log(`· ${w.role}：没变${w.missing ? `（${w.missing} 条没在文件里找到，可能刚被轮转过）` : ''}`)
      else console.log(`✓ ${w.role}：改了 ${w.changed} 条 tier；备份 ${w.backup ? path.basename(w.backup) : '（无改动）'}`)
    }
    console.log('')
    console.log(`改完实测：${after.map((x) => `${x.role} ${x.core}/${x.important}/${x.normal}（${x.total} 条）`).join(' · ')}`)
    console.log(`三人合计：core ${sum.core} · important ${sum.important} · normal ${sum.normal}`)
    if (sum.core > CAPS.core || sum.important > CAPS.important) console.log('⚠ 还是超上限：跑一次体检看是哪几条。')
    else console.log(`上限达标：core ≤ ${CAPS.core} · important ≤ ${CAPS.important}`)
    console.log('大纲要重生成一次：node scripts/build-memory-outline.mjs')
  } else {
    console.log(JSON.stringify(summaryJson(result, { applied: true, writes, after: sum, failed: failed.length }), null, 2))
  }
  if (failed.length) process.exit(1)
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (invoked === import.meta.url) await main(process.argv.slice(2))
