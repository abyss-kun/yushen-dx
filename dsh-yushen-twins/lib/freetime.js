/* 标签
 * id: lib-freetime
 * kind: module
 * summary: 自由活动的额度账：该不该叫她、这趟是谁叫的；不调模型，只记账。
 * audience: 她（自由时间）、桥/入口（叫醒前问一句）、面板
 * owner: 框架；间隔与上限老板点头才能改
 * mutable: 可改（这里只做账，叫醒在入口）
 * defaults: 兜底 1 小时一次、一天 24 次；峰时（工作日 9-12/14-18）封顶 2 次；她自己约的不占这两条
 * usage: shouldRun(role,{...}) 判该不该叫；markRun 记一次；status 给面板
 * off: 开关 freeTime=false 就整条停；她自己 wait 约的时间也不受影响
 */

// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 自由活动：没人派活的时候，她自己决定做点什么。
// 这里只做"该不该叫她"的账，不调用模型；叫醒由入口用她的常驻身体去做。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { isPeak } from './peak.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const STATE = path.join(DATA, 'freetime.json')
// 「定时」不是纪律，是补丁：宿主不能让她凭空启动，她只在被叫的时候才跑一次。
// 所以真正该由她定的，是「什么时候叫她」——她约了时间（yushen_self action=wait），到点就叫；
// 没约，才按下面的兜底间隔叫一次。次数上限只是防失控的成本闸，不是限制她。
// 2026-11-03 老板定（原来半小时一次、每天 16 次，太勤）：兜底至少隔 1 小时；
// 峰时（工作日 9-12、14-18）兜底一天封顶 2 次——峰时单价翻倍，花不划算；
// 谷时放宽到底：每小时最多一次，不再按次数封顶（24 只是「1 小时间隔」的自然上限）；
// 真正管钱的不是次数，是她自己那份额度（本期多少、还剩多少，简报里每次都写着）。
// 她自己用 wait 约的时间不受上面任何一条限制，也不占峰时那 2 次。
export const DEFAULTS = Object.freeze({ intervalHours: 1, dailyCap: 24, peakDailyCap: 2, quietMinutes: 5, wakeDailyCap: 12 })

function today(now) {
  const d = new Date(now)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function read() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8').replace(/^\uFEFF/, '')) } catch { return { version: 1, roles: {} } }
}
function write(state) {
  fs.mkdirSync(DATA, { recursive: true })
  const tmp = `${STATE}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, STATE)
  return state
}

/** 现在是不是峰时（工作日 9-12、14-18）；峰谷口径只在 lib/peak.js 一处。 */
function peakAt(now) {
  try { return isPeak(new Date(now)) } catch { return false }
}

export function status(now = Date.now()) {
  const state = read()
  return Object.fromEntries(Object.entries(state.roles || {}).map(([role, row]) => {
    const sameDay = row.day === today(now)
    const count = sameDay ? Number(row.count || 0) : 0
    const peakCount = sameDay ? Number(row.peakCount || 0) : 0
    return [role, {
      lastAt: row.lastAt || '',
      todayCount: count,
      remaining: Math.max(0, DEFAULTS.dailyCap - count),
      peakTodayCount: peakCount,
      peakRemaining: Math.max(0, DEFAULTS.peakDailyCap - peakCount),
      peakNow: peakAt(now),
    }]
  }))
}

/**
 * 该不该给她自由时间（兜底）。
 * - 刚活动过（quietMinutes 内）不叫，别打断她正在做的事；
 * - 间隔没到不叫（默认 1 小时，峰谷一样，所以一天最多也就是 24 次）；
 * - dailyCap 是防失控的兜底闸（默认 24＝每小时一次的自然上限），不是额度；
 * - 峰时另有一道封顶（默认 2 次/天）：峰时单价翻倍，花不划算，兜底只保证「今天不是没被叫过」。
 *   谷时不看这道闸，放宽到上面那条自然上限；真正的钱上限是她自己那份额度（简报里写着）。
 */
export function shouldRun(role, { now = Date.now(), lastActiveAt = '', intervalHours = DEFAULTS.intervalHours, dailyCap = DEFAULTS.dailyCap, peakDailyCap = DEFAULTS.peakDailyCap, quietMinutes = DEFAULTS.quietMinutes, wakeDailyCap = 0 } = {}) {
  if (!role) return false
  if (lastActiveAt) {
    const t = Date.parse(lastActiveAt)
    if (Number.isFinite(t) && now - t < quietMinutes * 60 * 1000) return false
  }
  const row = read().roles?.[role] || {}
  const last = Date.parse(row.lastAt || '')
  // 2026-10-31 老板纠：别用固定偏移去「错开」——错开解决不了问题。
  // 真正要补的是**分得清这一趟是谁叫的**：她约的（wait 到点）还是兜底定时器叫的。
  // 那句区分在提示里写（dayu/index.js 的 freeTimePrompt），这里只按原间隔记账。
  if (Number.isFinite(last) && now - last < intervalHours * 3600 * 1000) return false
  const sameDay = row.day === today(now)
  const count = sameDay ? Number(row.count || 0) : 0
  if (count >= dailyCap) return false
  // 每日叫醒上限（只挡兜底；她约的/到期/谷时/保底在入口单独走，不受这条）。
  if (Number(wakeDailyCap) > 0 && count >= Number(wakeDailyCap)) return false
  if (peakAt(now)) {
    const peakCount = sameDay ? Number(row.peakCount || 0) : 0
    if (peakCount >= peakDailyCap) return false
  }
  return true
}

/** 谷时段：12–14、18–09（本地时间）。 */
export function isValley(now = Date.now()) {
  const h = new Date(now).getHours()
  return (h >= 12 && h < 14) || h >= 18 || h < 9
}

/** 谷时自由：谷时段且今天还没给过这一次；一天只一次，和兜底/保底不互相顶。 */
export function valleyDue(role, { now = Date.now() } = {}) {
  if (!role || !isValley(now)) return false
  const row = read().roles?.[role] || {}
  return row.valleyDay !== today(now)
}

/** 记“今天的谷时自由给过了”；不占普通兜底次数，但会和它一起写 valleyDay。 */
export function markValley(role, { now = Date.now() } = {}) {
  const state = read()
  state.roles = state.roles || {}
  const row = state.roles[role] || {}
  const day = today(now)
  state.roles[role] = { ...row, day, valleyDay: day, updatedAt: new Date(now).toISOString() }
  state.updatedAt = new Date(now).toISOString()
  write(state)
  return state.roles[role]
}

/**
 * 保底闹钟：21 点后，今天一次都没被叫过（freetime 0 次、wake-mark 也不在今天）→ 叫一次。
 * 只做判断，不写账；叫醒后由入口 markRun(note='保底')。
 */
export function backupDue(role, { now = Date.now(), lastWakeAt = '', afterHour = 21 } = {}) {
  if (!role) return false
  if (new Date(now).getHours() < afterHour) return false
  const row = status(now)[role]
  if (!row || Number(row.todayCount) > 0) return false
  const mark = Date.parse(String(lastWakeAt || ''))
  if (Number.isFinite(mark) && today(mark) === today(now)) return false
  return true
}

/**
 * 记一次自由活动。
 * fallback=false 表示这趟是她自己约的时间（wait 到点）——那不算兜底名额，峰时封顶不吃它，
 * 但当天总次数照记（总上限管的是成本，不区分谁叫的）。
 */
export function markRun(role, { now = Date.now(), note = '', fallback = true } = {}) {
  const state = read()
  state.roles = state.roles || {}
  const row = state.roles[role] || {}
  const day = today(now)
  const sameDay = row.day === day
  const elapsedPeak = fallback && peakAt(now)
  state.roles[role] = {
    lastAt: new Date(now).toISOString(),
    day,
    count: (sameDay ? Number(row.count || 0) : 0) + 1,
    peakCount: (sameDay ? Number(row.peakCount || 0) : 0) + (elapsedPeak ? 1 : 0),
    valleyDay: String(row.valleyDay || ''),
    note: String(note || '').slice(0, 200),
  }
  state.updatedAt = new Date(now).toISOString()
  write(state)
  return state.roles[role]
}
