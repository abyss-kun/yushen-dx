/* 标签
 * id: lib-manual-done
 * kind: module
 * summary: 手动把一件事标完成后，留一条“这件事别再炼”的记号；refine 按会话+标题近似跳过。
 * tags: 手动完成, 去重, 投影, 提炼, 跳过
 * created: 2026-11-14 23:35:00
 * changed: 2026-11-14 23:27:29
 * author: 大鱼·本班
 * authority: 老板（2026-11-14：同一件事手动做了，本地没必要再从投影往上提炼）
 * audience: 议程完成入口、refine
 * owner: 框架；只追加，不删队列
 * mutable: 可改；匹配必须保守，宁可漏跳不误杀
 * usage: markManualDone(role,{what,sessionId,now}) / isManualDone(role,row)
 * why: 手动 done 只改议程，投影队列仍会把同一件事再炼一遍
 * result: 手动完成后，同会话里标题相同/高度相似的队列行被跳过
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runtimeDir } from './runtime.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const WINDOW_MS = 6 * 3600 * 1000

function file(role) { return path.join(runtimeDir(role), 'manual-done.jsonl') }
function oneLine(s, n = 120) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n) }
function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/[，。！？、；：,.!?;:"'“”‘’（）()【】\[\]\s]/g, '')
    .slice(0, 100)
}
function similar(a, b) {
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return false
  if (x === y) return true
  if (x.length >= 3 && y.includes(x)) return true
  if (y.length >= 3 && x.includes(y)) return true
  return false
}

export function markManualDone(role, { what = '', sessionId = '', now = Date.now() } = {}) {
  const id = String(role || '').trim()
  const text = oneLine(what)
  if (!id || !text) return null
  const row = {
    at: new Date(now).toISOString(),
    role: id,
    what: text,
    sessionId: String(sessionId || '').slice(0, 80),
  }
  try {
    fs.mkdirSync(path.dirname(file(id)), { recursive: true })
    fs.appendFileSync(file(id), `${JSON.stringify(row)}\n`, { encoding: 'utf8', mode: 0o600 })
    return row
  } catch { return null }
}

export function readManualDone(role, { limit = 500 } = {}) {
  try {
    return fs.readFileSync(file(role), 'utf8').split(/\r?\n/).filter(Boolean)
      .slice(-Math.max(1, Number(limit) || 500))
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
  } catch { return [] }
}

/** 队列行是否已被手动完成覆盖；只跳过同会话 + 标题相同/包含的长标题，保守。 */
export function isManualDone(role, row = {}, { now = Date.now(), windowMs = WINDOW_MS } = {}) {
  const id = String(role || '').trim()
  if (!id || !row) return false
  const cell = norm(row.head || row.text || '')
  if (!cell) return false
  const sid = String(row.sessionId || String(row.turnId || '').split('#')[0] || '')
  const at = Date.parse(row.at || '') || 0
  for (const m of readManualDone(id)) {
    const mt = Date.parse(m.at || '') || 0
    if (mt && now - mt > windowMs) continue
    if (m.sessionId && sid && String(m.sessionId) !== sid) continue
    if (at && mt && Math.abs(at - mt) > windowMs) continue
    if (similar(m.what, cell)) return true
  }
  return false
}
