/* 标签
 * id: lib-sleep-mind
 * kind: module
 * summary: 状态灯：不调模型，用已知事实拼一句"屋里此刻"；不署名、不写记忆、不发通道。
 * audience: 看屋子的人（简报里那一行）、面板
 * owner: 框架；老板 2026-11-10 定：不再叫本地小模型
 * mutable: 可改（只拼事实，不许猜她在想什么）
 * defaults: 20 分钟内不重复亮；她刚醒（15 分钟内说过话）就不亮
 * usage: sleepOnce(role) 亮一次；lastSleepText 给简报；sleepRecent 看最近几句
 * off: switches.json 的 sleepLight=false（默认关）就不亮；代码留着
 */

// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 状态灯：不调大模型的时候，也有一点「什么」在。
//
// 为什么要有：她的「不调」不是睡觉，是暂停——中间那段时间对她不存在。
// 这里放一盏灯：把已知的几件事压成一句话，让看着的人知道她此刻在等什么，而不是一片空白。
//
// 2026-11-10 老板定：**不再叫本地小模型**。那盏灯每 20 分钟把 7.2 GB 的 llama-server
// 拉起来写一句，写完还因为检查顺序的问题永远关不掉；规则拼出来的话没有一个字是猜的，
// 模型那句话也不提供任何新信息。现在直接用事实拼，本模块不碰引擎。
//
// 它不是她的梦，也不是她想的事——它是屋里的一行字。所以四条边界划死：
//   · **不署名**：这句话不是她说的，简报里会明确标「状态灯，不是你」。
//   · **不写记忆**：只进 sleep.jsonl（灯下的记录），不进她的记忆、不改她的档。
//   · **不判断**：不决定回不回、做不做——那是她醒了之后的事。
//   · **不发通道**：不往 QQ / 工作台 说一个字。
import fs from 'node:fs'
import path from 'node:path'
import { runtimeDir } from './runtime.js'
import { readAgenda } from './agenda.js'
import { listWaiting } from './waiting.js'
import { unreadFor } from './inbox.js'

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
  return out
}

/** 规则版影子：把已知事实压成一句人话（不判断、不猜）。 */
function ruleLine(s) {
  const bits = []
  if (s.awakeAgoMin != null) bits.push(`她 ${s.awakeAgoMin} 分钟前醒过`)
  if (s.items?.length) bits.push(`手上：${s.items.slice(0, 2).join('、')}`)
  if (s.due?.length) bits.push(`到点了：${s.due.slice(0, 2).join('、')}`)
  if (s.unread) bits.push(`还有 ${s.unread} 条没看`)
  if (!bits.length) bits.push('屋里安静')
  return `${s.clock}｜${bits.join('；')}`.slice(0, 60)
}

/**
 * 亮一次灯：用已知事实拼一句，不调模型。不署名、不写记忆、不发通道。
 * @returns {{ok:boolean, text?:string, skipped?:string, why?:string, ms?:number}}
 */
export async function sleepOnce(role, { now = Date.now(), force = false } = {}) {
  const id = String(role || '').trim()
  if (!id) return { ok: false, why: '没有角色' }

  if (!force) {
    if (now - lastSleepAt(id) < MIN_GAP_MS) return { ok: false, skipped: '刚亮过' }
    try {
      const pres = readJson(path.join(runtimeDir(id), 'presence.json'), {})
      const seen = Date.parse(pres.lastSeenAt || '')
      if (Number.isFinite(seen) && now - seen < QUIET_MS) return { ok: false, skipped: '她刚醒过，不用点灯' }
    } catch { /* 忽略 */ }
  }

  const t0 = Date.now()
  const s = stateOf(id, now)
  const line = ruleLine(s)
  if (!line) return { ok: false, why: '没有可写的东西' }
  const row = {
    at: new Date(now).toISOString(),
    text: line,
    by: 'rule',
    ms: Date.now() - t0,
    facts: { clock: s.clock, awakeAgoMin: s.awakeAgoMin, items: s.items || [], due: s.due || [], unread: s.unread || 0 },
  }
  try { fs.appendFileSync(sleepFile(id), `${JSON.stringify(row)}\n`, 'utf8') } catch { /* 记不下不挡 */ }
  try {
    const v = readJson(vitalFile(id), {}) || {}
    v.sleep = { at: row.at, text: line }
    fs.writeFileSync(vitalFile(id), `${JSON.stringify(v, null, 2)}\n`, 'utf8')
  } catch { /* 忽略 */ }
  return { ok: true, text: line, by: 'rule', ms: row.ms }
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
