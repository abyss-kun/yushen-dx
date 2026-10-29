// 手：不用模型也能干活的那些动作。
//
// 为什么要有这一层：
//   "想" 要花模型回合，"做" 大多不用。
//   拉数据、跑检查、生成索引、备份 —— 这些是手，不是脑。
//   把手放进队列，心跳按间隔自动跑，不花钱也能真做事。
//
// 安全：
//   · 只跑白名单里的脚本（queue 里声明过的绝对路径）
//   · 每个脚本有超时
//   · 每次跑都记一笔（手账），失败记原因
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pythonPath } from './paths.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DIR = path.join(HOME, 'dayu')
const QUEUE = path.join(DIR, 'hands.json')
const LEDGER = path.join(DIR, 'hands.jsonl')
const TIMEOUT_MS = 180000

/** 读队列；文件不存在就给一份默认的（这是她天生就该有的手）。 */
export function readHands() {
  try {
    return JSON.parse(fs.readFileSync(QUEUE, 'utf8'))
  } catch {
    return { version: 1, items: [] }
  }
}

export function writeHands(doc) {
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(QUEUE, JSON.stringify(doc, null, 1), 'utf8')
}

function logRow(row) {
  try {
    fs.mkdirSync(DIR, { recursive: true })
    fs.appendFileSync(LEDGER, JSON.stringify(row) + '\n', 'utf8')
  } catch { /* 记不上也不挡干活 */ }
}

/** 长一只手：加进队列，加完当场跑一遍验证（跑坏就不收）。 */
export function addHand({ id, what, script, args = [], minGapMinutes = 120, enabled = true, now = Date.now() } = {}) {
  const name = String(id || '').trim()
  const file = String(script || '').trim()
  if (!name) throw new Error('这只手得有个名字（id）')
  if (!file) throw new Error('要有 script——做什么，落在哪个脚本上')
  if (!fs.existsSync(file)) throw new Error(`脚本不存在：${file}`)

  const q = readHands()
  q.items = q.items || []
  if (q.items.some((x) => x.id === name)) throw new Error(`已经有一只手叫「${name}」了`)

  const item = { id: name, what: String(what || name).slice(0, 120), script: file,
                 args: Array.isArray(args) ? args : [], minGapMinutes: Number(minGapMinutes) || 120, enabled }

  // 加之前先跑一次：跑不通就不收，免得挂一只废手
  const probe = runHand({ ...item, id: `${name}（试跑）` })
  if (!probe.ok) throw new Error(`试跑没过，先别收：${String(probe.err || '').slice(0, 160)}`)

  q.items.push(item)
  writeHands(q)
  // 把试跑记录改成正式名字
  logRow({ at: new Date(now).toISOString(), id: name, ok: true, ms: probe.ms,
           out: `试跑通过：${String(probe.out || '').slice(0, 200)}`, err: '' })
  return { item, probe }
}

/** 砍掉一只手。 */
export function removeHand(id) {
  const q = readHands()
  const before = (q.items || []).length
  q.items = (q.items || []).filter((x) => x.id !== id)
  if (q.items.length === before) throw new Error(`没有叫「${id}」的手`)
  writeHands(q)
  return { removed: id, left: q.items.map((x) => x.id) }
}

/** 开/关一只手。 */
export function toggleHand(id, enabled) {
  const q = readHands()
  const hit = (q.items || []).find((x) => x.id === id)
  if (!hit) throw new Error(`没有叫「${id}」的手`)
  hit.enabled = Boolean(enabled)
  writeHands(q)
  return hit
}

/** 到点的手：enabled、间隔到了、进程不在忙。 */
export function dueHands({ now = Date.now() } = {}) {
  const q = readHands()
  return (q.items || []).filter((it) => {
    if (it.enabled === false) return false
    const gap = Number(it.minGapMinutes ?? 60) * 60000
    const last = Date.parse(it.lastRunAt || 0) || 0
    return now - last >= gap
  })
}

/** 跑一只手。返回 {id, ok, out, err, ms}。 */
export function runHand(item, { now = Date.now() } = {}) {
  const t0 = Date.now()
  const file = String(item.script || '')
  if (!file || !fs.existsSync(file)) {
    const row = { at: new Date(now).toISOString(), id: item.id, ok: false, err: `脚本不存在：${file}` }
    logRow(row)
    return row
  }
  const args = Array.isArray(item.args) ? item.args : []
  const isPy = /\.py$/i.test(file)
  const res = spawnSync(isPy ? pythonPath() : process.execPath, isPy ? [file, ...args] : [file, ...args], {
    timeout: TIMEOUT_MS,
    encoding: 'utf8',
    windowsHide: true,
  })
  const ok = res.status === 0
  const row = {
    at: new Date(now).toISOString(),
    id: item.id,
    ok,
    ms: Date.now() - t0,
    out: String(res.stdout || '').trim().slice(-400),
    err: ok ? '' : String(res.stderr || res.error?.message || '').trim().slice(-400),
  }
  logRow(row)

  // 记回 lastRunAt，免得同一只手动两遍
  try {
    const q = readHands()
    const hit = (q.items || []).find((x) => x.id === item.id)
    if (hit) {
      hit.lastRunAt = row.at
      hit.lastOk = ok
      writeHands(q)
    }
  } catch { /* 记不上就下次再跑，不致命 */ }
  return row
}

/** 跑所有到点的手。 */
export function runDueHands({ now = Date.now(), limit = 4 } = {}) {
  const due = dueHands({ now }).slice(0, limit)
  return due.map((it) => runHand(it, { now }))
}

/** 最近的手账。 */
export function listHands({ limit = 10 } = {}) {
  try {
    return fs.readFileSync(LEDGER, 'utf8')
      .split(/\r?\n/).filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
      .slice(-limit)
  } catch { return [] }
}

/** 简报一行：手上有什么、最近跑成没成。 */
export function handsLine() {
  const q = readHands()
  const items = q.items || []
  if (!items.length) return ''
  const on = items.filter((x) => x.enabled !== false)
  const last = listHands({ limit: 3 })
  const ls = last.length
    ? '；最近：' + last.map((r) => `${r.id}${r.ok ? '✓' : '✗'}`).join(' ')
    : ''
  return `## 你的手（不用模型也能做）\n${on.map((x) => x.id).join(' · ')}${ls}`
}
