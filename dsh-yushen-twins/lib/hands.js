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
import { noteIncident } from './incidents.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DIR = path.join(HOME, 'dayu')
const QUEUE = path.join(DIR, 'hands.json')
const LEDGER = path.join(DIR, 'hands.jsonl')
const TIMEOUT_MS = 180000
// 一只手连着失败几次就该说一声：不是等人去翻日志，是自己开一张事故单。
const FAIL_ALERT_AT = 3
// 之后每隔这么多次再提醒一次（手一直废着，别报一次就没人管）。
const FAIL_REALERT_EVERY = 10

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

/** 手账尾部若干条（新的在后）。 */
function readLedger(limit = 400) {
  try {
    return fs.readFileSync(LEDGER, 'utf8')
      .split(/\r?\n/).filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
      .slice(-limit)
  } catch { return [] }
}

/**
 * 这只手最近连着失败几次。
 * 从手账尾部数，不看队列里的缓存字段——队列是人手改得到的，
 * 账本是事实；手废着的时候，谁改过 hands.json 都不影响这里。
 */
export function failStreak(id, { rows } = {}) {
  const mine = (rows || readLedger()).filter((r) => r.id === id && !r.alert)
  let n = 0
  for (let i = mine.length - 1; i >= 0; i -= 1) {
    if (mine[i].ok) break
    n += 1
  }
  return n
}

/** 错误文本抹掉每次都会变的东西，同一面墙只留一张单。 */
function stableErr(text) {
  return String(text || '')
    .replace(/[A-Za-z]:\\[^\s"']+/g, (m) => path.basename(m))
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

/**
 * 连败到这个次数要不要报：连败满 3 次报一次，报过之后还废着就再隔 10 次提一次。
 * 判据是「这轮连败数 - 上次报时的连败数」——手刚坏的时候立刻报，
 * 已经在坏的（历史上就断了 10 次）下一次跑也不会被"每 10 次"这个条件漏掉。
 * 单独拎出来是为了能脱开文件直接验：判据和落盘分开，测得到。
 */
export function shouldAlert(streak, lastAlertStreak = 0) {
  const n = Number(streak) || 0
  const last = Number(lastAlertStreak) || 0
  if (n < FAIL_ALERT_AT) return false
  if (last <= 0) return true // 这一轮从没报过
  return n - last >= FAIL_REALERT_EVERY
}

/**
 * 连败到门槛：自己开一张事故单（source=手），让"哪只手废了"出现在待办里，
 * 而不是只躺在 hands.jsonl 里等谁去看。报过的位置记回队列（alertedStreak），
 * 跑通一次就清掉（在 runHand 那边），免得同一个坑报两遍或再也报不出来。
 */
export function alertIfBroken(item, { rows } = {}) {
  const streak = failStreak(item.id, { rows })
  const q = readHands()
  const hit = (q.items || []).find((x) => x.id === item.id)
  const lastAlert = Number(hit?.alertedStreak || 0)
  if (!shouldAlert(streak, lastAlert)) return null
  const last = (rows || readLedger()).filter((r) => r.id === item.id).slice(-1)[0] || {}
  const script = path.basename(String(item.script || ''))
  const text = `手「${item.id}」连续失败（脚本 ${script}）；最后一次：${stableErr(last.err) || '没有错误输出'}`
  let inc = null
  try {
    inc = noteIncident({
      sessionId: `hand:${item.id}`,
      title: `手连续失败：${item.id}`,
      source: '手（不用模型也会跑）',
      text,
    })
  } catch { inc = null }
  // 报过就记下位置，别每跑一次开一张单
  if (hit) {
    hit.alertedStreak = streak
    try { writeHands(q) } catch { /* 记不上最多下次再报一遍 */ }
  }
  // 手账里也留一行（不是失败行，failStreak 会跳过）：谁翻手账都看得见"报过"
  if (inc) {
    try {
      logRow({ at: new Date().toISOString(), id: item.id, ok: false, alert: true,
               out: `连败 ${streak} 次，开了事故单 ${inc.id}`, err: '' })
    } catch { /* 留痕失败不影响报过 */ }
  }
  return inc
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

/**
 * 退出码怎么算：0 = 干成了；非 0 但没往 stderr 写东西、却打印了内容 = 它用非零表示
 * 「我查出了问题」（检查一致性.py、能力台账.py 都是这个约定，头注释里写着"退出码 1"）。
 * 这两种都算跑通；只有"非零 + 有 stderr"或"非零 + 什么都没有"才是真坏了。
 * 单独拎出来为了能脱开进程直接验：判据和 spawn 分开，测得到。
 */
export function classifyExit(status, stderr = '', stdout = '') {
  const code = Number(status)
  if (code === 0) return { ok: true, report: false }
  const spoke = String(stdout || '').trim().length > 0
  const complained = String(stderr || '').trim().length > 0
  if (!complained && spoke) return { ok: true, report: true }
  return { ok: false, report: false }
}

/** 跑一只手。返回 {id, ok, report, out, err, ms}。 */
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
  const verdict = classifyExit(res.status, res.stderr, res.stdout)
  const ok = verdict.ok
  // 真坏了才留 err；"非零但有话说"是它在报结果，别把结果当错误
  const errText = verdict.ok ? '' : String(res.stderr || res.error?.message || '').trim().slice(-400)
  const row = {
    at: new Date(now).toISOString(),
    id: item.id,
    ok,
    report: verdict.report || undefined,
    code: Number(res.status),
    ms: Date.now() - t0,
    out: String(res.stdout || '').trim().slice(-400),
    err: errText,
  }
  logRow(row)

  // 记回 lastRunAt，免得同一只手动两遍；连败数记成事实，跑通一次就清账
  let streak = 0
  try {
    const q = readHands()
    const hit = (q.items || []).find((x) => x.id === item.id)
    if (hit) {
      hit.lastRunAt = row.at
      hit.lastOk = ok
      hit.lastErr = ok ? '' : String(row.err || '').slice(0, 200)
      streak = failStreak(item.id)
      hit.failStreak = streak
      if (ok) hit.alertedStreak = 0 // 好了就当没报过，下次坏了还能立刻报
      writeHands(q)
    }
  } catch { /* 记不上就下次再跑，不致命 */ }

  // 连败到门槛：自己开单，不等谁去翻日志。
  if (!ok) {
    try {
      const inc = alertIfBroken(item)
      if (inc) row.alertId = inc.id
    } catch { /* 开单失败不影响这只手继续跑 */ }
  }
  return row
}

/** 跑所有到点的手。 */
export function runDueHands({ now = Date.now(), limit = 4 } = {}) {
  const due = dueHands({ now }).slice(0, limit)
  return due.map((it) => runHand(it, { now }))
}

/** 最近的手账。 */
export function listHands({ limit = 10 } = {}) {
  return readLedger(Math.max(1, Number(limit) || 10))
}

/** 简报一行：手上有什么、最近跑成没成、哪只废了。 */
export function handsLine() {
  const q = readHands()
  const items = q.items || []
  if (!items.length) return ''
  const on = items.filter((x) => x.enabled !== false)
  const rows = readLedger()
  const last = rows.slice(-3)
  const ls = last.length
    ? '；最近：' + last.map((r) => `${r.id}${r.ok ? (r.report ? '⚠' : '✓') : '✗'}`).join(' ')
    : ''
  const broken = on
    .map((x) => ({ id: x.id, n: failStreak(x.id, { rows }) }))
    .filter((x) => x.n >= FAIL_ALERT_AT)
  const bs = broken.length
    ? '\n废了：' + broken.map((x) => `${x.id}（连败 ${x.n}）`).join(' · ')
    : ''
  return `## 你的手（不用模型也能做）\n${on.map((x) => x.id).join(' · ')}${ls}${bs}`
}
