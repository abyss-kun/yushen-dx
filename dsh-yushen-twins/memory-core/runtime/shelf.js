/* 标签
 * id: lib-library-shelf
 * kind: module
 * summary: 闭架库——条目/典藏一个月不用就搬进 library/闭架/<年-月>/，被用到再搬回在用；只搬不删。
 * tags: 图书馆, 闭架, 降级, 分区, 只搬不删
 * created: 2026-11-11 18:5x
 * changed: 2026-11-11 18:47:33
 * author: 大鱼·本班（接手交接 2026-11-11-0255）
 * authority: 主人（交接 §二 图书馆定稿：条目/典藏一个月不用 → 闭架；闭架被用到 → 条目；闭架可查、不优先）
 * why: 在用目录只进不出，越攒越多，检索时旧条目和新的抢位置；真图书馆靠"闭架"解决——不删，只是搬到要找管理员的地方
 * result: planDemotion（只算不动）/ demoteStale（按月分桶搬走）/ revive（搬回在用）/ shelfStats（各层几本、最早最晚）
 * audience: 她（查到闭架时知道"这是旧书"）、维护者、面板
 * owner: 框架；"一个月"与"只搬不删"两条是主人定的，别放宽
 * mutable: 可改（只许收紧：不许改成删除、不许把闭架排到在用前面）
 * usage: node scripts/library-closed.mjs plan|demote|revive|stats；代码里 demoteStale({days:30, dry:false})
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-11 19:0x｜大鱼·本班（接手交接 2026-11-11-0255）｜授权：主人（交接 §二 图书馆定稿：条目/典藏一个月不用 → 闭架；闭架被用到 → 条目；闭架可查不优先）｜lib/library-shelf.js:1-300｜新增闭架库模块：planDemotion（只算）/ demoteStale（整份搬、按月分桶）/ demoteDaily（心跳里一天一次）/ revive（搬回）/ closedLookup / shelfStats｜为什么：在用只进不出，旧条目和新条目抢检索位置；真图书馆用闭架解决——不删、只搬、可查、不优先｜验证：node scripts/test-library-closed.mjs 10/10；node scripts/regression.mjs 全绿；搬来搬去 sha1 一字不差｜可改：可改；"只搬不删""闭架排最后"两条不许破
//
// 闭架的规矩（2026-11-11 定，落实交接里的图书馆定稿）：
//   1) 在用（条目/典藏）里，整份文件每一条的 at 都早于 cutoff（默认 30 天）→ 搬到 library/闭架/<年-月>/<类别>/<日>.jsonl；
//      **一份文件里只要还有一条新的，就整份留着**——免得把新条目也一起关进去。
//   2) 闭架按月分桶：桶名 = 搬进去那天所在的月（年-月）。以后按桶清理/盘点方便。
//   3) 只搬不删：任何一行的正文都不改、不删；搬回来原样。
//   4) 闭架可查、不优先：libraryLookup 只在她平常读的两层都没有结果时才翻闭架，命中结果标 zone=闭架。
//   5) 搬回（revive）是**显式动作**：只在命令里做，读的时候不偷偷改目录。
//
// 已知近似（写清楚，别当事实用）：现在还没有"逐条被用过"的痕迹，所以"一个月不用"暂时用条目自己的时间（at）
// 代替"最后一次用到"。等图书馆的借阅反馈（lib/borrow.js 那条线）接到条目上，这里应该改成读 lastUsedAt。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from './root.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
export const DATA = dataRoot(HOME)
export const LIB = path.join(DATA, 'library')
export const OPEN_LAYER = '在用'
export const CLOSED_LAYER = '闭架'
export const DEFAULT_DAYS = 30

const pad = (n) => String(n).padStart(2, '0')
export const monthOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}` }

function walk(dir, out = []) {
  let list = []
  try { list = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of list) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.jsonl$/i.test(e.name)) out.push(p)
  }
  return out
}

const readRows = (file) => {
  const rows = []
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      try { rows.push(JSON.parse(line)) } catch { /* 坏行跳过，但整份文件不搬（保住原文） */ }
    }
  } catch { /* 读不到就空 */ }
  return rows
}

/** 一条条目的时间（ms）：at > day > 文件 mtime。 */
export function timeOfRow(row = {}, fallbackMs = 0) {
  const t = Date.parse(String(row.at || '').replace(' ', 'T'))
  if (Number.isFinite(t)) return t
  const d = Date.parse(`${String(row.day || '').slice(0, 10)}T00:00:00`)
  if (Number.isFinite(d)) return d
  return fallbackMs
}

/**
 * 一份文件该不该关进闭架。
 * @returns {{file:string, rows:number, stale:number, oldest:number, newest:number, unreadable:number, due:boolean}}
 */
export function inspectFile(file, { days = DEFAULT_DAYS, now = Date.now() } = {}) {
  const cutoff = Number(now) - Number(days) * 86400e3
  const rows = readRows(file)
  const total = (() => { try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim()).length } catch { return 0 } })()
  let mt = 0
  try { mt = fs.statSync(file).mtimeMs } catch { /* 没有就算了 */ }
  const times = rows.map((r) => timeOfRow(r, mt))
  const oldest = times.length ? Math.min(...times) : mt
  const newest = times.length ? Math.max(...times) : mt
  const stale = times.filter((t) => t < cutoff).length
  const unreadable = Math.max(0, total - rows.length)
  // 有坏行就不搬：宁可留在在用，也不替她"解释"读不出来的东西。
  const due = rows.length > 0 && unreadable === 0 && stale === rows.length
  return { file, rows: rows.length, stale, oldest, newest, unreadable, due }
}

/** 在用的全部文件（相对 library 的 posix 路径）。 */
export function openFiles() {
  return walk(path.join(LIB, OPEN_LAYER)).map((f) => ({ file: f, rel: path.relative(LIB, f).replace(/\\/g, '/') }))
}

/**
 * 降级计划（只算，不搬）。默认 30 天。
 * @returns {{days:number, cutoff:string, due:Array, keptFiles:number, dueRows:number, mixedFiles:number}}
 */
export function planDemotion({ days = DEFAULT_DAYS, now = Date.now() } = {}) {
  const d = Math.max(1, Number(days) || DEFAULT_DAYS)
  const cutoff = Number(now) - d * 86400e3
  const due = []
  let keptFiles = 0
  let mixedFiles = 0
  for (const { file, rel } of openFiles()) {
    const info = inspectFile(file, { days: d, now })
    if (info.due) due.push({ ...info, rel })
    else {
      keptFiles += 1
      if (info.stale > 0) mixedFiles += 1
    }
  }
  return {
    days: d,
    cutoff: new Date(cutoff).toISOString(),
    due,
    keptFiles,
    mixedFiles,
    dueRows: due.reduce((a, x) => a + x.rows, 0),
  }
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }) }

/** 搬到闭架（整份文件移动；目标同名存在就改成带序号的，绝不覆盖）。 */
function moveToClosed(file, rel, { now = Date.now() } = {}) {
  const month = monthOf(now)
  const base = path.join(LIB, CLOSED_LAYER, month)
  // rel 是「在用/知识/2026-10-01.jsonl」——去掉最外层（在用）再进闭架桶，保留 类别/日 的结构。
  const inner = String(rel || '').replace(/\\/g, '/').split('/').slice(1).join('/') || path.basename(file)
  let target = path.join(base, inner)
  ensureDir(path.dirname(target))
  if (fs.existsSync(target)) {
    const ext = path.extname(target)
    const stem = target.slice(0, -ext.length)
    let i = 2
    while (fs.existsSync(`${stem}-${i}${ext}`)) i += 1
    target = `${stem}-${i}${ext}`
  }
  fs.renameSync(file, target)
  return path.relative(LIB, target).replace(/\\/g, '/')
}

/**
 * 真搬。默认 dry（只报计划），要搬必须显式 dry:false。
 * @returns {{ok:boolean, dry:boolean, days:number, month:string, moved:Array<{from:string,to:string,rows:number}>, skipped:number}}
 */
export function demoteStale({ days = DEFAULT_DAYS, now = Date.now(), dry = true } = {}) {
  const plan = planDemotion({ days, now })
  const month = monthOf(now)
  const moved = []
  if (!dry) {
    for (const f of plan.due) {
      try {
        const to = moveToClosed(f.file, f.rel, { now })
        moved.push({ from: f.rel, to, rows: f.rows })
      } catch { /* 一份搬不动不影响别的 */ }
    }
  }
  return { ok: true, dry: Boolean(dry), days: plan.days, month, plan, moved, skipped: plan.due.length - moved.length }
}

/** 闭架里有哪些文件（相对 library）。 */
export function closedFiles() {
  return walk(path.join(LIB, CLOSED_LAYER)).map((f) => ({ file: f, rel: path.relative(LIB, f).replace(/\\/g, '/') }))
}

/**
 * 从闭架搬回在用（显式动作）。rel 可以带月份前缀，也可以只给「类别/日.jsonl」。
 * 目标已存在 → 换一个带序号的名字并存（**不覆盖、不删任何一份**）；两边的行都还在。
 */
export function revive(rel, { now = Date.now() } = {}) {
  const want = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!want) return { ok: false, reason: 'rel 不能为空' }
  const hit = closedFiles().find((x) => x.rel === `${CLOSED_LAYER}/${want}`)
    || closedFiles().find((x) => x.rel.endsWith(`/${want}`))
    || closedFiles().find((x) => x.rel.endsWith(want))
  if (!hit) return { ok: false, reason: `闭架里没有：${want}` }
  // 闭架/<月>/<类别>/<日>.jsonl → 在用/<类别>/<日>.jsonl
  const parts = hit.rel.split('/')
  const inner = parts.slice(2).join('/')
  if (!inner) return { ok: false, reason: `路径不像闭架条目：${hit.rel}` }
  let target = path.join(LIB, OPEN_LAYER, inner)
  ensureDir(path.dirname(target))
  if (fs.existsSync(target)) {
    const ext = path.extname(target)
    const stem = target.slice(0, -ext.length)
    let i = 2
    while (fs.existsSync(`${stem}-${i}${ext}`)) i += 1
    target = `${stem}-${i}${ext}`
  }
  try {
    fs.renameSync(hit.file, target)
    return { ok: true, from: hit.rel, to: path.relative(LIB, target).replace(/\\/g, '/'), at: new Date(now).toISOString() }
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) }
  }
}

/** 各层几本、最早最晚（只读，给命令和面板）。 */
export function shelfStats({ days = DEFAULT_DAYS, now = Date.now() } = {}) {
  const layer = (name) => {
    const files = name === CLOSED_LAYER ? closedFiles() : walk(path.join(LIB, name)).map((f) => ({ file: f }))
    let rows = 0
    let oldest = 0
    let newest = 0
    for (const { file } of files) {
      for (const r of readRows(file)) {
        rows += 1
        const t = timeOfRow(r, 0)
        if (!t) continue
        if (!oldest || t < oldest) oldest = t
        if (!newest || t > newest) newest = t
      }
    }
    return { files: files.length, rows, oldest: oldest ? new Date(oldest).toISOString() : '', newest: newest ? new Date(newest).toISOString() : '' }
  }
  const plan = planDemotion({ days, now })
  const months = {}
  for (const { rel } of closedFiles()) {
    const m = rel.split('/')[1] || '?'
    months[m] = (months[m] || 0) + 1
  }
  return { 在用: layer(OPEN_LAYER), 中层: layer('中层'), 手抄本: layer('手抄本'), 待提炼: layer('待提炼'), 闭架: layer(CLOSED_LAYER), months, plan: { days: plan.days, dueFiles: plan.due.length, dueRows: plan.dueRows, mixedFiles: plan.mixedFiles } }
}

/** 闭架里的条目（只读）。 */
export function closedLookup({ q = '', kind = '', day = '', limit = 5 } = {}) {
  const needle = String(q || '').trim()
  const kindWant = String(kind || '').trim()
  const dayWant = String(day || '').trim()
  const hits = []
  for (const { file, rel } of closedFiles()) {
    for (const r of readRows(file)) {
      if (kindWant && String(r.kind || '') !== kindWant) continue
      if (dayWant && !String(r.day || r.at || '').startsWith(dayWant)) continue
      if (needle && !String(r.text || r.head || '').includes(needle) && !String(r.keywords || '').includes(needle) && !String(r.appliesTo || '').includes(needle)) continue
      hits.push({ ...r, zone: CLOSED_LAYER, closedRel: rel })
    }
  }
  hits.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
  return hits.slice(0, Math.max(1, Number(limit) || 5))
}

// 一天一次：给自己看的小账本（哪天搬了、搬了几份、搬到哪个桶）。
const stateFile = () => path.join(LIB, 'meta', 'closed-state.json')
const logFile = () => path.join(LIB, 'meta', 'closed-log.jsonl')
const dayOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

function readState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')) } catch { return { version: 1, day: '', lastAt: '', moved: 0 } }
}
function writeState(s) {
  try {
    ensureDir(path.dirname(stateFile()))
    fs.writeFileSync(stateFile(), `${JSON.stringify({ ...s, version: 1 })}\n`, 'utf8')
  } catch { /* 记不上也不挡搬 */ }
}
function appendLog(row) {
  try {
    ensureDir(path.dirname(logFile()))
    fs.appendFileSync(logFile(), `${JSON.stringify(row)}\n`, 'utf8')
  } catch { /* 同上 */ }
}

/**
 * 心跳里一天跑一次的降级：真搬，但一天最多一次；搬了什么写 library/meta/closed-log.jsonl。
 * @returns {{ok:boolean, skipped:boolean, day:string, moved:Array, month?:string}}
 */
export function demoteDaily({ days = DEFAULT_DAYS, now = Date.now() } = {}) {
  const day = dayOf(now)
  const st = readState()
  if (st.day === day) return { ok: true, skipped: true, day, moved: [] }
  const r = demoteStale({ days, now, dry: false })
  writeState({ day, lastAt: new Date(now).toISOString(), moved: r.moved.length, month: r.month })
  for (const m of r.moved) appendLog({ at: new Date(now).toISOString(), event: 'demote', month: r.month, from: m.from, to: m.to, rows: m.rows })
  return { ok: true, skipped: false, day, moved: r.moved, month: r.month }
}

