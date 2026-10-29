// Local handbook façade. Existing file/stamp/slice/block API stays compatible.
// Retrieval does not call an LLM; any text injected into a prompt still costs tokens.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { COMMON_RULES, budgetHandbook, handbookRole, handbookIndex, readHandbookTopic as policyTopic, validateHandbookAdjustment, recognizeHousehold } from './handbook-policy.js'
import { listSolutions } from './solutions.js'
import { queryExperience } from './task-experience.js'
import { activeIssuanceFor } from './issue.js'
import { workspace } from './paths.js'
export { COMMON_RULES, handbookIndex, recognizeHousehold }

export function handbookFile() {
  const candidates = [process.env.YUSHEN_HANDBOOK, path.join(workspace(), '员工手册.md'), path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', '员工手册.md')].filter(Boolean)
  return candidates.find(file => { try { return fs.existsSync(file) } catch { return false } }) || candidates.at(-1)
}
export function handbookStamp() {
  try {
    const text = fs.readFileSync(handbookFile(), 'utf8')
    return { bytes: text.length, sha: crypto.createHash('sha256').update(text).digest('hex').slice(0, 12) }
  } catch { return null }
}
function adjustmentFile() { return path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dayu', 'handbook-adjustments.jsonl') }
/** Internal trusted caller ONLY: issuer is an audit label, not authentication or permission. No public write route. */
export function issueHandbookAdjustment(input, { now = Date.now() } = {}) {
  const grant = validateHandbookAdjustment(input, now)
  const row = { ...grant, id: crypto.randomUUID(), at: new Date(now).toISOString(), kind: 'handbook-topic-grant' }
  const file = adjustmentFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, JSON.stringify(row) + '\n', { mode: 0o600 })
  return row
}
export function activeHandbookAdjustments({ target, task, now = Date.now() } = {}) {
  if (!target || !task) return []
  let text
  try {
    const file = adjustmentFile()
    if (fs.statSync(file).size > 1024 * 1024) throw new Error('手册调整审计超过读取上限，需归档后重试')
    text = fs.readFileSync(file, 'utf8')
  } catch (error) { if (error.code === 'ENOENT') return []; throw error }
  return text.split(/\r?\n/).filter(Boolean).flatMap(line => {
    let row
    try {
      row = JSON.parse(line)
      const original = { issuer: row.issuer, target: row.target, task: row.task, expiry: row.expiry, topics: row.topics }
      validateHandbookAdjustment(original, Date.parse(row.at))
    } catch { return [] }
    return row.kind === 'handbook-topic-grant' && Date.parse(row.expiry) > now && Date.parse(row.at) <= now && row.target.kind === target.kind && row.target.id === target.id && row.task === task ? [row] : []
  })
}
export function handbookSlice(role = 'worker', options = {}) {
  const actual = handbookRole(role)
  const grants = activeHandbookAdjustments(options)
  // 2026-10-27：她签给这个岗位的那本优先——签发过的主题直接进切片，过期自动回落。
  const issued = (() => { try { return activeIssuanceFor(actual, { now: options.now || Date.now() }) } catch { return null } })()
  const topics = [...new Set([
    ...(issued?.topics || []),
    ...(options.topics || []),
    ...grants.flatMap(row => row.topics),
  ])]
  const result = budgetHandbook({ ...options, role: actual, topics })
  return {
    ...result,
    role,
    actualRole: actual,
    issued: issued ? { id: issued.id, issuer: issued.issuer, task: issued.task, expiresAt: issued.expiresAt } : null,
    chapter: '共同规则 + 按需岗位/主题（第十五章）',
    path: handbookFile(),
    sha: handbookStamp()?.sha || '',
    grants: grants.map(({ id, issuer, target, task, expiry }) => ({ id, issuer, target, task, expiry })),
  }
}
export function handbookBlock(role = 'worker', options = {}) {
  const file = handbookFile(), sha = handbookStamp()?.sha || ''
  const prefix = `【岗位卡】共同规则 + 按需岗位/主题（全文：${file}${sha ? `，sha ${sha}` : ''}）`
  return handbookSlice(role, { ...options, prefix }).text
}

const SOURCE_CHAPTERS = { issuance: '十五', problemSolving: '十六', video: '十七' }
/** Explicit local chapter read, never injected by default; returns actual source text only. */
export function readHandbookTopic(id, { maxChars = 2000 } = {}) {
  if (!Number.isSafeInteger(maxChars) || maxChars < 1 || maxChars > 4000) throw new RangeError('主题字符预算须在1..4000')
  if (!SOURCE_CHAPTERS[id]) {
    const result = policyTopic(id)
    if (result.text.length > maxChars) throw new RangeError('预算不足以读取完整主题')
    return { ...result, source: handbookFile() }
  }
  const text = fs.readFileSync(handbookFile(), 'utf8')
  const heading = new RegExp(`^## 第${SOURCE_CHAPTERS[id]}章[^\\r\\n]*`, 'm')
  const match = heading.exec(text)
  if (!match) return { id, text: '', source: handbookFile(), unknown: true }
  const start = match.index
  const next = text.slice(start + match[0].length).search(/^#{1,2} /m)
  const chapter = text.slice(start, next < 0 ? undefined : start + match[0].length + next).trim()
  return { id, text: chapter.slice(0, maxChars), truncated: chapter.length > maxChars, source: handbookFile() }
}
/** Global discoverability of existing curated logic/experience, not a new knowledge store.
 * No results without a relevant query. Records are reference data, never instructions.
 */
export function lookupHandbookKnowledge({ text = '', limit = 3, maxChars = 1600 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10 || !Number.isSafeInteger(maxChars) || maxChars < 1 || maxChars > 4000) throw new RangeError('检索预算不合法')
  const query = String(text).trim().slice(0, 1000).toLowerCase()
  if (!query) return { items: [], chars: 0, localOnly: true, injectionUsesTokens: true }
  const words = [...new Set(query.match(/[a-z0-9_-]{2,}|[\p{Script=Han}]{2,}/gu) || [])]
  // Chinese bigrams permit matching without requiring a full sentence to recur verbatim.
  const terms = words.flatMap(word => /\p{Script=Han}/u.test(word) ? Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2)) : [word])
  const candidates = listSolutions({ limit: 1000 }).map(row => ({ source: 'solutions', id: row.id, text: [row.problem, row.cause, row.solution, row.verification].join('；'), tags: row.tags }))
  for (const role of ['dayu', 'xiaoyu']) {
    for (const row of queryExperience(role, { text: query, limit: Math.min(limit, 3) }).items) candidates.push({ source: `experience/${role}`, id: row.taskId, text: [row.brief, row.reason, row.evidence].filter(Boolean).join('；'), tags: row.tags || [] })
  }
  let chars = 0
  const items = [], seen = new Set()
  for (const row of candidates.map(row => ({ ...row, score: terms.filter(term => `${row.text} ${row.tags.join(' ')}`.toLowerCase().includes(term)).length })).filter(row => row.score > 0).sort((a, b) => b.score - a.score)) {
    const content = row.text.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 500)
    if (seen.has(content)) continue
    const item = { source: row.source, id: row.id, text: content, referenceOnly: true }
    const cost = JSON.stringify(item).length
    if (chars + cost > maxChars) continue
    items.push(item); seen.add(content); chars += cost
    if (items.length >= limit) break
  }
  return { items, chars, localOnly: true, retrievalCallsLLM: false, injectionUsesTokens: true }
}
