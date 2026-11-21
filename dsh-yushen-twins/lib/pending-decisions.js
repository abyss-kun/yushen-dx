/* 标签
 * id: lib-pending-decisions
 * kind: module
 * summary: 待确认（2026-11-03 老板定；2026-11-06 被静默删过一次，按原设计加回）
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: addDecision / closeDecision / listDecisions（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
// 待确认（2026-11-03 老板定；2026-11-06 被静默删过一次，按原设计加回）
//   ① 需要老板一句话才能定的，不阻塞——先按默认往下走；
//   ② 问题记进队列（带默认值、我当时在做什么）；
//   ③ 老板回了 → 关单 + 告知「你回的是哪件、我按你的话改了什么」。
// 规矩：已经问过的不再重复问；关单不许静默。
// 注：lib/pending.js 是「投出去的活等哪句回话」（回复配对），lib/owner-ask.js 是「拿不准时问他」，
//     这三样不是一回事：this = 决定排队，不阻塞。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
export const DECISION_FILE = path.join(HOME, 'dayu', 'library', '待确认.jsonl')

const readJsonl = (f) => {
  try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) } catch { return [] }
}

/** 开单：同一句话不重复开。 */
export function addDecision({ question, fallback = '', doing = '', role = 'dayu', at = new Date().toISOString() } = {}) {
  const q = String(question || '').trim()
  if (!q) return { ok: false, error: '问题不能空' }
  const open = listDecisions({ role }).find((p) => p.question === q)
  if (open) return { ok: true, id: open.id, duplicate: true }
  const rec = {
    id: 'w-' + crypto.createHash('sha1').update(q + at).digest('hex').slice(0, 10),
    question: q.slice(0, 120),
    fallback: String(fallback || '按保守那一边（不删 / 不乱花 / 保持现状）').slice(0, 80),
    doing: String(doing || '').slice(0, 60),
    role,
    at,
    status: 'open',
  }
  fs.mkdirSync(path.dirname(DECISION_FILE), { recursive: true })
  fs.appendFileSync(DECISION_FILE, JSON.stringify(rec) + '\n', 'utf8')
  return { ok: true, id: rec.id }
}

/** 关单：记下老板怎么答的、我按他的话改了什么（不许静默关）。 */
export function closeDecision(id, { answer = '', changed = '', at = new Date().toISOString() } = {}) {
  const it = listDecisions().find((p) => p.id === id)
  if (!it) return { ok: false, error: '没有这张单子（或已关）' }
  fs.appendFileSync(DECISION_FILE, JSON.stringify({ ...it, status: 'closed', answer: String(answer).slice(0, 80), changed: String(changed).slice(0, 80), closedAt: at }) + '\n', 'utf8')
  return { ok: true, id }
}

/** 没收单的（同一 id 取最新一条）。 */
export function listDecisions({ role = '', limit = 5 } = {}) {
  const latest = new Map()
  for (const r of readJsonl(DECISION_FILE)) latest.set(r.id, r)
  return [...latest.values()]
    .filter((r) => r.status === 'open')
    .filter((r) => !role || !r.role || r.role === role)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))
    .slice(0, limit)
}
