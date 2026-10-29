// 自由活动：没人派活的时候，她自己决定做点什么。
// 这里只做"该不该叫她"的账，不调用模型；叫醒由入口用她的常驻身体去做。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const STATE = path.join(DATA, 'freetime.json')
// 「定时」不是纪律，是补丁：宿主不能让她凭空启动，她只在被叫的时候才跑一次。
// 所以真正该由她定的，是「什么时候叫她」——她约了时间（yushen_self action=wait），到点就叫；
// 没约，才按下面的兜底间隔叫一次。次数上限只是防失控的成本闸，不是限制她。
// 想动就动：半小时一次（跟检查周期一致），每天封顶 16 次。
// 每次自由活动 = 一个模型回合；上限不是许可，是柴火——烧完等明天。
export const DEFAULTS = Object.freeze({ intervalHours: 0.5, dailyCap: 16, quietMinutes: 5 })

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

export function status(now = Date.now()) {
  const state = read()
  return Object.fromEntries(Object.entries(state.roles || {}).map(([role, row]) => [role, {
    lastAt: row.lastAt || '',
    todayCount: row.day === today(now) ? Number(row.count || 0) : 0,
    remaining: Math.max(0, DEFAULTS.dailyCap - (row.day === today(now) ? Number(row.count || 0) : 0)),
  }]))
}

/**
 * 该不该给她自由时间。
 * - 刚活动过（quietMinutes 内）不叫，别打断她正在做的事；
 * - 间隔没到不叫；今天额度用完不叫。
 */
export function shouldRun(role, { now = Date.now(), lastActiveAt = '', intervalHours = DEFAULTS.intervalHours, dailyCap = DEFAULTS.dailyCap, quietMinutes = DEFAULTS.quietMinutes } = {}) {
  if (!role) return false
  if (lastActiveAt) {
    const t = Date.parse(lastActiveAt)
    if (Number.isFinite(t) && now - t < quietMinutes * 60 * 1000) return false
  }
  const row = read().roles?.[role] || {}
  const last = Date.parse(row.lastAt || '')
  if (Number.isFinite(last) && now - last < intervalHours * 3600 * 1000) return false
  const count = row.day === today(now) ? Number(row.count || 0) : 0
  return count < dailyCap
}

export function markRun(role, { now = Date.now(), note = '' } = {}) {
  const state = read()
  state.roles = state.roles || {}
  const row = state.roles[role] || {}
  const day = today(now)
  state.roles[role] = {
    lastAt: new Date(now).toISOString(),
    day,
    count: (row.day === day ? Number(row.count || 0) : 0) + 1,
    note: String(note || '').slice(0, 200),
  }
  state.updatedAt = new Date(now).toISOString()
  write(state)
  return state.roles[role]
}
