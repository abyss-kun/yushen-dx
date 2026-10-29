// 该不该现在备份：她自己的判断。
//
// 为什么不是纯定时：定时只会"到点看一眼"，而真正可惜的是——刚改完的一段代码、刚谈定的一个决定，
// 崩了就没了的那些。所以除了定时，她还要能在"值得"的时候立刻备一次。
//
// 判断是"参与判断"，不是查表（§4.6 推论四）：
//   重要信号（任一）→ 立刻备：这一轮写了文件 / 谈成了决定 / 输出很长（信息量大）
//   普通信号       → 按冷却：距上次 5 分钟以上才备
//   每小时上限 8 次，超过就先不备（防止把备份本身变成负担）
//
// 不花 token：全是本地判断。备份本身是本地 IO，未变不会新建快照。
// 账：~/.dsh/dayu/backup-judgments.jsonl（每次判断一行：为什么、结果）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const LOG = path.join(DATA, 'backup-judgments.jsonl')

const COOLDOWN_MS = 5 * 60 * 1000
const URGENT_COOLDOWN_MS = 60 * 1000
const MAX_PER_HOUR = 8

const IMPORTANT_RE = /(决定|定了|就这样|以后就|结论是|拍板|改完了|修好了|上线|发出去|删掉了)/

function readLog(limit = 200) {
  try {
    return fs.readFileSync(LOG, 'utf8').trim().split(/\r?\n/).slice(-limit)
      .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}

function lastSnapshotAt() {
  const dir = path.join(DATA, 'protection', 'store', 'snapshots')
  try {
    const files = fs.readdirSync(dir).filter((n) => n.endsWith('.json'))
    let newest = 0
    for (const n of files) {
      try { newest = Math.max(newest, fs.statSync(path.join(dir, n)).mtimeMs) } catch { /* 跳过 */ }
    }
    return newest
  } catch { return 0 }
}

/**
 * 该不该现在备。
 * @param {{reason?:string, text?:string, wroteFiles?:boolean, now?:number}} input
 * @returns {{go:boolean, why:string, urgent:boolean, sinceLastMin:number, lastHour:number}}
 */
export function judge({ reason = 'turn-end', text = '', wroteFiles = false, now = Date.now() } = {}) {
  const body = String(text || '')
  const lastSnap = lastSnapshotAt()
  const sinceLast = lastSnap ? now - lastSnap : Infinity
  const sinceLastMin = Number.isFinite(sinceLast) ? Math.round(sinceLast / 60000) : -1

  const rows = readLog(300)
  const hourAgo = now - 3600 * 1000
  const lastHour = rows.filter((r) => r?.go === true && Date.parse(r.at || '') > hourAgo).length

  const signals = []
  if (wroteFiles) signals.push('这轮写了文件')
  if (IMPORTANT_RE.test(body)) signals.push('话里有决定/结论')
  if (body.length >= 800) signals.push('这轮输出很长')
  const urgent = signals.length > 0

  if (lastHour >= MAX_PER_HOUR) {
    return { go: false, why: `这个小时已经备了 ${lastHour} 次，先不备`, urgent, sinceLastMin, lastHour, signals }
  }
  const wait = urgent ? URGENT_COOLDOWN_MS : COOLDOWN_MS
  if (sinceLast !== Infinity && sinceLast < wait) {
    return {
      go: false,
      why: `距离上次备份才 ${sinceLastMin} 分钟（${urgent ? '重要的事也至少隔 1 分钟' : '普通改动隔 5 分钟'}）`,
      urgent, sinceLastMin, lastHour, signals,
    }
  }
  if (sinceLast === Infinity) {
    return { go: true, why: '还没有任何备份，先备一份', urgent, sinceLastMin, lastHour, signals }
  }
  if (urgent) {
    return { go: true, why: `值得备：${signals.join('、')}`, urgent, sinceLastMin, lastHour, signals }
  }
  return { go: true, why: `距上次 ${sinceLastMin} 分钟，按常规补一份`, urgent, sinceLastMin, lastHour, signals }
}

/** 记一行：为什么备/没备。老板能查她到底在什么时候悄悄备了东西。 */
export function record(entry) {
  try {
    fs.mkdirSync(DATA, { recursive: true })
    fs.appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, 'utf8')
  } catch { /* 记不下不挡备份 */ }
}

/** 判断 + 执行（run 由调用方传入，避免这里依赖备份模块）。 */
export async function maybeBackup({ run, reason = 'turn-end', text = '', wroteFiles = false, now = Date.now() } = {}) {
  const verdict = judge({ reason, text, wroteFiles, now })
  if (!verdict.go) {
    record({ ...verdict, reason, ran: false })
    return { ...verdict, ran: false }
  }
  try {
    const result = await run()
    record({ ...verdict, reason, ran: true, result: summarize(result) })
    return { ...verdict, ran: true, result }
  } catch (error) {
    record({ ...verdict, reason, ran: false, error: String(error?.message || error) })
    return { ...verdict, ran: false, error: String(error?.message || error) }
  }
}

function summarize(result) {
  if (!result || typeof result !== 'object') return String(result ?? '')
  const keys = ['created', 'id', 'skipped', 'reason', 'changed', 'files']
  const out = {}
  for (const k of keys) if (result[k] !== undefined) out[k] = result[k]
  return out
}

/** 最近的判断记录（给她看，也给老板查）。 */
export function recentJudgments({ limit = 10 } = {}) {
  return readLog(200).filter((r) => r?.ran === true).slice(-limit).reverse()
}
