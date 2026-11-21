/* 标签
 * id: lib-session-lease
 * kind: module
 * summary: 同一角色的多会话里，同一时间只让一个会话领到“叫醒/投递”的短租约；过期自动失效，释放只认原主。
 * tags: 多会话, 租约, 串行, 叫醒, 不重复
 * created: 2026-11-16 22:50:00
 * changed: 2026-11-16 22:53:48
 * author: 大鱼·本班
 * authority: 老板（2026-11-16：多会话不要重复叫/重复回）
 * audience: 心跳、投递、以后的多会话信箱
 * owner: 框架；只写 runtime/<role>/session-lease.json
 * mutable: 可改；TTL 和“只认原主释放”不许去掉
 * usage: acquire(role, sessionId, {ttlMs}) / release(role, sessionId) / current(role)
 * why: 同一角色可能同时有多条会话；没有租约时同一件事会被叫两遍
 * result: 一个短租约；同一时间只有一个 owner，过期可被接手
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from '../memory-core/runtime/root.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const fileOf = (role) => path.join(dataRoot(HOME), 'runtime', String(role || 'dayu'), 'session-lease.json')

function readLease(role) {
  try {
    const data = JSON.parse(fs.readFileSync(fileOf(role), 'utf8'))
    if (!data || typeof data !== 'object') return null
    return data
  } catch { return null }
}

export function current(role, { now = Date.now() } = {}) {
  const l = readLease(role)
  if (!l || !l.owner) return null
  if (Number(l.untilMs) > 0 && Number(l.untilMs) <= now) return null
  return l
}

export function acquire(role, sessionId, { ttlMs = 120000, now = Date.now() } = {}) {
  const owner = String(sessionId || '').trim()
  if (!owner) return { ok: false, why: '缺 sessionId' }
  const l = readLease(role)
  const active = l && l.owner && Number(l.untilMs) > now
  if (active && String(l.owner) !== owner) {
    return { ok: false, why: '别人正拿着', owner: String(l.owner), untilMs: Number(l.untilMs) || 0 }
  }
  const ttl = Math.max(1000, Number(ttlMs) || 120000)
  const next = { owner, untilMs: now + ttl, at: new Date(now).toISOString(), ttlMs: ttl }
  const file = fileOf(role)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(next) + '\n', 'utf8')
  fs.renameSync(tmp, file)
  return { ok: true, ...next }
}

export function release(role, sessionId) {
  const owner = String(sessionId || '').trim()
  const l = readLease(role)
  if (!l || String(l.owner || '') !== owner) return { ok: false, why: '不是原主' }
  try {
    // 不删文件：租约文件是临时状态，写成空租约即可；避免为了一次释放碰家目录删除闸门。
    const file = fileOf(role)
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify({ owner: '', untilMs: 0, at: new Date().toISOString() }) + '\n', 'utf8')
    fs.renameSync(tmp, file)
    return { ok: true }
  } catch { return { ok: false, why: '释放失败' } }
}
