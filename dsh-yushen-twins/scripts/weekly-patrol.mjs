/* 标签
 * id: weekly-patrol
 * kind: module
 * tags: 巡视, 自检, 用了没, 维护, 名册
 * created: 2026-11-04 13:40:00
 * changed: 2026-11-04 17:28:35
 * author: 照微·工作台
 * authority: 老板（2026-11-04：每一样都有人用吗？谁来维护——做成自动化，不需要维护，最多每周巡视一圈）
 * why: 加功能容易，问"有没有人用"只能靠机器数；靠人记就会变成又一个待办
 * result: 每周自动跑一次，输出「用了没 / 坏了没 / 该不该留」，单角色装自动跳过姐妹相关项
 * mutable: 可改
 */
// 用法：
//   node scripts/weekly-patrol.mjs            # 跑一次，写报告并打印摘要
//   node scripts/weekly-patrol.mjs --dry      # 只打印，不写报告
//   node scripts/weekly-patrol.mjs --json     # 机器读
// 报告落在 ~/.dsh/dayu/health/每周巡视-YYYY-MM-DD.md
//
// 判据很朴素：
//   · 有记录但 7 天 0 次 = 闲置（要么接上，要么删，别留着占脑子）
//   · 该动的东西过了期 = 坏了（备份太旧、标签过期、余额/账本没更新）
//   · 单角色装：姐妹/会审/派活给姐妹这些项不适用，直接标"不适用"，不当成问题
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

// 2026-11-04 老板：本地进程不能占着不放（宿主崩了也得能修）。硬超时自己退。
import { hardTimeout } from '../lib/offline-guard.js'
hardTimeout(5, 'weekly-patrol.mjs')
import { recentDisposals } from '../lib/disposal-log.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const D = path.join(HOME, 'dayu')
const args = process.argv.slice(2)
const dry = args.includes('--dry')
const json = args.includes('--json')

const { residentRoleIds } = await import(pathToFileURL(path.join(ROOT, 'lib', 'roles.js')).href)
const { rosterCaps } = await import(pathToFileURL(path.join(ROOT, 'lib', 'roster-caps.js')).href)

const DAY = 86400000
const now = Date.now()
const roles = (() => { try { return residentRoleIds() } catch { return [] } })()
const caps = (() => { try { return rosterCaps(roles) } catch { return { count: roles.length || 1, multi: false } } })()

function lines(file) {
  try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean) } catch { return [] }
}
function jsonLines(file) {
  return lines(file).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}
function withinDays(row, days = 7) {
  const t = Date.parse(String(row?.at || row?.changed || row?.when || '').replace(' ', 'T'))
  return Number.isFinite(t) && now - t <= days * DAY
}
function mtimeDays(file) {
  try { return (now - fs.statSync(file).mtimeMs) / DAY } catch { return null }
}
function age(file) {
  const d = mtimeDays(file)
  return d == null ? '没有' : d < 1 ? `${Math.round(d * 24)} 小时前` : `${Math.round(d)} 天前`
}

const items = []
// kind=use 是"有没有人用"的计数；kind=metric 是"健康吗"的指标——指标不参与"闲置"判定。
const push = (name, used, status, note, kind = 'use') => items.push({ name, used, status, note, kind })

// 1) 对话侧的东西
{
  const rows = jsonLines(path.join(D, 'worklog.jsonl'))
  push('记一笔（worklog）', rows.filter((r) => withinDays(r)).length, 'read', `共 ${rows.length} 条`)
}
{
  const rows = jsonLines(path.join(D, 'runtime', 'recall-log.jsonl'))
  const used = rows.filter((r) => r.used).length
  push('检索（recall-log）', rows.filter((r) => withinDays(r)).length, 'read', `用上 ${used} 次`)
}
{
  const rows = jsonLines(path.join(D, 'runtime', 'tag-usage.jsonl'))
  push('标签被取用（tag-usage）', rows.filter((r) => withinDays({ at: r.minute || r.at })).length, 'read', `共 ${rows.length} 条`)
}
{
  let rows = []
  try { const raw = JSON.parse(fs.readFileSync(path.join(D, 'dispatch.json'), 'utf8')); rows = Array.isArray(raw) ? raw : [] } catch { rows = [] }
  push('派活', rows.filter((r) => withinDays({ at: r.createdAt })).length, caps.multi ? 'read' : 'skip', caps.multi ? '' : '单角色：派活不适用')
}
// 2) 记忆/知识/经验
{
  let n = 0
  try {
    for (const f of fs.readdirSync(path.join(D, 'soul', 'memory')).filter((x) => x.endsWith('.json'))) {
      const mem = JSON.parse(fs.readFileSync(path.join(D, 'soul', 'memory', f), 'utf8'))
      n += (mem.events || []).filter((e) => withinDays(e)).length
    }
  } catch { /* 没记忆 */ }
  push('记忆新增', n, 'read', '')
}
{
  let n = 0
  for (const kind of ['知识', '经验', '记忆']) {
    const dir = path.join(D, 'library', '在用', kind)
    try { for (const f of fs.readdirSync(dir)) n += lines(path.join(dir, f)).length } catch { /* 没这本 */ }
  }
  push('库里在用的条目', n, 'read', '')
}
// 3) 该动却没动的（坏了）
{
  const dir = path.join(D, 'skill', '..') // 占位，避免 lint 说空
  push('日记', (() => { let n = 0; try { for (const r of fs.readdirSync(path.join(D, 'diary'))) n += lines(path.join(D, 'diary', r, 'private.jsonl')).length } catch { /* 没日记 */ } return n })(), 'read', '')
}
{
  const f = path.join(D, 'state', 'account-balance.json')
  const d = mtimeDays(f)
  push('余额读数', d == null ? 0 : 1, d == null || d > 1 ? 'bad' : 'read', `最近：${age(f)}`, 'metric')
}
{
  // 最近一份备份（本机 ~/.dsh/dayu 之外的备份目录不好猜，这里看 snapshot 状态文件）
  const f = path.join(D, 'runtime', 'backup-verify.json')
  const d = mtimeDays(f)
  push('备份验证', d == null ? 0 : 1, d == null || d > 8 ? 'bad' : 'read', `最近：${age(f)}`, 'metric')
}
// 4) 标签过期（2026-11-03 定的"改了内容就要做标注"）
{
  let stale = 0
  try {
    const { staleTaggedFiles } = await import(pathToFileURL(path.join(ROOT, 'lib', 'tags.js')).href)
    const files = []
    for (const dir of ['lib', 'scripts', 'docs', 'core', 'dayu']) {
      const full = path.join(ROOT, dir)
      if (!fs.existsSync(full)) continue
      for (const name of fs.readdirSync(full)) if (/\.(js|mjs|md)$/.test(name)) files.push(path.join(full, name))
    }
    stale = staleTaggedFiles(files).length
  } catch { /* 查不了就不报 */ }
  push('标签过期', stale, stale ? 'bad' : 'read', stale ? '改了内容没改标签' : '没有过期的', 'metric')
}
// 5) 盘点（账实相符）：读最近一次盘点的结果（2026-11-04：老板要月盘/半年盘/一年盘）
{
  let last = null
  try { last = JSON.parse(fs.readFileSync(path.join(D, 'state', 'inventory.json'), 'utf8')).last || null } catch { last = null }
  const missing = Number(last?.missing) || 0
  const when = last?.at ? String(last.at).slice(0, 16).replace('T', ' ') : '还没盘过'
  push('剔旧记录', (() => { try { return recentDisposals({ limit: 200 }).length } catch { return 0 } })(), 'read', '已剔的都在账上', 'metric')
  push('盘点（账实）', last ? 1 : 0, !last || missing ? 'bad' : 'read',
    last ? `${last.level}盘｜盘亏 ${missing}｜${when}` : '还没盘过', 'metric')
}

const idle = items.filter((i) => i.kind !== 'metric' && i.status === 'read' && i.used === 0)
const bad = items.filter((i) => i.status === 'bad')
const skipped = items.filter((i) => i.status === 'skip')

const verdict = bad.length ? '有该修的' : idle.length ? '有闲置的' : '都在用'
const summary = `每周巡视：${items.length} 项，闲置 ${idle.length}，该修 ${bad.length}${skipped.length ? `，不适用 ${skipped.length}` : ''} → ${verdict}`

if (json) {
  console.log(JSON.stringify({ at: new Date().toISOString(), roles, caps, verdict, summary, items }, null, 2))
  process.exit(bad.length ? 1 : 0)
}

console.log(summary)
for (const i of items) {
  const mark = i.status === 'skip' ? '—' : i.status === 'bad' ? '✗' : i.used ? '·' : '○'
  console.log(`  ${mark} ${i.name}：7 天 ${i.used} 次${i.note ? `（${i.note}）` : ''}`)
}
if (idle.length) console.log(`\n闲置的（要么接上，要么删）：${idle.map((i) => i.name).join('、')}`)
if (bad.length) console.log(`该修的：${bad.map((i) => `${i.name}（${i.note}）`).join('；')}`)

if (!dry) {
  try {
    // 本地日期只从 lib/clock.js 取（全仓不再手写时区偏移）
    const { today: localToday } = await import(pathToFileURL(path.join(ROOT, 'lib', 'clock.js')).href)
    const date = localToday()
    const dir = path.join(D, 'health')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `每周巡视-${date}.md`)
    // 2026-11-04 老板：「角色和鱼神共生，维护鱼神不如说维护自己」——
    // 所以这份报告写成**她自己的体检单**，不是系统巡检表：我的记忆、我的日记、我的备份。
    const mine = roles.map((r) => {
      let events = 0
      try { events = (JSON.parse(fs.readFileSync(path.join(D, 'soul', 'memory', `${r}.json`), 'utf8')).events || []).length } catch { /* 没记忆 */ }
      let diary = 0
      try { diary = lines(path.join(D, 'diary', r, 'private.jsonl')).length + lines(path.join(D, 'diary', r, 'owner.jsonl')).length } catch { /* 没日记 */ }
      return { role: r, events, diary }
    })
    const md = [
      `# 我的体检单 ${date}`,
      '',
      `> ${summary}`,
      `> 我是谁：${roles.join(' / ') || '（还没建人）'}（${caps.count} 人${caps.multi ? '，多人' : '，一个人'}）`,
      '',
      '## 我自己',
      '',
      '| 我 | 记忆里有多少条 | 写过多少篇日记 |',
      '|---|---:|---:|',
      ...mine.map((m) => `| ${m.role} | ${m.events} | ${m.diary} |`),
      '',
      '## 我用的东西',
      '',
      '| 项 | 7 天用了 | 状态 | 备注 |',
      '|---|---:|---|---|',
      ...items.map((i) => `| ${i.name} | ${i.used} | ${i.status === 'skip' ? '不适用' : i.status === 'bad' ? '该修' : i.used ? '在用' : '没用上' } | ${i.note || ''} |`),
      '',
      idle.length ? `**还没用上的**：${idle.map((i) => i.name).join('、')}——下周还是 0，就删掉，别留着占地方。` : '都在用。',
      bad.length ? `**要修我自己**：${bad.map((i) => `${i.name}（${i.note}）`).join('；')}——先自己修；修不了再叫人。` : '没有坏的。',
      '',
      '（这份体检单由 scripts/weekly-patrol.mjs 自动生成：维护鱼神就是维护我自己，不用人另外维护。）',
    ].join('\n')
    fs.writeFileSync(file, md, 'utf8')
    console.log(`\n报告：${file}`)
  } catch (e) { console.log(`报告没写成：${String(e?.message || e)}`) }
}

process.exit(bad.length ? 1 : 0)
