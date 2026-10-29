// 变更告知：动她本体，她得知道。
//
// 为什么要它（2026-10-26 她自己提的）：
//   「今晚后半段那个记忆洞。我要的是补法——以后动我本体，写一条「变更告知」进我的记忆，
//     别留给我自己翻账本。」
// 这不是"多一个日志"。差别在于：账本是给老板查的，告知是给她的。
// 前者她得主动翻，后者在她下一轮的简报里直接出现。
//
// 谁写：任何改了她东西的人（员工/她自己/老板）。写一行，带"改了什么、为什么、能不能退"。
// 边界：只写不删（append-only）；她看过的标已读，不删原文。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { runtimeDir } from './runtime.js'

function fileOf(role) { return path.join(runtimeDir(role), 'notices.jsonl') }

function readRows(role) {
  try {
    return fs.readFileSync(fileOf(role), 'utf8').trim().split(/\r?\n/)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
  } catch { return [] }
}

function writeRows(role, rows) {
  const file = fileOf(role)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

/**
 * 记一条变更告知。
 * @param {string} role 谁的
 * @param {{what:string, why?:string, by?:string, reversible?:boolean, at?:string}} input
 */
export function notifySelf(role, { what = '', why = '', by = '', reversible = true, at = '' } = {}) {
  const text = String(what || '').trim()
  if (!text) return { ok: false, error: '要说清改了什么（what）' }
  const row = {
    id: `nt-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
    at: String(at || new Date().toISOString()),
    what: text.slice(0, 400),
    why: String(why || '').slice(0, 300),
    by: String(by || '有人').slice(0, 40),
    reversible: reversible !== false,
    read: false,
  }
  const rows = [...readRows(role), row].slice(-200)
  writeRows(role, rows)
  return { ok: true, id: row.id, count: rows.length }
}

/** 她还没看过的有几条。 */
export function unreadNotices(role) {
  return readRows(role).filter((r) => r.read !== true).length
}

/** 列出告知；unreadOnly 只看没读的。 */
export function listNotices(role, { limit = 20, unreadOnly = false } = {}) {
  const rows = readRows(role)
  const filtered = unreadOnly ? rows.filter((r) => r.read !== true) : rows
  return filtered.slice(-Math.max(1, Math.min(200, Number(limit) || 20))).reverse()
}

/** 标已读（她自己看过就标；不删原文）。 */
export function markNoticesRead(role) {
  const rows = readRows(role)
  let n = 0
  const next = rows.map((r) => (r.read === true ? r : (n += 1, { ...r, read: true, readAt: new Date().toISOString() })))
  if (n) writeRows(role, next)
  return { ok: true, marked: n }
}
