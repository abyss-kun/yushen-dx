/* 标签
 * id: lib-summary-pending
 * kind: module
 * summary: 总结核对闸门说“该叫”时，排队等一次唤醒；叫过就记 notified，不每轮催。
 * tags: 总结, 核对, 唤醒, 去重
 * created: 2026-11-16 13:30:00
 * changed: 2026-11-16 13:30:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-16：总结闸门接唤醒）
 * audience: 心跳、唤醒、总结核对
 * owner: 框架；只追加，不删
 * mutable: 可改；同一 dedupeKey 不重复排队
 * usage: enqueue(role, gate) / listPending(role) / markNotified(role,key)
 * why: 闸门只判断“该不该叫”，没人把它送到下一次醒
 * result: 该叫的排队，醒一次，叫过不再催
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from '../memory-core/runtime/root.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const fileOf = (role) => path.join(dataRoot(HOME), 'runtime', String(role || 'dayu'), 'summary-pending.jsonl')

function readAll(role) {
  const out = []
  try {
    for (const line of fs.readFileSync(fileOf(role), 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      try { out.push(JSON.parse(line.replace(/^\uFEFF/, ''))) } catch { /* 坏行跳过 */ }
    }
  } catch { /* 还没有 */ }
  return out
}

export function enqueue(role, gate, { now = Date.now() } = {}) {
  const key = String(gate?.dedupeKey || '')
  if (!gate?.wake || !key) return { ok: true, queued: false, why: '不到唤醒线' }
  if (readAll(role).some((r) => r.kind === 'check' && String(r.dedupeKey) === key)) return { ok: true, queued: false, why: '同一份总结已排过' }
  const file = fileOf(role)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const row = {
    kind: 'check',
    dedupeKey: key,
    role: String(role || 'dayu'),
    reasons: Array.isArray(gate.reason) ? gate.reason : [String(gate.reason || '')],
    counts: gate.counts || {},
    at: new Date(now).toISOString(),
  }
  fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf8')
  return { ok: true, queued: true, key }
}

export function listPending(role, { limit = 1 } = {}) {
  const rows = readAll(role)
  const notified = new Set(rows.filter((r) => r.kind === 'notified').map((r) => String(r.dedupeKey)))
  const byKey = new Map()
  for (const r of rows) {
    if (r.kind !== 'check' || notified.has(String(r.dedupeKey))) continue
    byKey.set(String(r.dedupeKey), r)
  }
  return [...byKey.values()].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, Math.max(1, Number(limit) || 1))
}

export function markNotified(role, dedupeKey, { now = Date.now() } = {}) {
  const key = String(dedupeKey || '')
  if (!key) return { ok: false, why: '缺 dedupeKey' }
  const file = fileOf(role)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, JSON.stringify({ kind: 'notified', dedupeKey: key, at: new Date(now).toISOString() }) + '\n', 'utf8')
  return { ok: true, key }
}
