// 改｜2026-11-24 23:50｜大鱼·工作台｜授权：主人（2026-11-24：还有什么没做的一起）｜lib/waiting.js:1｜本轮整理提交：该文件在本轮之前已有改动，补留痕｜为什么：改动要能查到谁/何时/怎么验｜验证：回归 325/0（整体）｜可改：可改
/* 标签
 * id: lib-waiting
 * kind: module
 * summary: 她会等一件事（等你回话、等一个结果）；到点只告诉她，不催不问。
 * audience: 她本人（约时间）、自由时间叫醒、醒来那段
 * owner: 她自己（等什么、等到什么时候归她）
 * mutable: 可改（只记不催；到点提醒的口径别改成催办）
 * defaults: 不写 until 就是"等他自己回"，不会到点响
 * usage: addWaiting({what,until,criteria}) 记一件；listWaiting 列出（due 标到点）；finishWaiting 结掉
 * off: 不约就没有；waiting.json 留着不会响
 */

// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 等待：她会等一件事（等你回话、等一个结果），到点自己知道。
//
// 不是闹钟，也不是催你：到期了只告诉她"你等的那个到点了"，问不问由她。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { runtimeDir, ensureRuntime } from './runtime.js'

function file(role) { return path.join(runtimeDir(role), 'waiting.json') }
function read(role) { try { return JSON.parse(fs.readFileSync(file(role), 'utf8')) } catch { return { items: [] } } }
function write(role, doc) {
  fs.mkdirSync(path.dirname(file(role)), { recursive: true })
  fs.writeFileSync(file(role), `${JSON.stringify(doc, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return doc
}

/**
 * 记一件在等的事。until 可以是 ISO 或毫秒数；不写就"等他自己回"。
 * criteria：做完什么算完成（2026-11-04 加）。没有它，做完不知道结，同一件事会被叫三遍。
 */
export function addWaiting(role, { what = '', until = 0, who = '', criteria = '', sessionId = '', now = Date.now() } = {}) {
  const w = String(what || '').trim()
  if (!w) throw new Error('在等什么？写一句')
  ensureRuntime(role)
  const doc = read(role)
  // 同一件事还在等，就别再约一遍——重复记只会让她被叫三遍。
  // 返回里带 duplicate=true，调用方据此提醒"先 done-wait 再约"。
  const dup = (doc.items || []).find((x) => !x.done && String(x.what || '').trim() === w)
  if (dup) return { ...dup, duplicate: true }
  const at = typeof until === 'number' ? until : Date.parse(String(until || '')) || 0
  const row = {
    id: `w-${String(now)}-${crypto.randomBytes(2).toString('hex')}`,
    at: new Date(now).toISOString(),
    what: w.slice(0, 160),
    until: at,
    who: String(who || '').slice(0, 60),
    criteria: String(criteria || '').slice(0, 300),
    // 哪条分身会话约的：到点优先送回去；会话归档了才交给别的分身。
    sessionId: String(sessionId || '').slice(0, 80),
    done: false,
  }
  doc.items = [...(doc.items || []), row].slice(-100)
  write(role, doc)
  return row
}

export function listWaiting(role, { includeDone = false, now = Date.now() } = {}) {
  const items = (read(role).items || []).filter((x) => includeDone || !x.done)
  return items.map((x) => ({ ...x, due: Boolean(x.until) && x.until <= now, overdueHours: x.until ? Math.round((now - x.until) / 3600000) : null }))
}

export function finishWaiting(role, id) {
  const doc = read(role)
  const row = (doc.items || []).find((x) => x.id === String(id))
  if (!row) throw new Error('没找到这件在等的事')
  row.done = true
  row.doneAt = new Date().toISOString()
  write(role, doc)
  return row
}

/** 注入：只报事实（在等什么、到点没有、判据是什么），不催。 */
export function waitingLine(role, { now = Date.now() } = {}) {
  const items = listWaiting(role, { now })
  if (!items.length) return ''
  const rows = items.slice(-4).map((x) => {
    const c = x.criteria ? `（判据：${x.criteria}）` : ''
    if (!x.until) return `- 在等：${x.what}${x.who ? `（等 ${x.who}）` : ''}${c}`
    if (x.due) return `- 到点了：${x.what}${x.overdueHours > 0 ? `（已经过了 ${x.overdueHours} 小时）` : ''}${c}——做到了就 yushen_self action=done-wait id=${x.id} 结掉；没做到就接着等`
    return `- 还在等：${x.what}（${new Date(x.until).toLocaleString('zh-CN')}）${c}`
  })
  return `## 你在等的事\n${rows.join('\n')}\n到点了问不问、催不催，你自己定；判据是给你自己看的，不是给别人交差的。`
}
