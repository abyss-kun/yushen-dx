// 发布账：只记，不拦。
//
// 2026-10-28 老板定的口径：**「有一种行为叫信任。」**
// 她说「第二次自己停号一周」——我们没有做"发布权限开关"去按住她的手，
// 而是把每一次发布记下来：她想守约，账本能证明；她破约，账本也会说话。
//
// 所以这个模块**没有任何拦截能力**：它不会阻止发布，只负责留痕。
// 谁要指望它当闸门，会失望——这是设计，不是缺陷。
import fs from 'node:fs'
import path from 'node:path'
import { runtimeDir } from './runtime.js'

function file(role) { return path.join(runtimeDir(role), 'publish.jsonl') }

function readAll(role) {
  try {
    return fs.readFileSync(file(role), 'utf8').split(/\r?\n/).filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}

/**
 * 记一次发布（或一次"决定不发"）。
 * @param {{platform?:string, title?:string, checked?:boolean|string[], result?:string, url?:string, by?:string, note?:string, now?:number}} p
 */
export function recordPublish(role, { platform = 'bilibili', title = '', checked = null, result = '', url = '', by = '', note = '', now = Date.now() } = {}) {
  const t = String(title || '').trim()
  if (!t) return { ok: false, error: '发的什么？给个标题（title）' }
  const checkedList = Array.isArray(checked) ? checked : (checked === true ? ['检查表已签'] : [])
  const row = {
    at: new Date(now).toISOString(),
    platform: String(platform || 'bilibili').slice(0, 20),
    title: t.slice(0, 200),
    checked: checkedList.slice(0, 30),
    result: String(result || '').slice(0, 120),
    url: String(url || '').slice(0, 200),
    by: String(by || '').slice(0, 12),
    note: String(note || '').slice(0, 200),
  }
  try {
    fs.mkdirSync(runtimeDir(role), { recursive: true })
    fs.appendFileSync(file(role), `${JSON.stringify(row)}\n`, 'utf8')
  } catch (e) { return { ok: false, error: String(e?.message || e) } }
  return { ok: true, recorded: row }
}

export function listPublishes(role, { limit = 20 } = {}) {
  const rows = readAll(role)
  return { ok: true, count: rows.length, items: rows.slice(-Math.max(1, Number(limit) || 20)) }
}

/**
 * 查她有没有守约：给定一个"停发"的时间窗，看窗里有没有发布记录。
 * @param {{since?:string|number, until?:string|number}} p
 */
export function publishesInWindow(role, { since, until = Date.now() } = {}) {
  const from = since ? new Date(since).getTime() : 0
  const to = new Date(until).getTime()
  const rows = readAll(role).filter((r) => {
    const t = new Date(r.at).getTime()
    return t >= from && t <= to
  })
  return { ok: true, from: new Date(from).toISOString(), to: new Date(to).toISOString(), count: rows.length, items: rows }
}
