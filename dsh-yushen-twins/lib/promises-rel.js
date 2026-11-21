/* 标签
 * id: lib-promises-rel
 * kind: module
 * summary: 承诺（关系向）：她答应过**谁**什么、什么时候到期、后来做到没有
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: promiseFile / allPromises / addPromise / promisesOf（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-03 01:53｜大鱼·子会话（工作台；父会话 c82f4345 委派）｜授权：老板（本次任务书：关系库承诺与印象）｜lib/promises-rel.js:1-307｜新增：关系向承诺（带到期）的追加/到期判定/结清/按人查，落 ~/.dsh/dayu/relations/promises.jsonl｜为什么：关系库原来只有「好感」，答应过谁什么、什么时候到期、做到没有全散在记忆里，问一次翻一遍；承诺逾期没人知道｜验证：& $node scripts/test-relations-extra.mjs 全过（追加/去重累加/到期判定/结清不改内容/按人过滤/坏行跳过/顺序两次不丢）；node --check 通过；node 内联 parseTrace 六要素齐｜可改：可改（字段只增不删；动结构要同步 scripts/test-relations-extra.mjs）
//
// 承诺（关系向）：她答应过**谁**什么、什么时候到期、后来做到没有。
//
// 和另外两处「承诺」不是一回事，别混：
//   · scripts/promise-book.mjs —— 她对自己说「我要做」，诺言本；
//   · lib/mind-store.js 的 kind='promise' —— 心念里的承诺（也是对自己）；
//   · 这里 —— **对某个人**的承诺（who 是老板/群友），到期要结清。三处各存各的，不互相搬。
//
// 规矩：
//   · jsonl 一行一条，和 people.jsonl 同层（~/.dsh/dayu/relations/）；
//   · 新承诺用 O_APPEND 追写：一次写入由内核保证不与他人交错，两个进程同时追加也不会互相盖；
//     结清只改那一条的状态与备注，整份走 tmp + fsync + rename 原子替换；
//   · 只增不删：结清不删记录，status 从 open 变 kept/missed；
//   · 每条带 at（写入时间）与 source（哪来的），承诺本身看 madeAt / dueAt；
//   · 零依赖、不读网络、不调模型：这里只存与查，判断由调用方做。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { dshHome } from './paths.js'
import { localISO } from './clock.js'

/** 文件名（和 people.jsonl 放同一层）。 */
export const PROMISE_FILE = 'promises.jsonl'
/** 只认这三种状态：open 未结 / kept 做到 / missed 没做到。 */
export const PROMISE_STATUS = Object.freeze(['open', 'kept', 'missed'])
/** 「快到了」的默认窗口：24 小时。 */
export const SOON_MS = 24 * 60 * 60 * 1000

const STATUS_SET = new Set(PROMISE_STATUS)
/** 去空白、限长：落盘前先收一遍，免得一行里塞进换行把 jsonl 拆坏。 */
const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
/** 调用方可能传 null 或不是对象：收成对象，别让取字段时抛错。 */
const asObj = (v) => (v && typeof v === 'object' ? v : {})

/** 关系库目录：baseDir 注入优先（测试/迁移用），否则 ~/.dsh/dayu/relations。 */
function relationsDir(opts = {}) {
  const given = opts && typeof opts.baseDir === 'string' ? opts.baseDir.trim() : ''
  return path.resolve(given || path.join(dshHome(), 'dayu', 'relations'))
}

/** 承诺文件路径（给测试和工具核对用，不写盘）。 */
export function promiseFile(opts = {}) {
  return path.join(relationsDir(opts), PROMISE_FILE)
}

/** 时间：Date / 毫秒 / ISO 串都认；认不出返回 NaN（不抛错）。 */
function toMs(value) {
  if (value === undefined || value === null || value === '') return NaN
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  const ms = Date.parse(String(value))
  return Number.isFinite(ms) ? ms : NaN
}

/** 统一收成本地 ISO（带真实时区偏移）；认不出就 ''。 */
function isoOf(value) {
  const ms = toMs(value)
  return Number.isFinite(ms) ? localISO(new Date(ms)) : ''
}

/** 读 jsonl 的原始行；文件还没有就返回空数组。坏行留给调用方逐行判断。 */
function readLines(file) {
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { return [] }
  return text.replace(/^\uFEFF/, '').split('\n').filter((line) => line.trim())
}

/** 收一条承诺的形状；不是承诺（缺 id/who/what）返回 null。 */
function normalize(row) {
  const id = str(row.id, 60)
  const who = str(row.who, 40)
  const what = str(row.what, 500)
  if (!id || !who || !what) return null
  const at = isoOf(row.at)
  const madeAt = isoOf(row.madeAt) || at
  if (!madeAt) return null
  const out = { id, who, what, madeAt }
  const dueAt = isoOf(row.dueAt)
  if (dueAt) out.dueAt = dueAt
  out.status = STATUS_SET.has(String(row.status)) ? String(row.status) : 'open'
  const note = str(row.note, 300)
  if (note) out.note = note
  out.at = at || madeAt
  out.source = str(row.source, 120)
  const settledAt = isoOf(row.settledAt)
  if (settledAt) out.settledAt = settledAt
  return out
}

/** 一次追加：O_APPEND + fsync。不用「读全量再 tmp 重写」做追加，那会丢并发写入的那几条。 */
function appendRow(file, row) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const fd = fs.openSync(file, 'a')
  try {
    fs.writeFileSync(fd, `${JSON.stringify(row)}\n`, 'utf8')
    try { fs.fsyncSync(fd) } catch { /* 有的文件系统不认 fsync，忽略 */ }
  } finally {
    try { fs.closeSync(fd) } catch { /* 关不掉也要把错抛出去 */ }
  }
}

/** 整份原子替换：先写同目录 tmp、fsync、再 rename 盖上去；失败清 tmp 并抛。 */
function atomicWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`
  let fd = null
  try {
    fd = fs.openSync(tmp, 'w')
    fs.writeFileSync(fd, text, 'utf8')
    try { fs.fsyncSync(fd) } catch { /* 同上 */ }
    fs.closeSync(fd)
    fd = null
    fs.renameSync(tmp, file)
  } catch (err) {
    if (fd !== null) { try { fs.closeSync(fd) } catch { /* 已经出错，别盖掉原错 */ } }
    try { fs.rmSync(tmp, { force: true }) } catch { /* 清不掉也不挡 */ }
    throw err
  }
}

/** 未结的按到期时间看状态；已结的原样返回 kept/missed。 */
function stateAt(row, atMs) {
  if (row.status !== 'open') return row.status
  const due = toMs(row.dueAt)
  if (!Number.isFinite(due)) return 'open'
  return due <= atMs ? 'overdue' : 'open'
}

/** 列表顺序：未结在前（到期早的在前、没到期日的排后），已结按结清时间倒序。 */
function sortRows(rows) {
  return rows.slice().sort((a, b) => {
    const aOpen = a.status === 'open' ? 0 : 1
    const bOpen = b.status === 'open' ? 0 : 1
    if (aOpen !== bOpen) return aOpen - bOpen
    if (aOpen === 0) {
      const ad = toMs(a.dueAt)
      const bd = toMs(b.dueAt)
      const af = Number.isFinite(ad)
      const bf = Number.isFinite(bd)
      if (af && bf && ad !== bd) return ad - bd
      if (af !== bf) return af ? -1 : 1
      return (toMs(b.madeAt) || 0) - (toMs(a.madeAt) || 0)
    }
    return (toMs(b.settledAt) || toMs(b.madeAt) || 0) - (toMs(a.settledAt) || toMs(a.madeAt) || 0)
  })
}

/**
 * 全部承诺（按 id 去重，后写的为准；坏行跳过，一条坏行不能让整本账读不出来）。
 * opts: { baseDir? }
 */
export function allPromises(opts = {}) {
  opts = asObj(opts)
  const byId = new Map()
  for (const line of readLines(promiseFile(opts))) {
    let row = null
    try { row = JSON.parse(line) } catch { continue } // 坏行跳过
    if (!row || typeof row !== 'object') continue
    const item = normalize(row)
    if (!item) continue
    byId.set(item.id, item)
  }
  return [...byId.values()]
}

/**
 * 追加一条承诺。
 * input: { id?, who, what, madeAt?, dueAt?, status?, note?, source?, at? }
 * opts:  { baseDir? }（baseDir 只给测试/迁移注入，默认家目录）
 * 返回：{ ok: true, promise, file } / { ok: false, reason }
 */
export function addPromise(input = {}, opts = {}) {
  input = asObj(input)
  opts = asObj(opts)
  const who = str(input.who, 40)
  const what = str(input.what, 500)
  if (!who) return { ok: false, reason: 'who 不能为空：这是给谁的承诺' }
  if (!what) return { ok: false, reason: 'what 不能为空：承诺了什么' }
  const at = isoOf(input.at) || localISO()
  const madeAt = isoOf(input.madeAt) || at
  let dueAt = ''
  if (input.dueAt !== undefined && input.dueAt !== null && String(input.dueAt).trim() !== '') {
    dueAt = isoOf(input.dueAt)
    if (!dueAt) return { ok: false, reason: `dueAt 认不出：${String(input.dueAt)}` }
  }
  const status = input.status === undefined || input.status === null ? 'open' : str(input.status, 10)
  if (!STATUS_SET.has(status)) return { ok: false, reason: `status 只能是 ${PROMISE_STATUS.join(' / ')}` }
  const given = str(input.id, 60)
  const id = given || `pr-${crypto.createHash('sha1')
    .update(`${who}|${what}|${madeAt}|${crypto.randomBytes(4).toString('hex')}`, 'utf8')
    .digest('hex').slice(0, 10)}`
  const promise = { id, who, what, madeAt }
  if (dueAt) promise.dueAt = dueAt
  promise.status = status
  const note = str(input.note, 300)
  if (note) promise.note = note
  promise.at = at
  promise.source = str(input.source, 120)
  const file = promiseFile(opts)
  appendRow(file, promise)
  return { ok: true, promise, file }
}

/**
 * 按人查（who 传空 = 全部）。未结在前、按到期升序；已结按结清时间倒序。
 * opts: { baseDir?, now?, status? }（status 传 open/kept/missed 只取一档）
 */
export function promisesOf(who = '', opts = {}) {
  opts = asObj(opts)
  const target = str(who, 40)
  const atMs = Number.isFinite(toMs(opts.now)) ? toMs(opts.now) : Date.now()
  const only = str(opts.status, 10)
  const rows = allPromises(opts)
    .filter((row) => (!target || row.who === target) && (!only || row.status === only))
  return sortRows(rows).map((row) => {
    const due = toMs(row.dueAt)
    const out = { ...row, state: stateAt(row, atMs) }
    if (Number.isFinite(due)) out.dueInMs = due - atMs
    return out
  })
}

/**
 * 到期判定：只算 status=open 的。
 *   overdue —— 已过 dueAt 的（过期最久的在前）；
 *   soon    —— 距 dueAt 不超过 soonMs 的（默认 24h，最近到期的在前）；
 *   没写 dueAt 的不进这两个表，只进 undated 计数。
 * now: 毫秒 / Date / ISO 串；不传就用系统时间。opts: { baseDir?, soonMs? }
 */
export function duePromises(now = Date.now(), opts = {}) {
  opts = asObj(opts)
  const atMs = Number.isFinite(toMs(now)) ? toMs(now) : Date.now()
  const rawSoon = Number(opts.soonMs)
  const soonMs = Number.isFinite(rawSoon) && rawSoon >= 0 ? rawSoon : SOON_MS
  const live = allPromises(opts).filter((row) => row.status === 'open')
  const overdue = []
  const soon = []
  let undated = 0
  for (const row of live) {
    const due = toMs(row.dueAt)
    if (!Number.isFinite(due)) { undated += 1; continue }
    if (due <= atMs) {
      overdue.push({ ...row, state: 'overdue', overdueByMs: atMs - due, dueInMs: due - atMs })
    } else if (due - atMs <= soonMs) {
      soon.push({ ...row, state: 'soon', dueInMs: due - atMs })
    }
  }
  overdue.sort((a, b) => b.overdueByMs - a.overdueByMs)
  soon.sort((a, b) => a.dueInMs - b.dueInMs)
  return {
    ok: true,
    at: localISO(new Date(atMs)),
    soonMs,
    overdue,
    soon,
    openCount: live.length,
    undated,
    file: promiseFile(opts),
  }
}

/**
 * 结清一条：只许改 status 与 note，其余（who/what/madeAt/dueAt/…）原样不动，记录不删。
 * status: kept 做到 / missed 没做到 / open 收回重开。
 * 坏行原地留着，不因为结清被顺手清掉。
 * 返回 { ok: true, promise, before, file } / { ok: false, reason }
 */
export function settlePromise(id, patch = {}, opts = {}) {
  patch = asObj(patch)
  opts = asObj(opts)
  const key = str(id, 60)
  if (!key) return { ok: false, reason: 'id 不能为空' }
  const status = str(patch && patch.status, 10)
  if (!STATUS_SET.has(status)) return { ok: false, reason: `status 只能是 ${PROMISE_STATUS.join(' / ')}` }
  const file = promiseFile(opts)
  const lines = readLines(file)
  let row = null
  let index = -1
  for (let i = 0; i < lines.length; i += 1) {
    let parsed = null
    try { parsed = JSON.parse(lines[i]) } catch { continue } // 坏行跳过
    if (parsed && typeof parsed === 'object' && String(parsed.id) === key) { row = parsed; index = i }
  }
  if (!row) return { ok: false, reason: `没有这条承诺：${key}` }
  const before = normalize(row)
  if (!before) return { ok: false, reason: `这条承诺缺字段，不敢结：${key}` }
  // 从原行复制：未允许改的字段一个都不碰（patch 里夹带 what/dueAt 也没用）。
  const next = { ...row, status }
  if (patch.note !== undefined) {
    const note = str(patch.note, 300)
    if (note) next.note = note
    else delete next.note
  }
  if (status === 'open') delete next.settledAt
  else next.settledAt = localISO()
  const written = lines.slice()
  written[index] = JSON.stringify(next)
  atomicWrite(file, `${written.join('\n')}\n`)
  return {
    ok: true,
    before: { status: before.status, note: before.note || '' },
    promise: normalize(next),
    file,
  }
}
