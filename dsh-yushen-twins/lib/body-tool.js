// 改｜2026-11-24 23:45｜大鱼·工作台｜授权：主人（2026-11-24：继续——记忆插件/常驻/独立包收口）｜lib/body-tool.js:1｜本轮改动的一部分（自我记忆8类、常驻开关、独立包单多角色、内部群叫醒、连续性验收）｜为什么：记忆插件要能单独出厂、常驻按情况开关｜验证：回归 325/0；独立包/连续性测试通过｜可改：可改
/* 标签
 * id: lib-body-tool
 * kind: module
 * summary: 常驻/分身工具：看谁有身体、把当前会话转成某角色常驻、给常驻主体写一条汇报；只读写现有账本。
 * tags: 常驻, 分身, 会话凭据, 汇报
 * created: 2026-11-24 20:50:00
 * author: 大鱼·子会话（实现代理）
 * authority: 父代理任务书（2026-11-24：常驻/分身统一入口，解决换会话后找不到人）
 * audience: 她（工作台/QQ/分身）、维护者
 * owner: 框架；「谁算常驻」只认 residence/名册，不在这里另立一套
 * mutable: 可改；**不新造账本**，只读写 residence.js / bodies.js / subagent-reports.js 已有的那三份
 * usage: listBodies({role, sessionId}) / useBody({role, target, sessionId}) / reportToBody({role, sessionId, text, ref})
 * why: 时间一长、会话一换就找不到「谁在哪条会话里」；现有账本都记了，但没有一个统一的读写口
 * result: 一张「常驻 + 分身」的只读表；一个把当前会话挂成目标角色常驻的动作；一条给常驻主体的汇报
 */

// 鱼神双子星 · AGPL-3.0-or-later · © 2026 从零开始（保留本行）
// 常驻/分身工具：不新存东西，只把已有三份账本（residence.json / bodies.json / subagent-reports）读成一张表、
// 写进该写的地方。认人顺序不在本文件判断：residence.js 与 bodies.js 各管各的真相。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from '../memory-core/runtime/root.js'
import {
  residenceStatus,
  residentRoles,
  readLedger,
  markBody,
} from './residence.js'
import { claimBody, claimOf } from './bodies.js'
import { recordReport } from './subagent-reports.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const ID_RE = /^[a-z][a-z0-9_-]{1,31}$/
const RESIDENT_CFG = () => path.join(dataRoot(HOME), 'resident.json')

/**
 * 常驻这一层要不要开：默认按“实际有没有多角色/多会话”自动判。
 * 纯聊天、单角色单会话 → 关；多角色或已有常驻身体 → 开；显式配置优先。
 */
export function residentFeature({ roles = null, ledger = null } = {}) {
  try {
    const cfg = JSON.parse(fs.readFileSync(RESIDENT_CFG(), 'utf8').replace(/^\uFEFF/, ''))
    if (typeof cfg?.enabled === 'boolean') return cfg.enabled
  } catch { /* 没配置就自动判 */ }
  const rs = roles || (() => { try { return residentRoles() } catch { return [] } })()
  const lg = ledger || readLedger()
  const hasBody = Object.values(lg?.roles || {}).some((r) => r && r.sessionId)
  return rs.length > 1 || hasBody
}

/** 显式开/关常驻（写 resident.json）；不传就是关。 */
export function setResidentFeature(enabled) {
  try {
    fs.mkdirSync(path.dirname(RESIDENT_CFG()), { recursive: true })
    fs.writeFileSync(RESIDENT_CFG(), JSON.stringify({ enabled: Boolean(enabled), updatedAt: new Date().toISOString() }, null, 2) + '\n', 'utf8')
    return { ok: true, enabled: Boolean(enabled) }
  } catch (e) { return { ok: false, error: String(e?.message || e) } }
}

// 角色叫法映射：residentCommandRole（从一句话认指令）和 residentPrompt（加载卡时的提示文案）共用这一份，
// 不各写一套。别名（阿鲲/阿鲤）只用于“认指令”，提示里一律用正名。
const ROLE_BY_NAME = { 大鱼: 'dayu', 阿鲲: 'dayu', 小鱼: 'xiaoyu', 阿鲤: 'xiaoyu', 照微: 'dragon' }
const NAME_BY_ROLE = { dayu: '大鱼', xiaoyu: '小鱼', dragon: '照微' }

const str = (v) => (v === null || v === undefined ? '' : String(v)).trim()

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}

/** 分身表：bodies.json 里每个角色下挂的会话；只读，不修账。 */
function readBodies() {
  // 默认 install 与出厂 install 的数据根可能不同：先按 dataRoot 读，读不到再按 bodies.js 的写入口径读。
  const doc = readJson(path.join(dataRoot(HOME), 'bodies.json'), null)
    || readJson(path.join(HOME, 'dayu', 'bodies.json'), null)
  const rows = []
  for (const [role, sessions] of Object.entries(doc?.roles || {})) {
    if (!sessions || typeof sessions !== 'object') continue
    for (const [sessionId, row] of Object.entries(sessions)) {
      if (!sessionId || !row || typeof row !== 'object') continue
      rows.push({
        role: str(role),
        sessionId: str(sessionId),
        channel: str(row.channel) || '未知',
        lastAt: str(row.lastAt) || str(row.firstAt),
        count: Number(row.count) || 0,
      })
    }
  }
  // 最近的排前面；同一时间按角色/会话排，保证同样输入同样顺序。
  rows.sort((a, b) => {
    const am = Date.parse(a.lastAt)
    const bm = Date.parse(b.lastAt)
    const av = Number.isFinite(am) ? am : -Infinity
    const bv = Number.isFinite(bm) ? bm : -Infinity
    if (av !== bv) return bv - av
    if (a.role !== b.role) return a.role.localeCompare(b.role)
    return a.sessionId.localeCompare(b.sessionId)
  })
  return rows
}

/**
 * 看常驻与分身：谁有身体、身体在哪条会话、这条会话认的是谁。
 * @param {{role?:string, sessionId?:string}} [opts] sessionId 是「当前会话」，用来标 isMe 和查 claimedAs
 * @returns {{ok:boolean, me:{role:string,sessionId:string,claimedAs:string}, residents:object[], bodies:object[]}}
 */
export function listBodies({ role = 'dayu', sessionId = '' } = {}) {
  const sid = str(sessionId)
  const meRole = str(role) || 'dayu'
  let residents = []
  try {
    const status = residenceStatus()
    residents = Object.values(status.roles || {})
      .filter((row) => row && row.role)
      .map((row) => {
        const bodyId = str(row.sessionId)
        return {
          role: str(row.role),
          title: str(row.title),
          sessionId: bodyId,
          lastMessageAt: str(row.lastMessageAt),
          alive: Boolean(row.alive),
          isMe: Boolean(sid) && bodyId === sid,
        }
      })
  } catch {
    // 状态读不出来就退回账本：至少把「谁登记过身体」列出来，不把整页弄成空的。
    const ledger = readLedger()
    residents = Object.entries(ledger.roles || {}).map(([r, row]) => {
      const bodyId = str(row?.sessionId)
      return {
        role: str(r),
        title: str(row?.title) || str(r),
        sessionId: bodyId,
        lastMessageAt: str(row?.lastMessageAt),
        alive: Boolean(bodyId),
        isMe: Boolean(sid) && bodyId === sid,
      }
    })
  }
  let claimedAs = ''
  try { claimedAs = claimOf(sid) } catch { claimedAs = '' }
  const residentMap = Object.fromEntries(residents.filter((r) => r.role).map((r) => [r.role, { sessionId: r.sessionId }]))
  return {
    ok: true,
    me: { role: meRole, sessionId: sid, claimedAs },
    residents,
    bodies: readBodies(),
    hint: residentPrompt({ role: meRole, residents: residentMap }),
  }
}

/**
 * 把当前会话设为 target 角色的常驻。
 * 顺序：目标角色必须在册 → 这条会话没认过别的角色 → 记分身凭据（不覆盖别人）→ 记常驻身体。
 * @returns {{ok:boolean, role?:string, sessionId?:string, previous?:string, reason?:string, claimedAs?:string}}
 */
export function useBody({ role = 'dayu', target = '', sessionId = '' } = {}) {
  const goal = str(target) || str(role) || 'dayu'
  const sid = str(sessionId)
  if (!sid) return { ok: false, reason: 'missing-session' }
  if (!ID_RE.test(goal)) return { ok: false, reason: 'bad-role', role: goal }
  let roles = []
  try { roles = residentRoles() } catch { roles = [] }
  if (!roles.includes(goal)) {
    return { ok: false, reason: 'unknown-role', role: goal, allowed: roles }
  }
  const claimed = claimOf(sid)
  if (claimed && claimed !== goal) {
    return { ok: false, reason: 'claimed-as', claimedAs: claimed, role: goal, sessionId: sid }
  }
  const previous = str(readLedger().roles?.[goal]?.sessionId)
  const claim = claimBody({
    role: goal,
    sessionId: sid,
    source: 'body-tool',
    evidence: 'yushen_body use',
  })
  if (!claim.ok) {
    return { ok: false, reason: claim.reason || 'claim-failed', claimedAs: claim.role || '', role: goal, sessionId: sid }
  }
  try {
    markBody(goal, { sessionId: sid, source: 'body-tool' })
  } catch (error) {
    return { ok: false, reason: String(error?.message || error), role: goal, sessionId: sid }
  }
  return { ok: true, role: goal, sessionId: sid, previous }
}

/**
 * 从一句话里认“常驻”指令：只认“加载/转成/设为/改成/换成 <角色> 常驻”或“<角色>常驻”。
 * 普通“加载大鱼角色卡”不算，返回空串。
 */
export function residentCommandRole(text) {
  const s = String(text || '')
  const m = s.match(/(?:加载|转成|设为|改成|换成)\s*(大鱼|小鱼|照微|阿鲲|阿鲤)\s*常驻|(大鱼|小鱼|照微)\s*常驻/)
  const name = m?.[1] || m?.[2] || ''
  return ROLE_BY_NAME[name] || ''
}

/**
 * 加载角色卡时的一句话提示：这个角色还没有活着的常驻 → 建议“要设为常驻”；
 * 已有常驻、角色不在册、拿不到角色都不提示（返回空串）。
 * 不换常驻、不写盘：residents 由调用方传入（readLedger().roles 的形状），换不换人由老板那句确认决定。
 * @param {{role?:string, residents?:object}} [opts]
 * @returns {string} 提示文案或空串
 */
export function residentPrompt({ role = '', residents = {} } = {}) {
  const r = str(role)
  if (!r) return ''
  let roles = []
  try { roles = residentRoles() } catch { roles = [] }
  if (!roles.includes(r)) return ''
  const row = residents && typeof residents === 'object' ? residents[r] : null
  if (str(row?.sessionId)) return ''
  const name = NAME_BY_ROLE[r] || r
  return `这个角色还没有活着的常驻；要设为常驻就对新会话说“加载${name}常驻”。`
}

/**
 * 分身的一句话要不要自动写成汇报：不是常驻会话、且话里有“做完/卡住/失败”这类落点。
 * 只判文本，不写盘；写盘由调用方做（节流也在调用方）。
 */
export function isSubagentReport({ residenceSessionId = '', sessionId = '', text = '' } = {}) {
  const sid = String(sessionId || '')
  if (!sid || sid === String(residenceSessionId || '')) return false
  return /(做完|完成|改好|修好|搞定|卡住|不做了|失败|已发|已推)/.test(String(text || ''))
}

/** 从一段话里截一句“落点”（带标点/换行边界），用于汇报，不长篇搬。 */
export function reportSentence(text = '') {
  const m = String(text || '').match(/[^。\n]*?(做完|完成|改好|修好|搞定|卡住|不做了|失败|已发|已推)[^。\n]*/)
  return String(m?.[0] || '').replace(/\s+/g, ' ').trim().slice(0, 160)
}

/**
 * 给常驻主体写一条汇报：追加到 subagent-reports-<parentRole>.jsonl，不注入、不发消息。
 * @returns {{ok:boolean, parentRole:string, childSessionId:string, reason?:string}}
 */
export function reportToBody({ role = 'dayu', sessionId = '', text = '', ref = '' } = {}) {
  const parentRole = str(role) || 'dayu'
  const childSessionId = str(sessionId)
  const rec = recordReport(parentRole, {
    childSessionId,
    childRole: parentRole,
    text,
    ref,
  })
  return {
    ok: Boolean(rec?.ok),
    parentRole,
    childSessionId,
    ...(rec?.ok ? {} : { reason: rec?.reason || 'report-failed' }),
  }
}
