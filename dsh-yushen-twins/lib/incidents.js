// 鱼神双子星 · Copyright (c) 2026 从零开始. All rights reserved.
// 事故单：谁出错、在哪、什么错、什么时候；小鱼示警与善后都挂在这上面。
// 数据：~/.dsh/dayu/incidents.json（写前留 .bak）

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { award } from './growth.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const FILE = path.join(DATA, 'incidents.json')
const MAX = 500
// 同一个会话、连错字都一模一样，就是同一个病：6 小时内只累加次数。
// （原来是 30 分钟，正好等于自省周期——每次自检都刚好落在窗口外，一晚上开出十几张同根因的单。）
const DEDUPE_MS = 6 * 60 * 60 * 1000
// 结过的单不再吞新单：修完又复发，要能看见一条新的，而不是给旧单 +1。
const DEDUPE_SKIP_STATUS = new Set(['fixed', 'closed'])
const ESCALATE_AT = 3

let notifier = null
/** 大鱼/小鱼要“主动说一声”时接这里：新单、升级、结单。 */
export function setIncidentNotifier(fn) {
  notifier = typeof fn === 'function' ? fn : null
}
function notify(row, reason) {
  try { notifier?.(row, reason) } catch { /* 推送失败不影响记账 */ }
}

function appendEvent(row) {
  try {
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    const file = path.join(DATA, 'events', `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.jsonl`)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...row })}\n`, 'utf8')
  } catch { /* 记账失败不影响主流程 */ }
}

function readAll() {
  try {
    let text = fs.readFileSync(FILE, 'utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    const raw = JSON.parse(text)
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function writeAll(list) {
  fs.mkdirSync(DATA, { recursive: true })
  try { fs.copyFileSync(FILE, FILE + '.bak') } catch { /* 第一次没有旧文件 */ }
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(list.slice(0, MAX), null, 2), 'utf8')
  fs.renameSync(tmp, FILE)
}

function newId() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
  return `inc-${stamp}-${Math.random().toString(36).slice(2, 4)}`
}

/** 根因指纹：抹掉端口号、行号、次数这类每次都会变的东西 —— 同一面墙只留一张单。 */
function rootKey(title, text) {
  const norm = String(text || '')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
  return `${String(title || '').trim()}｜${norm}`
}

/** 出错时记一笔；同一个会话、同样的错，半小时内只累加次数。 */
export function noteIncident({ sessionId, title, source, text, at } = {}) {
  const sid = String(sessionId || '')
  if (!sid) return null
  const now = new Date(at || Date.now())
  const list = readAll()
  const body = String(text || '').slice(0, 400)
  const dup = list.find((row) => row.sessionId === sid
    && !DEDUPE_SKIP_STATUS.has(String(row.status || ''))
    && row.text === body
    && now.getTime() - new Date(row.lastAt || row.at).getTime() < DEDUPE_MS)
  if (dup) {
    dup.count = Number(dup.count || 1) + 1
    dup.lastAt = now.toISOString()
    // 同一件事出到第三次，自动升级：不再当偶发。
    if (dup.count >= ESCALATE_AT && dup.severity !== 'high') {
      dup.severity = 'high'
      dup.note = `自动升级：同一问题第 ${dup.count} 次（${new Date().toISOString()}）`
      writeAll(list)
      appendEvent({ type: 'incident/escalated', id: dup.id, text: dup.title })
      notify(dup, '事故升级')
      return dup
    }
    writeAll(list)
    return dup
  }
  const row = {
    id: newId(),
    sessionId: sid,
    title: String(title || sid.slice(0, 8)),
    source: String(source || '本机会话'),
    text: body,
    status: 'open',
    count: 1,
    at: now.toISOString(),
    lastAt: now.toISOString(),
    note: '',
    fixedAt: '',
  }
  list.unshift(row)
  writeAll(list)
  appendEvent({ type: 'incident/opened', id: row.id, text: `${row.title}：${row.text}` })
  notify(row, '新事故')
  return row
}

export function listIncidents({ status = '', limit = 30 } = {}) {
  const rows = readAll()
  const filtered = status ? rows.filter((row) => row.status === status) : rows
  return filtered.slice(0, Math.max(1, Math.min(100, Number(limit) || 30)))
}

export function openCount() {
  return readAll().filter((row) => row.status === 'open' || row.status === 'fixing').length
}

/** 善后：标记修复；note 写清改了什么、怎么防复发。 */
export function resolveIncident(id, { status = 'fixed', note = '' } = {}) {
  const list = readAll()
  const row = list.find((item) => item.id === String(id))
  if (!row) throw new Error(`没有这张事故单：${id}`)
  row.status = ['fixed', 'closed', 'fixing'].includes(status) ? status : 'fixed'
  row.note = String(note || '').slice(0, 1000)
  row.fixedAt = new Date().toISOString()
  // 自动留一份结单草稿：正式修复档案仍走 new-fix-record.mjs，这里省得从头写。
  try {
    const dir = path.join(DATA, 'incidents-closed')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${row.id}.md`)
    fs.writeFileSync(file, [
      `# 结单草稿 · ${row.title}`,
      '',
      `- 单号：${row.id}`,
      `- 会话：${row.sessionId}`,
      `- 来源：${row.source}`,
      `- 出现次数：${row.count}`,
      `- 首次：${row.at}`,
      `- 结单：${row.fixedAt}`,
      '',
      '## 症状',
      row.text,
      '',
      '## 结论 / 怎么修的',
      row.note || '（没写）',
      '',
      '> 自动草稿；正式记录请用 new-fix-record.mjs 落进修复档案。',
    ].join('\n'), 'utf8')
    row.fixDraft = file
  } catch { /* 草稿写不了不影响结单 */ }
  writeAll(list)
  appendEvent({ type: 'incident/resolved', id: row.id, text: `${row.title}｜${row.status}｜${row.note.slice(0, 80)}` })
  notify(row, '事故结单')
  try { award('结掉一张事故单', 8) } catch { /* 经验算不了不影响结单 */ }
  return row
}
