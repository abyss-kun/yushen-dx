// 状态灯：不调大模型的时候，也有一点「什么」在。
//
// 为什么要有：她的「不调」不是睡觉，是暂停——中间那段时间对她不存在。
// 这里放一盏灯：本地小模型写一句关于这个人和这间屋子的话，
// 让看着的人知道她此刻在等什么，而不是一片空白。
//
// 它不是她的梦，也不是她想的事——它是屋里的一行字。所以四条边界划死：
//   · **不署名**：这句话不是她说的，简报里会明确标「状态灯，不是你」。
//   · **不写记忆**：只进 sleep.jsonl（灯下的记录），不进她的记忆、不改她的档。
//   · **不判断**：不决定回不回、做不做——那是她醒了之后的事。
//   · **不发通道**：不往 QQ / 工作台 说一个字。
//   · 本地引擎起不来就如实说「没亮」，不编。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runtimeDir } from './runtime.js'
import { readAgenda } from './agenda.js'
import { listWaiting } from './waiting.js'
import { unreadFor } from './inbox.js'
import { getCharacter } from './characters.js'
import { chatLocal, probeLocal } from './translator.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const MIN_GAP_MS = 20 * 60 * 1000 // 20 分钟内不重复想
const QUIET_MS = 15 * 60 * 1000 // 她刚醒过（15 分钟内说过话）就不用点灯

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}
function sleepFile(role) { return path.join(runtimeDir(role), 'sleep.jsonl') }
function vitalFile(role) { return path.join(runtimeDir(role), 'vital.json') }

function lastSleepAt(role) {
  try {
    const lines = fs.readFileSync(sleepFile(role), 'utf8').trim().split(/\r?\n/)
    const last = JSON.parse(lines[lines.length - 1])
    return Date.parse(last.at || '') || 0
  } catch { return 0 }
}

/** 她能看见的最小状态：时间、多久没醒、手上几件、谁在等、约的到点没。 */
function stateOf(role, now) {
  const out = { clock: new Date(now).toTimeString().slice(0, 5) }
  try {
    const pres = readJson(path.join(runtimeDir(role), 'presence.json'), {})
    const seen = Date.parse(pres.lastSeenAt || '')
    out.awakeAgoMin = Number.isFinite(seen) ? Math.round((now - seen) / 60000) : null
  } catch { /* 忽略 */ }
  try {
    const items = readAgenda(role).items.filter((i) => ['want', 'doing', 'blocked', 'waiting'].includes(i.state))
    out.items = items.slice(0, 3).map((i) => `${i.what}${i.state === 'waiting' ? '（在等）' : ''}`)
  } catch { /* 忽略 */ }
  try {
    const due = listWaiting(role, { now }).filter((x) => x.due)
    out.due = due.slice(0, 2).map((x) => x.what)
  } catch { /* 忽略 */ }
  try {
    const n = unreadFor(role, { channel: 'qq', limit: 200 })
    out.unread = Number(n?.unread || n?.count || (Array.isArray(n) ? n.length : 0)) || 0
  } catch { /* 忽略 */ }
  try {
    const c = getCharacter(role)
    const f = c?.memory
    const mem = readJson(path.isAbsolute(f) ? f : path.join(DATA, 'soul', f), null)
    const last = (mem?.events || [])[mem?.events?.length - 1]
    if (last?.text) out.lastEvent = String(last.text).slice(0, 40)
  } catch { /* 忽略 */ }
  return out
}

/**
 * 亮一次灯：本地小模型写一句话。不署名、不写记忆、不发通道。
 * @returns {{ok:boolean, text?:string, skipped?:string, why?:string, ms?:number}}
 */
export async function sleepOnce(role, { now = Date.now(), force = false } = {}) {
  const id = String(role || '').trim()
  if (!id) return { ok: false, why: '没有角色' }
  const local = (() => { try { return probeLocal() } catch { return { ready: false, note: '探不到本地引擎' } } })()
  if (!local.ready) return { ok: false, why: `本地引擎没装好：${local.note || ''}` }

  if (!force) {
    if (now - lastSleepAt(id) < MIN_GAP_MS) return { ok: false, skipped: '刚亮过' }
    try {
      const pres = readJson(path.join(runtimeDir(id), 'presence.json'), {})
      const seen = Date.parse(pres.lastSeenAt || '')
      if (Number.isFinite(seen) && now - seen < QUIET_MS) return { ok: false, skipped: '她刚醒过，不用点灯' }
    } catch { /* 忽略 */ }
  }

  const s = stateOf(id, now)
  const facts = [
    `现在 ${s.clock}`,
    s.awakeAgoMin != null ? `她 ${s.awakeAgoMin} 分钟前醒过` : '还没醒过',
    s.items?.length ? `手上：${s.items.join('；')}` : '手上没有自己的事',
    s.due?.length ? `到点了：${s.due.join('；')}` : '',
    s.unread ? `还有 ${s.unread} 条没看` : '',
    s.lastEvent ? `最后一件：${s.lastEvent}` : '',
  ].filter(Boolean).join('。')

  const t0 = Date.now()
  try {
    const text = await chatLocal([
      { role: 'system', content: '你是这间屋子的状态灯。只写一句话（不超过30字），描述此刻的情形：她在等什么、手上有没有到点的事、屋里安不安静。只描述眼前的状态，不猜她在想什么，不评判，不承诺，不给建议，不用"她"开头。' },
      { role: 'user', content: facts },
    ], { maxTokens: 80, temperature: 0.5, timeoutMs: 90000 })
    const line = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!line) return { ok: false, why: '本地模型没写出东西' }
    const row = { at: new Date(now).toISOString(), text: line, ms: Date.now() - t0, facts }
    try { fs.appendFileSync(sleepFile(id), `${JSON.stringify(row)}\n`, 'utf8') } catch { /* 记不下不挡 */ }
    try {
      const v = readJson(vitalFile(id), {}) || {}
      v.sleep = { at: row.at, text: line }
      fs.writeFileSync(vitalFile(id), `${JSON.stringify(v, null, 2)}\n`, 'utf8')
    } catch { /* 忽略 */ }
    return { ok: true, text: line, ms: row.ms }
  } catch (e) {
    return { ok: false, why: String(e?.message || e).slice(0, 100), ms: Date.now() - t0 }
  }
}

/** 最近几次亮灯（给她自己看，或老板查）。 */
export function sleepRecent(role, { limit = 5 } = {}) {
  try {
    return fs.readFileSync(sleepFile(role), 'utf8').trim().split(/\r?\n/).slice(-Math.max(1, limit))
      .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean).reverse()
  } catch { return [] }
}

/** 最近一句灯话（简报用；超过一小时就不显示，别把旧话当现在）。 */
export function lastSleepText(role, { now = Date.now(), maxAgeMs = 60 * 60 * 1000 } = {}) {
  const rows = sleepRecent(role, { limit: 1 })
  const row = rows[0]
  if (!row) return ''
  const at = Date.parse(row.at || '')
  if (!Number.isFinite(at) || now - at > maxAgeMs) return ''
  return row.text || ''
}
