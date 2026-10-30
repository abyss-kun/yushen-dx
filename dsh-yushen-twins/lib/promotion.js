// 鱼神双子星 · 晋升系统
// 只看“干得怎么样”，不自动升权限：
//   · evaluatePromotion 汇总 XP/任务/证据/经验/事故，给出 readiness 与 reasons；
//   · requestPromotion 只在达标时写一条 pending 申请（selfAssessment 只是记录，不是授权）；
//   · approvePromotion 必须主人显式批准，且只能按阶位**逐级** setCap 白名单，绝不全开；
//   · 批准后才调 growth.adjust 落实阶位；XP 本身永远不直接换成权限。
// 数据：~/.dsh/dayu/promotions/<role>.json（每个角色一条最新申请）
// 不改人格、不写角色卡；事故数只统计，不作为晋升闸门。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { status as growthStatus, adjust as growthAdjust } from './growth.js'
import { listExperience } from './task-experience.js'
import { CAPS, setCap } from './authz.js'

export const PROMOTION_ROLES = Object.freeze(['dayu', 'xiaoyu'])

export const PROMOTION_RULES = Object.freeze({
  minTasks: 3,
  minCompletionRate: 0.8,
  minEvidenceRate: 0.8,
  minVerifiedExperience: 2,
  requireNoActive: true,
})

// 逐级授予的能力白名单（累计）。只给低/中风险能力：
// exec.run / self.patch / host.restart / owner.write 永远不在晋升授予范围内。
export const PROMOTION_CAPS = Object.freeze({
  1: Object.freeze(['model.switch']),
  2: Object.freeze(['model.switch', 'session.cleanup', 'incident.resolve']),
  3: Object.freeze(['model.switch', 'session.cleanup', 'incident.resolve', 'pool.ensure', 'session.rotate']),
  4: Object.freeze(['model.switch', 'session.cleanup', 'incident.resolve', 'pool.ensure', 'session.rotate', 'growth.adjust']),
})

const ACTIVE_STATUS = Object.freeze(['dispatched', 'redispatched', 'returned'])
const FAILED_STATUS = Object.freeze(['aborted', 'rejected'])

function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

function dataDir() {
  return path.join(dshHome(), 'dayu')
}

function nowIso() {
  return new Date().toISOString()
}

function cleanText(value, max) {
  if (value == null) return ''
  return String(value)
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ')
    .replace(/\r?\n/g, ' ')
    .trim()
    .slice(0, max)
}

function assertRole(role) {
  const r = typeof role === 'string' ? role : null
  if (!PROMOTION_ROLES.includes(r)) {
    throw new Error(`未知角色：${String(role)}（只允许 ${PROMOTION_ROLES.join(' / ')}）`)
  }
  return r
}

function pct(rate) {
  return `${Math.round(Number(rate || 0) * 100)}%`
}

export function promotionFile(role) {
  const r = assertRole(role)
  const root = path.join(dataDir(), 'promotions')
  const file = path.join(root, `${r}.json`)
  if (!file.startsWith(root + path.sep)) throw new Error(`晋升路径越界：${file}`)
  return file
}

export function capsForLevel(level) {
  return (PROMOTION_CAPS[Number(level)] || []).slice()
}

// ---------- 只读统计 ----------

function readDispatch() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir(), 'dispatch.json'), 'utf8'))
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function readIncidents() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir(), 'incidents.json'), 'utf8'))
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function hasCurrentEvidence(task) {
  return (task.evidence || []).some((row) => row.ok === true && Number(row.attempt) === Number(task.attempts || 1))
}

function taskStats(role) {
  const tasks = readDispatch().filter((task) => (task.role || 'dayu') === role)
  const total = tasks.length
  const done = tasks.filter((task) => task.status === 'done').length
  const failed = tasks.filter((task) => FAILED_STATUS.includes(task.status)).length
  const active = tasks.filter((task) => ACTIVE_STATUS.includes(task.status)).length
  const evidenced = tasks.filter(hasCurrentEvidence).length
  const retries = tasks.reduce((sum, task) => sum + Math.max(0, Number(task.attempts || 1) - 1), 0)
  return {
    tasks: total,
    done,
    failed,
    active,
    evidenced,
    retries,
    completionRate: total ? done / total : 0,
    evidenceRate: total ? evidenced / total : 0,
  }
}

function experienceStats(role) {
  let list = []
  try { list = listExperience(role, { limit: 500 }) } catch { list = [] }
  const verified = list.filter((row) => row.verified === true).length
  return {
    experiences: list.length,
    verifiedExperience: verified,
    verifiedRate: list.length ? verified / list.length : 0,
  }
}

function incidentStats() {
  const rows = readIncidents()
  return {
    total: rows.length,
    open: rows.filter((row) => row.status === 'open' || row.status === 'fixing').length,
    high: rows.filter((row) => row.severity === 'high').length,
  }
}

function readPromotionFile(role) {
  try {
    const raw = JSON.parse(fs.readFileSync(promotionFile(role), 'utf8'))
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    if (raw.role !== role || typeof raw.id !== 'string' || !raw.id) return null
    return raw
  } catch {
    return null
  }
}

function writePromotionFile(role, record) {
  const file = promotionFile(role)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, file)
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }) } catch { /* 收尾 */ }
    throw err
  }
  return file
}

// ---------- 评估 ----------

/**
 * 评估某角色是否够格晋升。
 * 返回 xp / 当前阶 / 下一阶 / 任务与经验统计 / readiness / reasons。
 * 不写任何文件、不改权限、不改人格。
 */
export function evaluatePromotion(role) {
  const r = assertRole(role)
  const growth = growthStatus(r)
  const tasks = taskStats(r)
  const exp = experienceStats(r)
  const incidents = incidentStats()

  const current = {
    level: growth.level,
    stage: growth.stage,
    name: growth.name,
    xp: growth.xp,
    need: growth.need,
  }
  const next = growth.next ? {
    level: growth.next.level,
    stage: growth.next.stage,
    name: growth.next.name,
    need: growth.next.need,
    remain: growth.next.remain,
  } : null

  const reasons = []
  const checks = {
    hasNext: Boolean(next),
    minTasks: tasks.tasks >= PROMOTION_RULES.minTasks,
    completion: tasks.completionRate >= PROMOTION_RULES.minCompletionRate,
    evidence: tasks.evidenceRate >= PROMOTION_RULES.minEvidenceRate,
    noActive: PROMOTION_RULES.requireNoActive ? tasks.active === 0 : true,
    verifiedExperience: exp.verifiedExperience >= PROMOTION_RULES.minVerifiedExperience,
  }
  const readiness = Object.values(checks).every(Boolean)

  if (!checks.hasNext) reasons.push('已是当前最高阶（没有下一阶可晋升）')
  if (!checks.minTasks) reasons.push(`任务总数 ${tasks.tasks} 单，少于 ${PROMOTION_RULES.minTasks} 单`)
  if (!checks.completion) reasons.push(`完成率 ${pct(tasks.completionRate)}，低于 ${pct(PROMOTION_RULES.minCompletionRate)}`)
  if (!checks.evidence) reasons.push(`证据率 ${pct(tasks.evidenceRate)}，低于 ${pct(PROMOTION_RULES.minEvidenceRate)}`)
  if (!checks.noActive) reasons.push(`还有 ${tasks.active} 单在进行中，等收完再晋升`)
  if (!checks.verifiedExperience) reasons.push(`已验证经验 ${exp.verifiedExperience} 条，少于 ${PROMOTION_RULES.minVerifiedExperience} 条`)
  if (readiness) {
    reasons.push(`满足晋升条件：任务 ${tasks.tasks} 单、完成率 ${pct(tasks.completionRate)}、证据率 ${pct(tasks.evidenceRate)}、已验证经验 ${exp.verifiedExperience} 条、无活动任务`)
  }

  return {
    ok: true,
    role: r,
    xp: growth.xp,
    current,
    next,
    metrics: {
      ...tasks,
      ...exp,
      incidents,
    },
    checks,
    readiness,
    reasons,
    thresholds: { ...PROMOTION_RULES },
  }
}

// ---------- 申请 ----------

/**
 * 达标才写一条 pending 申请；不批准、不授权。
 * selfAssessment 只作为申请说明保存，任何情况下都不构成授权。
 */
export function requestPromotion(role, { selfAssessment = '' } = {}) {
  const r = assertRole(role)
  const evaluation = evaluatePromotion(r)
  if (!evaluation.readiness) {
    throw new Error(`还不满足晋升条件：${evaluation.reasons.join('；')}`)
  }

  const at = nowIso()
  const record = {
    id: `promo-${r}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    role: r,
    status: 'pending',
    createdAt: at,
    updatedAt: at,
    current: evaluation.current,
    target: evaluation.next,
    metrics: evaluation.metrics,
    reasons: evaluation.reasons,
    selfAssessment: cleanText(selfAssessment, 500),
    selfAssessmentNote: '自我评估仅作记录，不构成授权；批准必须由主人显式完成',
    authorization: 'owner-approval-required',
    approvedAt: null,
    approvedBy: null,
    grantedCaps: [],
    note: '',
  }
  const file = writePromotionFile(r, record)
  return {
    ok: true,
    promotion: record,
    file,
    approved: false,
    note: '已提交待批准；selfAssessment 不构成任何授权',
  }
}

// ---------- 查询 ----------

export function listPromotions() {
  return PROMOTION_ROLES.map((role) => readPromotionFile(role)).filter(Boolean)
}

/** 按角色（dayu / xiaoyu）或申请 id 取；找不到返回 null。 */
export function getPromotion(roleOrId) {
  const key = typeof roleOrId === 'string' ? roleOrId : ''
  if (!key) return null
  if (PROMOTION_ROLES.includes(key)) return readPromotionFile(key)
  for (const role of PROMOTION_ROLES) {
    const row = readPromotionFile(role)
    if (row && row.id === key) return row
  }
  return null
}

// ---------- 批准 ----------

function explicitCaps() {
  try {
    const charter = JSON.parse(fs.readFileSync(path.join(dataDir(), 'charter.json'), 'utf8'))
    const list = charter?.authority?.l2
    return Array.isArray(list) ? list.filter((name) => CAPS.some((cap) => cap.name === name)) : null
  } catch {
    return null
  }
}

function applyPromotionCaps(targetLevel, reason) {
  const caps = capsForLevel(targetLevel)
  const current = explicitCaps()
  const desired = new Set([...(current || []), ...caps])
  for (const cap of CAPS) setCap(cap.name, desired.has(cap.name), reason)
  return caps
}

/**
 * 主人显式批准一条晋升申请。
 * 必须传 ownerApproved=true + approvedBy（不能是本角色/两条鱼自己）。
 * 批准后按目标阶位累计 setCap 白名单，再 adjust 阶位；不会全开能力。
 */
export function approvePromotion(id, { ownerApproved = false, approvedBy = '', note = '' } = {}) {
  const key = typeof id === 'string' ? id.trim() : ''
  if (!key) throw new Error('缺少晋升申请 id')
  const record = getPromotion(key)
  if (!record) throw new Error(`没有这条晋升申请：${key}`)
  const r = record.role

  if (ownerApproved !== true) {
    throw new Error('晋升必须由主人显式批准（ownerApproved=true）；自我评估不构成授权')
  }
  const approver = cleanText(approvedBy, 40)
  if (!approver) throw new Error('缺少批准人 approvedBy')
  if (approver === r || PROMOTION_ROLES.includes(approver)) {
    throw new Error('不能自己批准自己的晋升')
  }
  if (record.status !== 'pending') {
    throw new Error(`该申请当前状态是 ${record.status}，不是 pending`)
  }
  if (!record.target || !Number.isInteger(Number(record.target.level))) throw new Error('申请缺少有效目标阶位')

  const targetLevel = Number(record.target.level)
  const reason = `晋升 Lv${targetLevel}（${r}）由 ${approver} 批准`
  const caps = applyPromotionCaps(targetLevel, reason)
  const growth = growthAdjust({ level: targetLevel, role: r, reason: `晋升批准：Lv${targetLevel}` })

  record.status = 'approved'
  record.approvedAt = nowIso()
  record.approvedBy = approver
  record.grantedCaps = caps
  record.note = cleanText(note, 200)
  record.updatedAt = record.approvedAt
  record.growth = { level: growth.level, xp: growth.xp }
  writePromotionFile(r, record)

  return {
    ok: true,
    promotion: record,
    grantedCaps: caps,
    level: growth.level,
    xp: growth.xp,
  }
}
