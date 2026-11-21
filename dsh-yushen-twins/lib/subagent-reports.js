/* 标签
 * id: lib-subagent-reports
 * kind: module
 * summary: 子分身汇报：分身干完活说一句「做了什么、原文在哪」，追加到 library/meta，只给常驻主体看；不写注入、不发消息。
 * tags: 子分身, 汇报, 追加式, 只读给别人
 * created: 2026-11-16 20:05:00
 * changed: 2026-11-16 23:04:30
 * author: 大鱼·子会话（实现代理）
 * authority: 父代理任务书（2026-11-16：子分身汇报给常驻主体的最小存储）
 * audience: 常驻主体（大鱼/小鱼）、以后的分身调度
 * owner: 框架；只追加，不改旧行
 * mutable: 可改；字段只增不删（parentRole/childSessionId/text/ref/at 是给外面看的）
 * usage: recordReport(parentRole, {childSessionId, childRole, text, eventId, ref, at}) / recentReports(parentRole, {limit, sinceMs})
 * why: 分身做的事和主体亲历的事不能混成一条记忆；先有最小存储，才谈后面的注入/唤醒
 * result: 每条带 parentRole/childSessionId/text/ref/at，并明说「这是分身做的事，不是主体亲历」
 */
// 改｜2026-11-16 20:05｜大鱼·子会话（实现代理）｜授权：父代理任务书（2026-11-16：子分身汇报给常驻主体的最小存储）｜lib/subagent-reports.js:1-130｜新增 recordReport / recentReports：追加 library/meta/subagent-reports-<parentRole>.jsonl，读取按 at 倒序，不写注入、不发消息｜为什么：分身做的事和主体亲历的事现在混在一条时间线上，主体分不清哪些是自己真干过的｜验证：node scripts/test-subagent-reports.mjs → 15/15 通过（临时 DSH_HOME；再用 YUSHEN_TEST=1 + --import scripts/_test-sandbox.mjs 跑一遍 15/15，真家一字节没写）｜可改：字段只增不删；「不写注入、不发消息」这两条不许改
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from '../memory-core/runtime/root.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
// 这一句是给读的人（和以后拼注入的人）看的：汇报不等于主体亲历。
const ABOUT = '这是分身做的事，不是主体亲历'
const DEFAULT_LIMIT = 3
const MAX_LIMIT = 200

const str = (v) => (v === null || v === undefined ? '' : String(v)).trim()

/** 角色名进文件名前先收干净：只留字母数字/下划线/中文/连字符，跟 episodes-<role>.jsonl 同口径。 */
function safeRole(role) {
  return str(role).replace(/[^\w\u4e00-\u9fa5-]/g, '')
}

function msOf(at) {
  const t = Date.parse(str(at))
  return Number.isFinite(t) ? t : NaN
}

/** 落盘位置：每个常驻主体一份，追加式，不与人共用。 */
export function reportsFile(parentRole) {
  const r = safeRole(parentRole) || 'dayu'
  return path.join(dataRoot(HOME), 'library', 'meta', `subagent-reports-${r}.jsonl`)
}

/** 读全部行：坏行跳过不崩；BOM 只在文件开头处理。 */
function readAll(parentRole) {
  let text = ''
  try { text = fs.readFileSync(reportsFile(parentRole), 'utf8') } catch { return [] }
  const out = []
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line)
      if (row && typeof row === 'object') out.push(row)
    } catch { /* 坏行跳过：宁可少一条，不整份读不出来 */ }
  }
  return out
}

/**
 * 对外统一形状：五个必备字段每次都补全（缺的就是空串，不编），
 * 并且无论文件里那条写没写，都标清楚「这是分身做的事，不是主体亲历」。
 * subject/role/sessionId 跟事件段（episode.js）的口径对齐：
 *   role      = 常驻主体（= parentRole）
 *   subject   = 'subagent'（这段经历的主体是分身，不是 role 本人）
 *   sessionId = 分身的会话 id（= childSessionId）
 */
function view(row) {
  const parentRole = str(row.parentRole)
  const childSessionId = str(row.childSessionId)
  return {
    kind: 'subagent-report',
    role: parentRole,
    subject: 'subagent',
    sessionId: childSessionId,
    parentRole,
    childSessionId,
    childRole: str(row.childRole),
    text: str(row.text),
    eventId: str(row.eventId),
    ref: str(row.ref),
    at: str(row.at),
    about: ABOUT,
    notSubjectExperience: true,
  }
}

/**
 * 追加一条汇报。只写盘，不注入、不发消息、不改任何别的文件。
 * at 解析不了就退成现在（不让一条没有时间的汇报把排序弄乱）；text 为空或没有 parentRole 直接拒。
 * @returns {{ok:boolean, row?:object, reason?:string}}
 */
export function recordReport(parentRole, { childSessionId = '', childRole = '', text = '', eventId = '', ref = '', at = '' } = {}) {
  const parent = safeRole(parentRole)
  if (!parent) return { ok: false, reason: '缺 parentRole' }
  const body = str(text)
  if (!body) return { ok: false, reason: 'text 为空' }
  const eid = str(eventId)
  if (eid) {
    const old = readAll(parent).find((r) => str(r.eventId) === eid)
    if (old) return { ok: true, deduped: true, row: view(old) }
  }
  const when = Number.isFinite(msOf(at)) ? str(at) : new Date().toISOString()
  const row = {
    kind: 'subagent-report',
    role: parent,
    subject: 'subagent',
    sessionId: str(childSessionId),
    parentRole: parent,
    childSessionId: str(childSessionId),
    childRole: str(childRole),
    text: body,
    eventId: str(eventId),
    ref: str(ref),
    at: when,
    about: ABOUT,
    notSubjectExperience: true,
  }
  const file = reportsFile(parent)
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${JSON.stringify(row)}\n`, { encoding: 'utf8', mode: 0o600 })
    return { ok: true, row }
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) }
  }
}

/**
 * 最近几条汇报：按 at 倒序（同一时刻后追加的在前；at 坏掉的行排最后）。
 * @param {string} parentRole 常驻主体
 * @param {{limit?:number, sinceMs?:number}} [opts] limit 默认 3；sinceMs 是绝对毫秒时间戳（与 lib/borrow.js、lib/wake-brief.js 的 sinceMs 同口径），只看 at >= sinceMs
 * @returns {object[]} 统一形状，见 view()
 */
export function recentReports(parentRole, { limit = DEFAULT_LIMIT, sinceMs = 0 } = {}) {
  const parent = safeRole(parentRole)
  if (!parent) return []
  const from = Number(sinceMs) > 0 ? Number(sinceMs) : 0
  const items = readAll(parent).map((row, i) => ({ row, i, ms: msOf(row.at) }))
  const kept = from ? items.filter((x) => Number.isFinite(x.ms) && x.ms >= from) : items
  kept.sort((a, b) => {
    const am = Number.isFinite(a.ms) ? a.ms : -Infinity
    const bm = Number.isFinite(b.ms) ? b.ms : -Infinity
    if (am !== bm) return bm - am
    return b.i - a.i // 同一时刻：后追加的更新
  })
  const n = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(limit) || DEFAULT_LIMIT)))
  return kept.slice(0, n).map((x) => view(x.row))
}
