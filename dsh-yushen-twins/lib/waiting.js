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

/** 记一件在等的事。until 可以是 ISO 或毫秒数；不写就"等他自己回"。 */
export function addWaiting(role, { what = '', until = 0, who = '', now = Date.now() } = {}) {
  const w = String(what || '').trim()
  if (!w) throw new Error('在等什么？写一句')
  ensureRuntime(role)
  const doc = read(role)
  const at = typeof until === 'number' ? until : Date.parse(String(until || '')) || 0
  const row = { id: `w-${String(now)}-${crypto.randomBytes(2).toString('hex')}`, at: new Date(now).toISOString(), what: w.slice(0, 160), until: at, who: String(who || '').slice(0, 60), done: false }
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

/** 注入：只报事实（在等什么、到点没有），不催。 */
export function waitingLine(role, { now = Date.now() } = {}) {
  const items = listWaiting(role, { now })
  if (!items.length) return ''
  const rows = items.slice(-4).map((x) => {
    if (!x.until) return `- 在等：${x.what}${x.who ? `（等 ${x.who}）` : ''}`
    if (x.due) return `- 到点了：${x.what}${x.overdueHours > 0 ? `（已经过了 ${x.overdueHours} 小时）` : ''}`
    return `- 还在等：${x.what}（${new Date(x.until).toLocaleString('zh-CN')}）`
  })
  return `## 你在等的事\n${rows.join('\n')}\n到点了问不问、催不催，你自己定。`
}
