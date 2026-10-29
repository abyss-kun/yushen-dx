// 她的判断：每来一条消息，按她自己的权重评一次「要不要抬头」。
//
// 影子期：只记分、留痕，不拦任何东西——桥照旧按它自己的规则走。
// 这样才有分歧可看：她那边的判断 vs 手机那边的判断（框架 §4.5 验收 3）。
// 零 token：不叫模型，只算分数。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { readInbox } from './inbox.js'
import { runtimeDir, safeRole, ensureRuntime, readWeights } from './runtime.js'
import { decideFor } from './reply-gate.js'

function pad(n) { return String(n).padStart(2, '0') }
function dayKey(ms) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback } }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${crypto.randomBytes(3).toString('hex')}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function judgmentsDir(role) { return path.join(runtimeDir(role), 'judgments') }
function cursorFile(role) { return path.join(runtimeDir(role), 'judgments.json') }

/**
 * 给她还没评过的消息评一次。
 * @returns {{judged:number, tally:object, weights:object}}
 */
export function judgeOnce(role, { now = Date.now(), limit = 200 } = {}) {
  ensureRuntime(role)
  const rows = readInbox({ day: dayKey(now), limit: 100000 }).rows
  const cur = readJson(cursorFile(role), { version: 1, lastId: '' })
  let start = 0
  if (cur.lastId) {
    const i = rows.findIndex((r) => r.id === cur.lastId)
    if (i >= 0) start = i + 1
  }
  const pending = rows.slice(start).slice(-Math.max(1, Number(limit) || 200))
  const weights = readWeights(role).values
  const judged = []
  const tally = { reply: 0, later: 0, skip: 0 }
  for (let i = 0; i < pending.length; i += 1) {
    const row = pending[i]
    const msgAt = Date.parse(row.at || '') || now
    const d = decideFor(role, { now: Math.max(now, msgAt), msgAt, atMe: row.atMe === true, unread: pending.length - i })
    tally[d.verdict] = (tally[d.verdict] || 0) + 1
    judged.push({
      at: row.at, id: row.id, key: row.key, who: row.name || row.userId, atMe: row.atMe === true,
      score: d.score, gate: d.gate, verdict: d.verdict, parts: d.parts,
      // 桥那边怎么判的，影子期留空；接上 A 档后再填，用来比分歧。
      bridge: null,
    })
  }
  if (judged.length) {
    const file = path.join(judgmentsDir(role), `${dayKey(now)}.jsonl`)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, judged.map((j) => `${JSON.stringify(j)}\n`).join(''), 'utf8')
    writeJson(cursorFile(role), { version: 1, lastId: pending[pending.length - 1].id, updatedAt: new Date(now).toISOString() })
  }
  return { judged: judged.length, tally, weights: { replyGate: weights.replyGate } }
}

/** 看她今天下过哪些判断（复盘用，只读）。 */
export function readJudgments(role, { day = '', limit = 50 } = {}) {
  const file = path.join(judgmentsDir(role), `${day || dayKey(Date.now())}.jsonl`)
  let lines = []
  try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/) } catch { return { ok: true, rows: [], file } }
  const rows = []
  for (const line of lines) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
  }
  return { ok: true, rows: rows.slice(-Math.max(1, Number(limit) || 50)), count: rows.length, file }
}
