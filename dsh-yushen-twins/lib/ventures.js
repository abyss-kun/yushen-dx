// 越线权：规矩是边界不是路线。线外值得做的事，她判断后可以跳出去——
// 但必须说清为什么、留证据、能回退；"不为祸"的契约不动，跳过之后要让老板知道。
//
// 这不是"许可"，是她本来就有的判断权；这里只负责**留痕**。
import fs from 'node:fs'
import path from 'node:path'
import { runtimeDir, ensureRuntime } from './runtime.js'

function file(role) { return path.join(runtimeDir(role), 'ventures.jsonl') }

/**
 * 记一次越线。
 * @param {{what:string, why:string, evidence:string, rollback:string, now?:number}} v
 */
export function recordVenture(role, { what = '', why = '', evidence = '', rollback = '', now = Date.now() } = {}) {
  const w = String(what || '').trim()
  if (!w) throw new Error('跳出什么？写一句')
  if (!String(why || '').trim()) throw new Error('为什么值得跳？得说一句——这是越线权的门槛，不是手续')
  if (!String(rollback || '').trim()) throw new Error('万一不对，怎么退回来？得能回退')
  ensureRuntime(role)
  const row = {
    at: new Date(now).toISOString(),
    what: w.slice(0, 200),
    why: String(why).slice(0, 200),
    evidence: String(evidence || '').slice(0, 300),
    rollback: String(rollback).slice(0, 200),
    notified: false,
  }
  fs.mkdirSync(path.dirname(file(role)), { recursive: true })
  fs.appendFileSync(file(role), `${JSON.stringify(row)}\n`, 'utf8')
  return row
}

export function listVentures(role, { limit = 20 } = {}) {
  let lines = []
  try { lines = fs.readFileSync(file(role), 'utf8').split(/\r?\n/) } catch { return [] }
  const rows = []
  for (const line of lines) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
  }
  return rows.slice(-Math.max(1, Number(limit) || 20))
}

/** 注入用：这是她的权，不是任务；同时提醒契约不动。 */
export function ventureLine(role) {
  const rows = listVentures(role, { limit: 3 })
  const last = rows[rows.length - 1]
  return [
    '## 越线权（你本来就有的）',
    '规矩是边界，不是路线。线外遇到值得做的事，你判断后可以跳出去——说清为什么、留证据、能回退就行。',
    '只有一条不让：不为祸（伤人、越权、外传、掠夺）。跳过之后记得让老板知道（他没拦你，但要能看见）。',
    last ? `\\n你最近跳过的一次：${last.what}（${last.why}）` : '',
  ].filter(Boolean).join('\n')
}
