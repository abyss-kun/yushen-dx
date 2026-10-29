// 认领锁：同一件事，同一时间只许一个分身动手。
//
// 为什么要有（框架 v1.88 §7.10）：2026-10-27 04:38，两个会话同时在改同一个插件——
// 一个改 brief.js 的措辞，一个改员工手册的顺序，**互相把对方的改动改回去了**，
// 测试还是绿的，纯属运气。多个分身不是问题，"没人知道对方在动手"才是问题。
//
// 设计：一个锁一条记录（key / 谁认领的 / 什么时候 / 什么时候过期）。
// · 过期的锁自动作废（防止分身崩了把活永远锁住）；
// · 释放只有认领人自己能做（别人不能替你放开）；
// · 不做强制——它是"留名 + 让开"，不是命令；谁要越过照样能越（那是她的判断）。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { runtimeDir } from './runtime.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const DEFAULT_TTL = 30 * 60 * 1000

function storeFile(role) { return path.join(runtimeDir(role), 'claims.json') }
function readJson(f, fb) { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')) } catch { return fb } }
function writeJson(f, v) {
  fs.mkdirSync(path.dirname(f), { recursive: true })
  const tmp = `${f}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(v, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, f)
}
function keyOf(key) { return crypto.createHash('sha1').update(String(key || '').trim().toLowerCase()).digest('hex').slice(0, 12) }

function live(items, now) {
  return (Array.isArray(items) ? items : []).filter((x) => x && Number(x.until) > now)
}

/**
 * 认领一件事。
 * @returns {{ok:boolean, claimed:boolean, key:string, by:string, until?:number, holder?:string, note?:string}}
 */
export function claim(role, { key = '', by = '', why = '', ttlMs = DEFAULT_TTL, now = Date.now(), force = false } = {}) {
  const id = keyOf(key)
  if (!id) return { ok: false, claimed: false, key: '', by, note: '要认领哪件事？' }
  const me = String(by || '').slice(0, 12) || 'unknown'
  const file = storeFile(role)
  const doc = readJson(file, { version: 1, items: [] })
  const items = live(doc.items, now)
  const held = items.find((x) => x.id === id)
  if (held && held.by !== me && !force) {
    return { ok: true, claimed: false, key: String(key).slice(0, 80), by: me, holder: held.by, until: held.until, note: `另一个你（${held.by}）已经在做这件事了` }
  }
  const next = items.filter((x) => x.id !== id)
  const row = { id, key: String(key).slice(0, 120), by: me, why: String(why).slice(0, 120), at: new Date(now).toISOString(), until: now + Math.max(60 * 1000, Number(ttlMs) || DEFAULT_TTL) }
  next.push(row)
  writeJson(file, { version: 1, updatedAt: new Date(now).toISOString(), items: next })
  return { ok: true, claimed: true, key: row.key, by: me, until: row.until }
}

/** 释放：只有认领人自己能放。 */
export function release(role, { key = '', by = '', now = Date.now() } = {}) {
  const id = keyOf(key)
  const me = String(by || '').slice(0, 12) || 'unknown'
  const file = storeFile(role)
  const doc = readJson(file, { version: 1, items: [] })
  const items = live(doc.items, now)
  const held = items.find((x) => x.id === id)
  if (!held) return { ok: true, released: false, note: '没人认领这件事' }
  if (held.by !== me) return { ok: false, released: false, holder: held.by, note: `是 ${held.by} 认领的，你不能替他放` }
  writeJson(file, { version: 1, updatedAt: new Date(now).toISOString(), items: items.filter((x) => x.id !== id) })
  return { ok: true, released: true, key: held.key }
}

/** 现在有哪些活在别人（或自己）手上。 */
export function listClaims(role, { now = Date.now() } = {}) {
  const doc = readJson(storeFile(role), { version: 1, items: [] })
  const items = live(doc.items, now).map((x) => ({
    key: x.key, by: x.by, why: x.why, until: x.until, minutesLeft: Math.max(0, Math.round((x.until - now) / 60000)),
  }))
  return { ok: true, count: items.length, items }
}
