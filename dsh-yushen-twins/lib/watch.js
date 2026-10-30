// 鱼神双子星 · Copyright (c) 2026 从零开始. All rights reserved.
// 台账：按天落盘，从装上那天起一直留着；想看多久以前的都查得到。
// 目录：~/.dsh/dayu/events/YYYY-MM-DD.jsonl

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const DIR = path.join(DATA, 'events')

const live = new Map()
const TEXT_CAP = 300

function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function appendLine(line) {
  fs.mkdirSync(DIR, { recursive: true })
  fs.appendFileSync(path.join(DIR, `${dayKey()}.jsonl`), JSON.stringify(line) + '\n')
}

/** 收到宿主会话事件时调用；text 是这一条的内容（可选）。 */
export function recordEvent(session, event, text = '') {
  try {
    const id = String(session?.header?.id ?? session?.id ?? '')
    if (!id) return
    const title = String(session?.header?.title ?? session?.meta?.title ?? session?.title ?? '')
    const cwd = String(session?.meta?.cwd ?? session?.header?.cwd ?? '')
    const type = String(event?.type ?? 'unknown')
    const at = new Date().toISOString()
    const row = live.get(id) || { id, title, cwd, firstAt: at, events: 0 }
    if (title) row.title = title
    if (cwd) row.cwd = cwd
    // 来源：谁开的。宿主给了父会话就记；没给就后面按 “started subagent <id>” 反推。
    const parent = String(
      session?.meta?.parentSessionId
      ?? session?.header?.parentSessionId
      ?? session?.meta?.parent?.sessionId
      ?? session?.meta?.parent
      ?? '',
    )
    if (parent) row.parentId = parent
    row.lastAt = at
    row.lastType = type
    row.events += 1
    if (text) row.lastText = String(text).slice(0, TEXT_CAP)
    live.set(id, row)
    if (live.size > 300) {
      const oldest = [...live.values()].sort((a, b) => String(a.lastAt).localeCompare(String(b.lastAt)))[0]
      if (oldest) live.delete(oldest.id)
    }
    const line = { at, id, title: row.title, cwd: row.cwd, type }
    if (text) line.text = String(text).slice(0, TEXT_CAP)
    // 出错/重试类事件把原始 data 也记下来：不然只能看到“重试了”，看不到“为什么”。
    if (/error|retry|fail/i.test(type) && event?.data) {
      try { line.detail = JSON.stringify(event.data).slice(0, 400) } catch { /* 忽略 */ }
    }
    // 工具调用必须记下「是哪个工具」。
    // 2026-10-27 查出来：账本 7851 条 tool/call，字段只有 at/id/title/cwd/type——
    // 没有工具名。于是「她用了哪些工具」「工具该不该给」这些问题只能靠猜。
    // 这不是新建账本，是给已有的账本补一列。
    if (/^tool\//i.test(type)) {
      const d = event?.data && typeof event.data === 'object' ? event.data : {}
      const toolName = d.name || d.tool || d.toolName || event?.name || d?.call?.name || ''
      if (toolName) line.name = String(toolName).slice(0, 80)
      const callId = d.callId || d.id || ''
      if (callId) line.callId = String(callId).slice(0, 80)
      // 宿主给什么形状不知道：摘一层留着，将来再解析，不猜字段
      try { if (d && Object.keys(d).length) line.detail = JSON.stringify(d).slice(0, 400) } catch { /* 忽略 */ }
    }
    appendLine(line)
  } catch { /* 观察不能影响主流程 */ }
}

function statusOf(row) {
  const type = String(row.lastType || '')
  if (/error|fail/i.test(type)) return '出问题'
  if (/tool/i.test(type)) return '用工具'
  if (/assistant/i.test(type)) return '回话'
  if (/user/i.test(type)) return '接话'
  return type || '—'
}

/** 来源：靠 id / 工作区认，认不出就写“本机会话”。 */
export function sourceOf(row) {
  const cwd = String(row.cwd || '')
  const id = String(row.id || '')
  if (id.startsWith('yushen-dayu-')) return '鱼神·总台'
  if (id.startsWith('dayu-job-')) return '派活会话'
  if (/qq-bridge/i.test(cwd)) return 'QQ 桥接'
  if (/bili-duty/i.test(cwd)) return '刷B站'
  if (/dsh-dafeiyu/i.test(cwd)) return '桌宠'
  return '本机会话'
}

function reasonOf(row, job) {
  if (job) return `派活：${String(job.brief || '').slice(0, 60)}`
  const source = sourceOf(row)
  if (source === '鱼神·总台') return '你在总台说了话'
  if (source === 'QQ 桥接') return '群里有人说话'
  if (source === '刷B站') return '定时/手动跑一轮'
  if (source === '派活会话') return '被派了活'
  return '本机会话在跑'
}

function dispatchMap() {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(DATA, 'dispatch.json'), 'utf8'))
    const map = new Map()
    for (const job of Array.isArray(list) ? list : []) {
      if (job?.sessionId) map.set(String(job.sessionId), job)
    }
    return map
  } catch {
    return new Map()
  }
}

/** 在跑/刚跑过的会话：谁、何时、在哪、在干什么、为什么、谁开的、结果。 */
export function liveSessions(limit = 20) {
  const jobs = dispatchMap()
  const rows = [...live.values()]
    .sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)))
    .slice(0, Math.max(1, Math.min(100, Number(limit) || 20)))
  // 父会话没显式给 parent 时，用它自己那句 “started subagent <uuid>” 反推。
  const mentioned = new Map()
  for (const row of live.values()) {
    const m = /subagent\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(String(row.lastText || ''))
    if (m) mentioned.set(m[1].toLowerCase(), row.id)
  }
  return rows.map((row) => {
    const job = jobs.get(row.id)
    const parentId = String(row.parentId || mentioned.get(String(row.id).toLowerCase()) || '')
    const parent = parentId ? live.get(parentId) : null
    return {
      id: row.id,
      title: row.title || row.id.slice(0, 8),
      source: sourceOf(row),
      cwd: row.cwd || '',
      status: statusOf(row),
      lastType: row.lastType || '',
      lastText: row.lastText || '',
      lastAt: row.lastAt,
      firstAt: row.firstAt,
      events: row.events,
      reason: reasonOf(row, job),
      jobId: job?.id || '',
      jobBrief: job?.brief || '',
      employee: job?.employee || '',
      parentId,
      parentTitle: parent ? String(parent.title || parent.id.slice(0, 8)) : '',
    }
  })
}

function daysBack(n) {
  const out = []
  for (let i = 0; i < n; i += 1) {
    const d = new Date(Date.now() - i * 86400000)
    out.push(dayKey(d))
  }
  return out
}

/** 查台账：默认最近 2 天；可按会话、类型过滤。 */
export function query({ id = '', type = '', days = 2, limit = 100 } = {}) {
  const out = []
  for (const day of daysBack(Math.max(1, Math.min(30, Number(days) || 2)))) {
    const file = path.join(DIR, `${day}.jsonl`)
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch { continue }
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue
      try {
        const row = JSON.parse(line)
        if (id && String(row.id) !== String(id)) continue
        if (type && !String(row.type || '').includes(type)) continue
        out.push(row)
      } catch { /* 半截行跳过 */ }
    }
  }
  return out.slice(-Math.max(1, Math.min(500, Number(limit) || 100)))
}

/** 某条会话的时间线。 */
export function trace(sessionId, limit = 40) {
  return query({ id: sessionId, days: 7, limit })
}
