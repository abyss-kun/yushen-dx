/* 标签
 * id: memory-core-open-loops
 * kind: module
 * summary: 未闭合承诺：把“她答应/打算要做的事”记成一条 open loop；可关闭/放弃/标记提醒，不替她判断做完。
 * tags: 未闭合, 承诺, 待办, 心跳, 唤醒, 只说不做
 * created: 2026-11-15 13:55:00
 * changed: 2026-11-15 13:53:06
 * author: 大鱼·本班
 * authority: 老板（2026-11-15：治只说不做 + 联动心跳/唤醒）
 * audience: capture、心跳、唤醒、以后页面
 * owner: 框架；只追加状态，不删原承诺
 * mutable: 可改；关闭必须带证据，放弃必须允许
 * usage: createLoop / listLoops / closeLoop / dropLoop / markNotified
 * why: 任务卡只记“要做”，没有“后来闭没闭合”
 * result: 每条承诺有 open/closed/dropped/overdue 状态和来源
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { dataRoot } from './root.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const clip = (s, n = 160) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)
const norm = (s) => String(s || '').toLowerCase().replace(/[\s，。！？、；：,.!?;:"'“”‘’（）()【】[\]]/g, '').slice(0, 100)
const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10)

export function loopsFile(role) {
  return path.join(dataRoot(HOME), 'library', 'meta', `open-loops-${role}.jsonl`)
}

function readOps(role) {
  try {
    return fs.readFileSync(loopsFile(role), 'utf8').split(/\r?\n/).filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
  } catch { return [] }
}

/** 折叠 append-only 状态：open → closed/dropped/overdue；同 id 取最后状态。 */
export function listLoops(role, { status = '', now = Date.now() } = {}) {
  const by = new Map()
  for (const op of readOps(role)) {
    if (!op.id) continue
    if (op.op === 'open') by.set(op.id, { ...op, status: 'open', notifiedAt: '', closedAt: '', droppedAt: '', evidence: '' })
    else {
      const cur = by.get(op.id)
      if (!cur) continue
      if (op.op === 'close') { cur.status = 'closed'; cur.closedAt = op.at; cur.closedBy = op.by || ''; cur.evidence = op.evidence || '' }
      if (op.op === 'drop') { cur.status = 'dropped'; cur.droppedAt = op.at; cur.droppedBy = op.by || ''; cur.note = op.note || '' }
      if (op.op === 'notify') cur.notifiedAt = op.at
    }
  }
  const out = [...by.values()].map((l) => {
    if (l.status !== 'open') return l
    const due = Number(l.dueAtMs || 0)
    return { ...l, overdue: Boolean(due && due <= now) }
  })
  return status ? out.filter((l) => l.status === status) : out
}

export function createLoop(role, { what = '', due = '', dueAtMs = 0, sourceTurnId = '', sourceRef = '', sessionId = '', confidence = '推测', now = Date.now() } = {}) {
  const text = clip(what)
  if (!text) return { ok: false, reason: 'what 为空' }
  const id = `loop-${sha(`${role}|${norm(text)}|${sourceTurnId || sourceRef || ''}`)}`
  const open = listLoops(role, { status: 'open', now })
  if (open.some((l) => l.id === id || norm(l.what) === norm(text))) return { ok: true, duplicate: true, id }
  const row = {
    op: 'open', id, at: new Date(now).toISOString(), role,
    what: text, due: String(due || ''), dueAtMs: Number(dueAtMs) || 0,
    sourceTurnId: String(sourceTurnId || ''), sourceRef: String(sourceRef || ''),
    sessionId: String(sessionId || ''), confidence: String(confidence || '推测').slice(0, 10),
  }
  try {
    fs.mkdirSync(path.dirname(loopsFile(role)), { recursive: true })
    fs.appendFileSync(loopsFile(role), `${JSON.stringify(row)}\n`, { encoding: 'utf8', mode: 0o600 })
    return { ok: true, id, row }
  } catch (e) { return { ok: false, error: String(e?.message || e) } }
}

function appendState(role, id, op, extra = {}) {
  const target = String(id || '')
  if (!target) return { ok: false, reason: 'id 为空' }
  const found = listLoops(role).find((l) => l.id === target)
  if (!found) return { ok: false, reason: '没有这条 loop' }
  const row = { op, id: target, at: new Date().toISOString(), role, ...extra }
  try {
    fs.mkdirSync(path.dirname(loopsFile(role)), { recursive: true })
    fs.appendFileSync(loopsFile(role), `${JSON.stringify(row)}\n`, { encoding: 'utf8', mode: 0o600 })
    return { ok: true, id: target, row }
  } catch (e) { return { ok: false, error: String(e?.message || e) } }
}

export function closeLoop(role, id, { evidence = '', by = '', now = Date.now() } = {}) {
  return appendState(role, id, 'close', { at: new Date(now).toISOString(), evidence: clip(evidence, 300), by: String(by || '').slice(0, 80) })
}

export function dropLoop(role, id, { note = '', by = '', now = Date.now() } = {}) {
  return appendState(role, id, 'drop', { at: new Date(now).toISOString(), note: clip(note, 200), by: String(by || '').slice(0, 80) })
}

export function markNotified(role, id, { now = Date.now() } = {}) {
  return appendState(role, id, 'notify', { at: new Date(now).toISOString() })
}
