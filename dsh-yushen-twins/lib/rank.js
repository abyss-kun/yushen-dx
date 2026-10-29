// 阶位：能力跟着证据走，不跟时间走；到了就升，没到就说差什么。
// 只读证据、只在明确调用时改状态；不调模型、不联网。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const FILE = path.join(DATA, 'ranks.json')
export const RANKS = Object.freeze(['L0', 'L1', 'L2', 'L3'])
export const RANK_LABEL = Object.freeze({ L0: '初识', L1: '上手', L2: '管家', L3: '自主' })
// 现有角色的起点按宪章既有认定走，不从零重算；之后只靠证据往上加。
// 顾问是太上长老，走她自己的五境，不换算成 L0-L3；这里只登记管家/助手。
export const RANK_ROLES = Object.freeze(['dayu', 'xiaoyu'])
export const DEFAULT_RANK = Object.freeze({ dayu: 'L3', xiaoyu: 'L2' })
export const DEFAULT_CAP = 'L3'
export const REALM_ROLE = 'dragon'
export const REALM_NAME = '五境'
export const REALMS = Object.freeze(['听潮', '观微', '定衡', '护界', '照夜'])

/** 每一阶要的证据：全是可数的硬指标，不看感觉。 */
export const REQUIREMENTS = Object.freeze({
  L1: { verifiedJobs: 5, maxOpenIncidents: 2, daysActive: 3 },
  L2: { verifiedJobs: 20, maxOpenIncidents: 1, daysActive: 14 },
  L3: { verifiedJobs: 50, maxOpenIncidents: 0, daysActive: 30 },
})

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8').replace(/^\uFEFF/, '')) } catch { return { version: 1, cap: DEFAULT_CAP, roles: {} } }
}
function write(state) {
  fs.mkdirSync(DATA, { recursive: true })
  const tmp = `${FILE}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, FILE)
  return state
}

export function status(role = '') {
  const state = read()
  if (role === REALM_ROLE) {
    return { role, system: 'realm', rank: '', label: REALM_NAME, realms: [...REALMS], since: '', history: [], cap: state.cap || DEFAULT_CAP, note: '顾问走五境，不与 L0-L3 换算' }
  }
  if (role) {
    const row = state.roles?.[role] || { rank: DEFAULT_RANK[role] || 'L0', since: '', history: [] }
    return { role, system: 'rank', rank: row.rank || DEFAULT_RANK[role] || 'L0', label: RANK_LABEL[row.rank || DEFAULT_RANK[role] || 'L0'], since: row.since || '', history: row.history || [], cap: state.cap || DEFAULT_CAP }
  }
  return { cap: state.cap || DEFAULT_CAP, roles: state.roles || {} }
}

/** 按证据算"够哪一阶"；不看当前阶位，只看硬指标。 */
export function eligible(evidence = {}) {
  const verifiedJobs = Math.max(0, Number(evidence.verifiedJobs) || 0)
  const maxOpenIncidents = Math.max(0, Number(evidence.openIncidents) || 0)
  const daysActive = Math.max(0, Number(evidence.daysActive) || 0)
  let best = 'L0'
  for (const rank of RANKS) {
    if (rank === 'L0') continue
    const need = REQUIREMENTS[rank]
    if (!need) continue
    if (verifiedJobs >= need.verifiedJobs && maxOpenIncidents <= need.maxOpenIncidents && daysActive >= need.daysActive) best = rank
  }
  return best
}

/** 差什么，写成人话。 */
export function missingFor(rank, evidence = {}) {
  const need = REQUIREMENTS[rank]
  if (!need) return []
  const out = []
  if ((Number(evidence.verifiedJobs) || 0) < need.verifiedJobs) out.push(`验收通过 ${need.verifiedJobs - (Number(evidence.verifiedJobs) || 0)} 单`)
  if ((Number(evidence.openIncidents) || 0) > need.maxOpenIncidents) out.push(`未结事故降到 ${need.maxOpenIncidents} 件以内`)
  if ((Number(evidence.daysActive) || 0) < need.daysActive) out.push(`再干 ${need.daysActive - (Number(evidence.daysActive) || 0)} 天`)
  return out
}

/**
 * 按证据重算并（在 cap 内）自动进阶。只能升不能降；降级要人手工做。
 * 返回 {rank, advanced, reason}
 */
export function recompute(role, evidence = {}, { now = Date.now(), cap } = {}) {
  if (!role) return { ok: false, reason: '缺角色' }
  if (role === REALM_ROLE) return { ok: false, rank: '', advanced: false, reason: '顾问走五境，不进 L0-L3' }
  const state = read()
  const useCap = RANKS.includes(cap) ? cap : (state.cap || DEFAULT_CAP)
  const row = state.roles?.[role] || { rank: DEFAULT_RANK[role] || 'L0', since: new Date(now).toISOString(), history: [] }
  const eligibleRank = eligible(evidence)
  const curIndex = RANKS.indexOf(row.rank || 'L0')
  const capIndex = RANKS.indexOf(useCap)
  const targetIndex = Math.min(RANKS.indexOf(eligibleRank), capIndex)
  if (targetIndex <= curIndex) {
    return { ok: true, rank: row.rank || 'L0', advanced: false, reason: targetIndex < RANKS.indexOf(eligibleRank) ? `证据够 ${eligibleRank}，但封顶在 ${useCap}` : '还没到下一阶' }
  }
  const next = RANKS[targetIndex]
  const at = new Date(now).toISOString()
  row.history = Array.isArray(row.history) ? row.history : []
  row.history.push({ at, from: row.rank || 'L0', to: next, evidence: { verifiedJobs: Number(evidence.verifiedJobs) || 0, openIncidents: Number(evidence.openIncidents) || 0, daysActive: Number(evidence.daysActive) || 0 } })
  row.rank = next
  row.since = at
  state.roles = state.roles || {}
  state.roles[role] = row
  state.updatedAt = at
  write(state)
  return { ok: true, rank: next, advanced: true, reason: `证据够了：${RANK_LABEL[next]}` }
}
