// 会话退役：超过 N 天没动过、且没在跑的会话，标题前加「[退役]」；不删、不改内容。
// 只打标，随时能搜到；当前会话永远跳过。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { listSessionsRpc, renameSessionRpc } from './dsh-rpc.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const STATE = path.join(DATA, 'retire-state.json')
const DAY = 24 * 3600 * 1000
const MARK = '[退役]'

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) } catch { return { lastAt: 0 } }
}
function writeState(s) {
  fs.mkdirSync(DATA, { recursive: true })
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2), 'utf8')
}

function lastActive(s) {
  const raw = s.lastActiveAt || s.updatedAt || s.mtime || s.lastMessageAt || s.at
  const t = typeof raw === 'number' ? raw : Date.parse(raw || '')
  return Number.isFinite(t) ? t : 0
}

/** 纯函数：挑出该退役的会话（方便测）。 */
export function planRetire(sessions, { now = Date.now(), days = 3, currentId = '' } = {}) {
  const cutoff = now - days * DAY
  return (sessions || []).filter((s) => {
    if (!s?.id) return false
    if (s.running) return false
    if (String(s.id) === String(currentId)) return false
    if (String(s.title || s.name || '').startsWith(MARK)) return false
    const t = lastActive(s)
    return t > 0 && t < cutoff
  })
}

/** 真退役：改名打标；返回改了哪些。 */
export async function retireSessions({ days = 3, currentId = '' } = {}) {
  const list = await listSessionsRpc()
  const plan = planRetire(list, { days, currentId })
  const renamed = []
  for (const s of plan) {
    const title = `${MARK} ${String(s.title || s.name || s.id).slice(0, 40)}`
    try { await renameSessionRpc(s.id, title); renamed.push({ id: s.id, title }) } catch { /* 单条失败跳过 */ }
  }
  if (renamed.length) writeState({ lastAt: Date.now(), days, renamed: renamed.length })
  return { ok: true, days, scanned: list.length, retired: renamed.length, renamed }
}

/** 开机自动跑：一天最多一次，默认 7 天。 */
export async function retireDaily({ days = 7, currentId = '' } = {}) {
  const st = readState()
  if (Date.now() - (Number(st.lastAt) || 0) < DAY) return { ok: true, skipped: true, retired: 0 }
  const r = await retireSessions({ days, currentId })
  writeState({ lastAt: Date.now(), days, renamed: r.retired })
  return r
}
