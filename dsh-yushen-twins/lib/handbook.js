// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// Local handbook façade. Existing file/stamp/slice/block API stays compatible.
// Retrieval does not call an LLM; any text injected into a prompt still costs tokens.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { COMMON_RULES, HANDBOOK_POINTER, HANDBOOK_SCENES, HANDBOOK_TOPICS, MAX_HANDBOOK_CHARS, budgetHandbook, handbookRole, handbookScene, handbookIndex, readHandbookTopic as policyTopic, validateHandbookAdjustment, recognizeHousehold } from './handbook-policy.js'
import { listSolutions } from './solutions.js'
import { queryExperience } from './task-experience.js'
import { activeIssuanceFor } from './issue.js'
import { workspace } from './paths.js'
import { residentRoleIds } from './roles.js'
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
  // 2026-11-01 老板：「手册要的不是多少，而是按需发放。」
  // 带 scene 时走场景取节：先说清这次为什么翻，只发那 2~4 节。
  if (options.scene !== undefined) return handbookSceneBlock(role, { ...options, file, sha })
  const prefix = `【岗位卡】共同规则 + 按需岗位/主题（全文：${file}${sha ? `，sha ${sha}` : ''}）`
  return handbookSlice(role, { ...options, prefix }).text
}

// —— 场景发放 ——
/** 场景发放的字数上限：3~4 节 + 指针留足余量，但压在 2500 以内（回归盯着）。 */
const MAX_SCENE_CHARS = 2400
/** 把员工手册按 `## ` 章节切成节（标题 + 正文）。只读，不写盘。 */
export function handbookChapters(source) {
  const text = source === undefined ? fs.readFileSync(handbookFile(), 'utf8') : String(source)
  return String(text).split(/\r?\n(?=## )/).map((chunk) => {
    const title = (chunk.split(/\r?\n/)[0] || '').replace(/^##\s*/, '').trim()
    return { title, text: chunk.replace(/^\s+|\s+$/g, '') }
  }).filter((row) => row.title && row.text)
}

/**
 * 场景取节：按 HANDBOOK_SCENES 登记的章节标题关键词，各取第一处标题命中。
 * 命中不到 2 节 → 退回 default（手册改标题/只装了一部分时不会空手回，也不会把整本倒出来）。
 */
export function handbookSceneSections(scene = 'default', { source } = {}) {
  const chapters = handbookChapters(source)
  const pick = (id) => {
    const out = []
    for (const keyword of HANDBOOK_SCENES[id].sections) {
      const hit = chapters.find((row) => row.title.includes(keyword))
      if (hit && !out.some((row) => row.title === hit.title)) out.push(hit)
    }
    return out
  }
  const requested = handbookScene(scene)
  let used = requested
  let sections = pick(requested)
  let fallback = false
  if (sections.length < 2) {
    fallback = requested !== 'default'
    used = 'default'
    sections = pick('default')
  }
  return { requested, scene: used, fallback, sections, chars: sections.reduce((a, s) => a + s.text.length, 0) }
}

/** 一次场景发放：节数/字数受预算约束，末尾永远留查询指针，并发一笔账。 */
export function handbookSceneBlock(role = 'worker', { scene = 'default', maxChars = MAX_SCENE_CHARS, text = '', source, file = handbookFile(), sha = '' } = {}) {
  if (!Number.isSafeInteger(maxChars) || maxChars < 1 || maxChars > MAX_HANDBOOK_CHARS) throw new RangeError(`maxChars 必须在 1..${MAX_HANDBOOK_CHARS}`)
  const actual = handbookRole(role)
  const picked = handbookSceneSections(scene, { source })
  const head = `【场景手册·${HANDBOOK_SCENES[picked.scene].label}】给 ${actual}（全文：${file}${sha ? `，sha ${sha}` : ''}）`
    + (picked.fallback ? `\n场景「${picked.requested}」没匹配到，退回默认两节。` : '')
  const parts = [head]
  let chars = head.length
  const sent = []
  for (const section of picked.sections) {
    const cost = 2 + section.text.length + 2 + HANDBOOK_POINTER.length
    if (chars + cost > maxChars) continue
    parts.push(section.text)
    sent.push(section)
    chars += 2 + section.text.length
  }
  // 发不出去也不空手：至少留指针，告诉她去哪翻。
  parts.push(HANDBOOK_POINTER)
  const block = parts.join('\n\n')
  recordHandbookSend({ role: actual, scene: picked.scene, sections: sent.map((row) => row.title), chars: block.length, noise: handbookNoise(sent, text, { source }) })
  return block
}

// —— 噪声 ——
// 口径（可解释、不调模型、不读盘）：
//   1. 任务描述取前 500 字，切成关键词 = ASCII/数字词（≥2 字）+ 中文相邻二元组，去掉虚词二元组；
//   2. 再用「章节通用度」筛一遍：一个词在手册一半以上章节都出现（手册/任务/文件/证据…），
//      它对「这次该不该给这一节」没有区分度，不算命中——否则几乎每节都能随便撞上一个词，噪声永远是 0；
//   3. 一节（标题 + 正文）里出现任意一个「有区分度」的关键词，就算跟这次任务有重合；
//   4. noise = 没有重合的节数（0 最好；越大说明这次发的节越跟任务无关）。
// 任务描述为空、或去掉通用词后一个词都不剩（比如任务只说「看下手册」）：没法判相关性，记 0，
// 不硬凑成噪声，也不粉饰成相关——审计里能按样本分开看。
const NOISE_STOP = new Set(['这个', '那个', '一下', '我们', '你们', '他们', '什么', '可以', '需要', '然后', '就是', '因为', '所以', '还是', '已经', '现在', '这里', '那里', '一个', '两个', '三个', '不要', '不是', '没有', '自己', '这些', '那些', '怎么', '如果', '但是', '而且', '或者', '之后', '之前', '时候'])
function keywordsOfText(text = '') {
  const s = String(text || '').toLowerCase()
  const words = s.match(/[a-z0-9_+.-]{2,}/g) || []
  const han = s.match(/[\p{Script=Han}]{2,}/gu) || []
  const bigrams = han.flatMap((word) => Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2)))
  return [...new Set([...words, ...bigrams])].filter((key) => !NOISE_STOP.has(key))
}
export function handbookKeywords(taskText = '') {
  return keywordsOfText(String(taskText || '').slice(0, 500))
}
/** 手册里「人手一个」的词：出现在一半以上章节 = 没区分度，不算命中依据。 */
function genericKeysOf(chapters = []) {
  const counts = new Map()
  for (const chapter of chapters) for (const key of keywordsOfText(`${chapter.title}\n${chapter.text}`)) counts.set(key, (counts.get(key) || 0) + 1)
  const threshold = Math.max(2, Math.ceil(chapters.length * 0.5))
  return new Set([...counts].filter(([, n]) => n >= threshold).map(([key]) => key))
}
export function handbookNoise(sections = [], taskText = '', { source } = {}) {
  const list = Array.isArray(sections) ? sections : []
  const keys = handbookKeywords(taskText)
  if (!keys.length) return 0
  let generic = new Set()
  try { generic = genericKeysOf(handbookChapters(source)) } catch { /* 读不到手册就按全部关键词算 */ }
  const useful = keys.filter((key) => !generic.has(key))
  if (!useful.length) return 0
  return list.filter((section) => {
    const body = String(typeof section === 'string' ? section : section?.text || '')
    return !useful.some((key) => body.includes(key))
  }).length
}

// —— 发放记录 ——
// 一行一次发放：{at, role, scene, sections:[标题], chars, noise}。
// 只记标题不记正文：任务原文可能带老板的私事，日志里只留「发了哪几节、多少字、几条噪声」。
export function handbookSendFile(home = process.env.DSH_HOME) {
  return path.join(home || path.join(os.homedir(), '.dsh'), 'dayu', 'runtime', '手册发放.jsonl')
}
export function recordHandbookSend({ role = 'worker', scene = 'default', sections = [], chars = 0, noise = 0, now = Date.now() } = {}) {
  const row = {
    at: new Date(now + 8 * 3600e3).toISOString().replace('Z', '+08:00'),
    role: String(role || 'worker'),
    scene: handbookScene(scene),
    sections: (Array.isArray(sections) ? sections : []).map((x) => String(typeof x === 'string' ? x : x?.title || '')).filter(Boolean),
    chars: Math.max(0, Math.round(Number(chars) || 0)),
    noise: Math.max(0, Math.round(Number(noise) || 0)),
  }
  try {
    const file = handbookSendFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${JSON.stringify(row)}\n`, { mode: 0o600 })
  } catch { /* 记不上账不影响这次发放 */ }
  return row
}
/** 定制手册（employee-profile 那本）也记一笔：只有章标题，正文不进日志。 */
export function recordCustomHandbookSend({ role = 'worker', chapters = [], chars = 0, text = '' } = {}) {
  const titles = (Array.isArray(chapters) ? chapters : []).map((id) => HANDBOOK_TOPICS.find((row) => row.id === id)?.title || String(id))
  return recordHandbookSend({ role, scene: 'dispatch', sections: titles, chars, noise: handbookNoise(titles, text) })
}
export function readHandbookSends({ days = 7, home, now = Date.now() } = {}) {
  const since = now - Math.max(1, Number(days) || 7) * 86400e3
  let text = ''
  try { text = fs.readFileSync(handbookSendFile(home), 'utf8') } catch { return [] }
  return String(text).split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try {
      const row = JSON.parse(line)
      const at = Date.parse(row.at)
      if (!Number.isFinite(at) || at < since) return []
      return [{ at: row.at, atMs: at, role: String(row.role || ''), scene: handbookScene(row.scene), sections: Array.isArray(row.sections) ? row.sections : [], chars: Number(row.chars) || 0, noise: Number(row.noise) || 0 }]
    } catch { return [] }
  })
}
/** 近 N 天发放统计：命中率（落在具体场景的比例）/ 噪声 / 使用率（先留空）。 */
export function handbookSendStats({ days = 7, home, now = Date.now() } = {}) {
  const rows = readHandbookSends({ days, home, now })
  const n = rows.length
  const avg = (pick) => (n ? Math.round((rows.reduce((a, r) => a + (Number(pick(r)) || 0), 0) / n) * 100) / 100 : 0)
  const byScene = {}
  for (const row of rows) byScene[row.scene] = (byScene[row.scene] || 0) + 1
  const defaultSends = byScene.default || 0
  return {
    days,
    sends: n,
    avgSections: avg((r) => r.sections.length),
    avgChars: avg((r) => r.chars),
    avgNoise: avg((r) => r.noise),
    // 命中率 = 发放落在具体场景（非 default 兜底）的比例。没有样本记 null，不假装 100%。
    hitRate: n ? Math.round(((n - defaultSends) / n) * 1000) / 1000 : null,
    byScene,
    // 使用率：发出去的节实际被引用/遵循了多少——还没接引用统计。结构先留，别让它变成一句口头。
    usage: { available: false, cited: null, rate: null, note: '发出去的节被引用/遵循多少：还没接引用统计（下一步：从回执里抽「已读手册」/节标题）' },
  }
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
  for (const role of residentRoleIds()) {
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
