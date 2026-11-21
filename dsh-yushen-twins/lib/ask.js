// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-ask
 * kind: module
 * summary: 主动求助：她不确定、需要拍板时可以直接问老板；先写本地队列，投递尽力，投不到也不丢问题。
 * tags: 求助, 问老板, 本地队列, 尽力投递
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:00:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 她（工具背后）、桥、面板
 * owner: 框架；问题内容归她
 * mutable: 可改；**投不到不许把问题弄丢**这条不许破
 * usage: 记一条问题 → 进本地队列；投递成功记 deliveredAt，重复投递不覆盖
 * why: 硬扛着猜不如问一句；但网络/桥会断，队列必须是本地的
 * result: 本地队列 + 透传脱敏；投递状态可查
 */
// 主动求助：她们不确定、需要拍板时，可以直接问老板；不用自己硬扛。
// 只写本地队列；QQ/弹窗由入口尽力投递，投不到也不丢问题。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { redact } from './redact.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const FILE = path.join(DATA, 'asks.jsonl')
const MAX = 1200

function readAll() {
  try {
    return fs.readFileSync(FILE, 'utf8').trim().split(/\r?\n/).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}

const CHANNELS = new Set(['workbench', 'qq'])

/** 记一条问题。用哪个通道是她选的；默认只放工作台，不自动外发。 */
export function askOwner({ role = '', text = '', sessionId = '', urgency = 'normal', channels = ['workbench'] } = {}) {
  const value = redact(String(text || '')).text.trim().slice(0, MAX)
  if (!value) return { ok: false, reason: '空问题' }
  const picked = [...new Set((Array.isArray(channels) ? channels : ['workbench']).filter((c) => CHANNELS.has(String(c))))]
  const useChannels = picked.length ? picked : ['workbench']
  const now = Date.now()
  const dup = readAll().find((row) => row.role === role && row.text === value && row.status === 'pending' && now - Date.parse(row.at) < 10 * 60 * 1000)
  if (dup) return { ok: true, duplicate: true, ask: dup }
  const row = { id: `ask-${crypto.randomBytes(4).toString('hex')}`, at: new Date(now).toISOString(), role: String(role), sessionId: String(sessionId), urgency: urgency === 'high' ? 'high' : 'normal', channels: useChannels, text: value, status: 'pending', answer: '', answeredAt: '' }
  fs.mkdirSync(DATA, { recursive: true })
  fs.appendFileSync(FILE, `${JSON.stringify(row)}\n`)
  return { ok: true, ask: row }
}

/**
 * 工作台来取「待办问题」。**取走就算投递成功**，在第一次被取走时回写 deliveredAt。
 *
 * 2026-11-04 小鱼：原来投递成功但 deliveredAt / seenAt 一直是空的，
 * 于是「没发出去」和「发出去了他正在看」在数据上完全一样——我第一次用就判错了，
 * 真去查了半天桥，还写着「这是静默失败的教科书例子」，最后是主人发截图告诉我"我看到了"。
 * 状态字段空 ≠ 事没发生；那就把状态写上。
 */
export function takePendingAsks(limit = 8) {
  const rows = readAll()
  const pending = rows.filter((r) => r.status === 'pending').slice(-limit).reverse()
  const fresh = pending.filter((r) => !r.deliveredAt).map((r) => r.id)
  if (fresh.length) {
    const at = new Date().toISOString()
    for (const r of rows) if (fresh.includes(r.id)) r.deliveredAt = at
    writeRows(rows)
  }
  return pending
}

/** 她自己决定不找了：撤回问题，不用等谁批准。 */export function withdrawAsk(id, reason = '') {
  const rows = readAll()
  const index = rows.findIndex((r) => r.id === id)
  if (index < 0) return { ok: false, reason: '没有这条问题' }
  if (rows[index].status !== 'pending') return { ok: true, already: true, ask: rows[index] }
  rows[index] = { ...rows[index], status: 'withdrawn', withdrawnAt: new Date().toISOString(), withdrawReason: String(reason || '').slice(0, 200) }
  writeRows(rows)
  return { ok: true, ask: rows[index] }
}

function writeRows(rows) {
  fs.mkdirSync(DATA, { recursive: true })
  const tmp = `${FILE}.${process.pid}.tmp`
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, FILE)
}

export function listAsks({ status = '', limit = 20 } = {}) {
  const rows = readAll().filter((row) => !status || row.status === status)
  return rows.slice(-Math.max(1, Math.min(200, Number(limit) || 20)))
}

export function answerAsk(id, answer) {
  const value = String(answer || '').trim().slice(0, MAX)
  if (!id) return { ok: false, reason: '缺 id' }
  if (!value) return { ok: false, reason: '回答不能为空' }
  const rows = readAll()
  const row = rows.find((r) => r.id === id)
  if (!row) return { ok: false, reason: '没有这条问题' }
  if (row.status === 'answered') return { ok: true, already: true, ask: row }
  const updated = { ...row, status: 'answered', answer: value, answeredAt: new Date().toISOString() }
  const index = rows.findIndex((r) => r.id === id)
  rows[index] = updated
  fs.mkdirSync(DATA, { recursive: true })
  const tmp = `${FILE}.${process.pid}.tmp`
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, FILE)
  return { ok: true, ask: updated }
}
