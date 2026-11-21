/* 标签
 * id: inventory
 * kind: module
 * tags: 盘点, 清点, 账实, 图书馆, 周期
 * created: 2026-11-04 17:35:00
 * changed: 2026-11-04 19:48:19
 * author: 照微·工作台
 * authority: 老板（2026-11-04：仓库有月盘、半年盘、一年盘，天盘也有但一般不这么干）
 * why: 书目上有的，文件可能已经没了；没有盘点，"账实相符"永远只是说法
 * result: 按周期对账：日盘只看当天新增，月盘看最近 30 天，半年/全年全量；出"盘亏/盘盈"清单
 * mutable: 可改
 */
// 用法：
//   node scripts/inventory.mjs --auto       # 按日期自动选档（维护里调这个）
//   node scripts/inventory.mjs --level day  # day / month / half / year / all
//   node scripts/inventory.mjs --level all --json
//
// 三种结果：
//   账实相符：卡片在，文件也在
//   盘亏（账有架无）：卡片在，文件没了 —— 要查是剔了没留痕，还是真丢了
//   盘盈（架有账无）：文件在，书目里没有 —— 要么漏上架，要么该剔
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const D = path.join(HOME, 'dayu')
const args = process.argv.slice(2)
const auto = args.includes('--auto')
const json = args.includes('--json')
const lvIdx = args.indexOf('--level')
let level = lvIdx >= 0 ? String(args[lvIdx + 1] || 'day') : ''

const { hardTimeout } = await import(pathToFileURL(path.join(ROOT, 'lib', 'offline-guard.js')).href)
hardTimeout(10, 'inventory.mjs')

const today = new Date()

/** 按"仓库那套"定档：天天盘太累了，只盘当天新增；其余按周期上深度。 */
function pickLevel(d = today) {
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate()
  if (m === 1 && day === 1) return 'year'
  if ((m === 1 || m === 7) && day === 1) return 'half'
  if (day === 1) return 'month'
  return 'day'
}

const stateFile = path.join(D, 'state', 'inventory.json')
const st = (() => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch { return {} } })()
if (!level) level = auto ? pickLevel() : 'day'

// 每档记一个上次跑的日子，同一天不重复（维护每小时跑，不用每小时盘）
const dayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
if (auto && st[level] === dayKey) {
  if (json) console.log(JSON.stringify({ at: new Date().toISOString(), level, skipped: '今天已经盘过' }, null, 2))
  else console.log(`盘点（${level}）：今天已经盘过，跳过`)
  process.exit(0)
}

const catalogFile = path.join(D, 'catalog', '总书目.jsonl')
let rows = []
try { rows = fs.readFileSync(catalogFile, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) } catch { rows = [] }

const resolveWhere = (where = '') => {
  const w = String(where).replace(/\\/g, '/')
  if (!w) return ''
  // 媒体/导出类卡片存的是绝对路径（D:/...），不能当"家目录下的相对路径"拼
  if (/^[A-Za-z]:\//.test(w) || w.startsWith('//')) return w
  if (w.startsWith('docs/') || w.startsWith('scripts/') || w.startsWith('lib/')) return path.join(ROOT, w)
  return path.join(D, w)
}

// 按档位圈定范围
const since = (() => {
  if (level === 'day') return new Date(today.getTime() - 1 * 86400e3)
  if (level === 'month') return new Date(today.getTime() - 30 * 86400e3)
  if (level === 'half') return new Date(today.getTime() - 183 * 86400e3)
  return null // year / all：全量
})()
const scope = rows.filter((r) => {
  if (r.cls === 'X') return false // 已剔的不参与盘点
  if (!since) return true
  const t = Date.parse(String(r.at || ''))
  return Number.isFinite(t) ? t >= since.getTime() : true
})

const missing = []
let present = 0
for (const r of scope) {
  const p = resolveWhere(r.where)
  let ok = false
  try { ok = fs.existsSync(p) } catch { ok = false }
  if (ok) present += 1
  else missing.push({ id: r.id, title: r.title, where: r.where, at: r.at })
}

// 盘盈只在半年/全年扫（要遍历目录，日盘不做）
// 2026-11-04 改：只扫"书库目录"——账本、状态、流水、归档、员工档案都不是书。
// 以前扫整个家目录，把 account.json / ideas/*.md 全算成"架上有账上没有"，200 条盘盈里大半是这个。
let surplus = []
if (level === 'half' || level === 'year' || level === 'all') {
  const known = new Set(rows.filter((r) => r.cls !== 'X').map((r) => String(r.where).replace(/\\/g, '/')))
  const SHELVES = ['library/在用', 'soul/memory', 'diary', 'records'] // 只在这几个"库房"里找书
  const walk = (dir, depth = 0) => {
    if (depth > 4) return
    let list = []
    try { list = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of list) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p, depth + 1)
      else if (/\.(json|jsonl|md)$/.test(e.name)) {
        // 索引/目录这类不是书（大纲、链接表、总索引），别算盘盈
        if (/^(大纲\.md|链接\.jsonl|链条\.jsonl|index\.jsonl|媒体索引\.md|不可删清单\.md)$/.test(e.name)) continue
        const rel = path.relative(D, p).replace(/\\/g, '/')
        if (!known.has(rel)) surplus.push(rel)
      }
    }
  }
  for (const shelf of SHELVES) walk(path.join(D, shelf))
  surplus = surplus.slice(0, 200)
}

const report = {
  at: new Date().toISOString(),
  level,
  scope: scope.length,
  present,
  missing: missing.length,
  surplus: surplus.length,
  missingList: missing.slice(0, 50),
  surplusList: surplus.slice(0, 50),
}
const verdict = missing.length ? '有盘亏' : (surplus.length ? '有盘盈' : '账实相符')

if (!json) {
  console.log(`盘点（${level}）：清点 ${scope.length} 张，在架 ${present}，盘亏 ${missing.length}，盘盈 ${surplus.length} → ${verdict}`)
  for (const m of missing.slice(0, 10)) console.log(`  ✗ 盘亏 ${m.id}｜${String(m.title).slice(0, 30)}｜${m.where}`)
  for (const s of surplus.slice(0, 5)) console.log(`  + 盘盈 ${s}`)
}

// 写报告 + 记状态
try {
  const dir = path.join(D, 'health')
  fs.mkdirSync(dir, { recursive: true })
  const dateKey = dayKey
  const md = [
    `# 盘点（${level}）${dateKey}`,
    '',
    `> 清点 ${scope.length} 张｜在架 ${present}｜**盘亏 ${missing.length}**｜盘盈 ${surplus.length}｜结论：${verdict}`,
    '',
    missing.length ? `## 盘亏（账上有、架上没有）` : '## 盘亏：无',
    ...missing.slice(0, 100).map((m) => `- ${m.id}｜${m.title}｜${m.where}`),
    '',
    surplus.length ? `## 盘盈（架上有、账上没有）` : '## 盘盈：无',
    ...surplus.slice(0, 100).map((s) => `- ${s}`),
    '',
    '（由 scripts/inventory.mjs 自动生成。日盘只盘当天；月盘 30 天；半年/全年全量。）',
  ].join('\n')
  fs.writeFileSync(path.join(dir, `盘点-${dateKey}-${level}.md`), md, 'utf8')
  st[level] = dateKey
  st.last = { at: report.at, level, missing: missing.length, surplus: surplus.length, verdict }
  fs.writeFileSync(stateFile, JSON.stringify(st, null, 2) + '\n', 'utf8')
} catch { /* 报告写不上不影响对账结果 */ }

if (json) console.log(JSON.stringify(report, null, 2))
// 有盘亏就非零退（让巡视和回归能看见），盘盈不算错
process.exit(missing.length ? 1 : 0)
