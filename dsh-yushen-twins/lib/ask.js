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

/** 她自己决定不找了：撤回问题，不用等谁批准。 */
export function withdrawAsk(id, reason = '') {
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
