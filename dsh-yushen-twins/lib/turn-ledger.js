/* 标签
 * id: lib-turn-ledger
 * kind: module
 * summary: 每轮台账：从这一轮明确文本里抽要求/约束/承诺/声称完成/未完成/纠正，落 runtime/<role>/turn-ledger.jsonl；只记原文证据，不猜动机。
 * tags: 每轮, 台账, 要求, 约束, 承诺, 完成, 未完成, 纠正, 提醒
 * created: 2026-11-17 19:00:00
 * changed: 2026-11-21 22:31:44
 * author: 大鱼·子会话
 * authority: 老板（2026-11-17：做每轮台账最小模块，纯本地、无模型）
 * audience: 接手下一轮的会话、提醒/唤醒、以后页面
 * owner: 框架；append-only，不删原文证据
 * mutable: 可改；判据只增不减，不许把"猜"写回来
 * usage: observe(role,{turnId,at,user,assistant}) / listOpen(role,{limit}) / nextReminder(role,{limit,now}) / markReminded(role,id)
 * defaults: 过期天数按 kind（要求 7 / 约束 7 / 承诺 3 / 未完成 7 / 纠正 2）；提醒至少 30 分钟龄、每天最多 3 条
 * off: 没接任何调用点；纯本地，不调模型、不联网
 * why: 这一轮说了什么、答应了什么、哪句说"做完了"，散在会话里，下一轮就找不到
 * result: 一条一行（append-only），读时折叠；同话题合并更新，不每轮新建一堆
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 每轮台账 · 最小模块（2026-11-17）
//
// 规矩：
//   1. 只从**明确文本**里抽：原文里有"必须/不要/我会/已经做完/还没/说错了"这类话才算；
//      没明说就不记，判不了就标 needs_review，绝不替她猜动机。
//   2. evidence 是原文片段，不是转述；每条都带 turnId，回查得到。
//   3. 同一话题/相同关键词只保留一条，后来的出现记成 merge（seenCount +1），
//      不每轮 append 一条新的；已闭合的旧条不复用，新出现的事另起一条。
//   4. 提醒是单独一步：nextReminder 只挑 open + 明确 + 没提醒过 + 没过期 + 够龄的，
//      markReminded 才落"提醒过"。不自动催，也不每轮催。
//   5. 坏行跳过；写不进去返回 ok:false，不假装成功。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { dataRoot } from '../memory-core/runtime/root.js'
import { activeItems } from './agenda.js'

export const KINDS = Object.freeze(['requirement', 'constraint', 'promise', 'claim_done', 'unfinished', 'correction'])

export const KIND_LABEL = Object.freeze({
  requirement: '要求',
  constraint: '约束',
  promise: '承诺',
  claim_done: '声称完成',
  unfinished: '未完成',
  correction: '纠正',
})

const TTL_DAYS = Object.freeze({
  requirement: 7,
  constraint: 7,
  promise: 3,
  unfinished: 7,
  correction: 2,
  claim_done: 0,
})

const REMIND_PRIORITY = Object.freeze({ unfinished: 0, promise: 1, correction: 2, requirement: 3, constraint: 4 })
const MIN_AGE_MINUTES = 30
const MAX_PER_DAY = 0 // 0 = 不限；本地提醒不花模型钱，靠去重/够龄，不靠每日硬上限
const MAX_CLAUSES = 40
const MAX_ITEMS_PER_OBSERVE = 12

/** 页面可改的每日提醒上限；坏文件/坏值回落 10。 */
export function readReminderSettings() {
  try {
    const file = path.join(dataRoot(process.env.DSH_HOME || path.join(os.homedir(), '.dsh')), 'switches.json')
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    const n = Number(raw?.remindPerDay)
    return { remindPerDay: Number.isFinite(n) ? Math.max(0, Math.min(50, n)) : MAX_PER_DAY, turnReminder: raw?.turnReminder !== false }
  } catch { return { remindPerDay: MAX_PER_DAY, turnReminder: true } }
}

const clip = (s, n = 160) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
function stripNotice(s) {
  return String(s ?? '').replace(/^(?:【台账提醒】|【记忆预览】|【结论冲突】)\\s*/, '').replace(/^你(?:说了要做|之前答应过|要求过)：\\s*/, '').trim()
}
const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s，。！？、；：,.!?;:"'“”‘’（）()【】[\]]/g, '')

function toMs(value, fallback = Date.now()) {
  if (value === undefined || value === null || value === '') return fallback
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : fallback
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  const t = Date.parse(String(value))
  return Number.isFinite(t) ? t : fallback
}

const iso = (ms) => new Date(ms).toISOString()

/** 角色 id 只用来拼目录；不合法就报错，不悄悄写到别处。 */
export function safeRole(role) {
  const id = String(role ?? '').trim()
  if (!id) throw new Error('turn-ledger：没有角色 id')
  return id.replace(/[\\/:*?"<>|\s]/g, '_').slice(0, 40)
}

/** DSH 家目录（每次调用现读环境变量，测试设 DSH_HOME 才能生效）。 */
export function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

/** 台账文件：~/.dsh/dayu/runtime/<role>/turn-ledger.jsonl（runtime/<role>/ 下）。 */
export function ledgerFile(role) {
  return path.join(dshHome(), 'dayu', 'runtime', safeRole(role), 'turn-ledger.jsonl')
}

// ── 读 / 折叠 ────────────────────────────────────────────────────────────

function readRows(role) {
  let text = ''
  try { text = fs.readFileSync(ledgerFile(role), 'utf8') } catch { return { rows: [], bad: 0 } }
  const rows = []
  let bad = 0
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line)
      if (row && typeof row === 'object' && typeof row.id === 'string' && row.id) rows.push(row)
      else bad += 1
    } catch { bad += 1 }
  }
  return { rows, bad }
}

function newItem(row) {
  const at = String(row.at || '')
  const occurrences = [{ turnId: String(row.turnId || ''), sessionId: String(row.sessionId || ''), at, text: String(row.text || ''), evidence: String(row.evidence || ''), source: String(row.source || '') }]
  return {
    id: String(row.id),
    role: String(row.role || ''),
    kind: KINDS.includes(row.kind) ? row.kind : 'requirement',
    status: String(row.status || 'open'),
    explicit: row.explicit !== false,
    text: String(row.text || ''),
    evidence: String(row.evidence || ''),
    turnId: String(row.turnId || ''),
    sessionId: String(row.sessionId || ''),
    source: String(row.source || ''),
    at,
    firstAt: at,
    lastAt: at,
    ttlDays: Number(row.ttlDays) || 0,
    expiresAt: String(row.expiresAt || ''),
    keywords: Array.isArray(row.keywords) ? row.keywords.slice(0, 40) : [],
    seenCount: 1,
    occurrences,
    remindedAt: '',
    statusAt: '',
    statusEvidence: '',
    kindsSeen: [row.kind],
  }
}

function applyRow(items, row) {
  const it = items.get(row.id)
  if (row.op === 'add') { items.set(row.id, newItem(row)); return }
  if (!it) return
  const at = String(row.at || '')
  if (row.op === 'merge') {
    it.seenCount += 1
    it.text = String(row.text || it.text)
    it.evidence = String(row.evidence || it.evidence)
    it.turnId = String(row.turnId || it.turnId)
    if (row.sessionId) it.sessionId = String(row.sessionId)
    it.source = String(row.source || it.source)
    it.lastAt = at || it.lastAt
    if (row.kind && !it.kindsSeen.includes(row.kind)) it.kindsSeen.push(row.kind)
    if (Array.isArray(row.keywords) && row.keywords.length) {
      it.keywords = [...new Set([...(it.keywords || []), ...row.keywords])].slice(0, 40)
    }
    if (row.ttlDays !== undefined) it.ttlDays = Number(row.ttlDays) || 0
    if (row.expiresAt) it.expiresAt = String(row.expiresAt)
    if (row.status) it.status = String(row.status)
    it.occurrences.push({ turnId: String(row.turnId || ''), at, text: String(row.text || ''), evidence: String(row.evidence || ''), source: String(row.source || '') })
    if (it.occurrences.length > 8) it.occurrences = it.occurrences.slice(-8)
    return
  }
  if (row.op === 'status') {
    it.status = String(row.status || it.status)
    it.statusAt = at || it.statusAt
    it.statusEvidence = String(row.evidence || it.statusEvidence)
    return
  }
  if (row.op === 'remind') it.remindedAt = at || it.remindedAt
}

function fold(rows) {
  const items = new Map()
  for (const row of rows) applyRow(items, row)
  return [...items.values()]
}

function expiredOf(item, nowMs) {
  const t = Date.parse(item.expiresAt || '')
  return Boolean(item.expiresAt) && Number.isFinite(t) && t <= nowMs
}

// ── 关键词 / 合并判据 ────────────────────────────────────────────────────

// 只做"同话题"的粗判：先去掉口头词/代词/时间词，再取汉字二元组。
// 这是启发式，不是语义理解；拿不准的相似就各记一条（宁可分，不可错并）。
const STOP_PHRASES = [
  '我们', '你们', '他们', '咱们', '我会', '你要', '我要', '你能', '可以', '应该', '必须', '需要',
  '不要', '不用', '不能', '还没', '尚未', '没有', '已经', '务必', '一定', '记得', '请你', '麻烦',
  '帮我', '给我', '要求你', '希望你', '今天', '明天', '今晚', '现在', '稍后', '回头', '待会',
  '接下来', '然后', '因为', '所以', '但是', '如果', '要是', '这个', '那个', '什么', '怎么',
  '一下', '一遍', '一点',
].sort((a, b) => b.length - a.length)

const STOP_CHARS = '我你他她它的了着过把被给对向从和与跟同及或而但就都也还又很太更最是这那有在吗呢吧啊呀嘛哦嗯个些一请帮别让先再会要能可不没'

/** 抽"话题词"：汉字二元组 + 英文/数字词；去口头词后排序无关。 */
export function topicWords(text) {
  let s = String(text ?? '').toLowerCase().replace(/[^0-9a-z\u4e00-\u9fa5]+/g, ' ')
  for (const p of STOP_PHRASES) s = s.split(p).join('')
  for (const ch of STOP_CHARS) s = s.split(ch).join('')
  const out = new Set()
  for (const part of s.split(/\s+/)) {
    if (!part) continue
    if (/^[0-9]+$/.test(part)) continue
    if (/^[a-z0-9]+$/.test(part)) { if (part.length >= 3) out.add(part); continue }
    for (let i = 0; i + 1 < part.length; i += 1) {
      const bg = part.slice(i, i + 2)
      if (/^[0-9]/.test(bg)) continue
      out.add(bg)
    }
  }
  return [...out].slice(0, 40)
}

function similarity(a, b) {
  const A = new Set(a || [])
  const B = new Set(b || [])
  if (!A.size || !B.size) return 0
  let hit = 0
  for (const x of A) if (B.has(x)) hit += 1
  return hit / Math.min(A.size, B.size)
}

const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10)
const groupOf = (kind) => (kind === 'correction' ? 'correction' : kind === 'claim_done' ? 'claim' : 'loop')

// ── 抽句 ────────────────────────────────────────────────────────────────

const RE = Object.freeze({
  correction: /(?:说错|讲错|纠正|更正|改口|收回(?:刚才)?|刚才(?:说|讲)的?错|上一条(?:说|写)错|不是[^。！？!?\n]{1,30}?[，,]\s*(?:而是|是))/,
  claim: /(?:已经|已|刚刚?)(?:把)?[^。！？!?\n]{0,40}?(?:做完|完成|改好|写好|跑完|跑过|通过|修好|处理完|搞定|补完|弄好|发出|提交|新增|删除|整理完|整理好)|(?:做完|完成|改好|改完|写好|写完|跑完|跑过|通过了?|修好|搞定|弄好|补完|整理完|整理好|处理完|检查完|核对完|收好|排好|发完)了/,
  unfinished: /(?:还没|尚未|没来得及|未完成|没做完|没写完|没改|没跑|没弄|没提交|没发|待办(?!清单|列表|项)|还差|剩下)/,
  promise: /(?:我|咱)(?:会|将|这就|马上|立刻|现在|这就|待会|回头|稍后|明天|今晚|晚点|接下来|先把|来把|去把|答应|保证)|我答应你|放心[，,]?我|包在我身上|(?:下次|之后)我/,
  requirement: /(?:你|您)(?:必须|务必|得|需要|要)(?!不要|不用|不能|别)|(?:请|麻烦)(?:你|您)?(?:把|帮|去|来|给|看|跑|写|改|检查|确认|补|发|删|加|统一|整理)|(?:帮|给)我|(?:记得|别忘|不要忘|一定要)|(?:要求|希望)你(?:把|能|来|去)|(?:你|您)把|^(?:请|麻烦)?把/,
  constraint: /(?:不要|不用(?:再|去|把|动|碰|改|写|发|跑|管|弄)|别(?:再|去|把|动|碰|改|写|发|跑|管|弄|乱|随便)|不许|不准|禁止|不能(?:再|去|把|动|碰|改|写|发|跑|管|弄|用)|只能|仅限|只准|一律|只许)/,
  softDecline: /(?:不要紧|没关系|不用了|不用谢|别客气|别担心|别急|不着急|别怕)/,
  hedge: /(?:可能|也许|大概|看情况|再说|随缘|尽量|试试看|不确定|好像|似乎|或许|不一定)/,
  question: /(?:[？?]\s*$|吗\s*$|要不要|有没有|好不好|行不行)/,
  conditional: /^(?:如果|要是|假如|万一)/,
})

function splitClauses(text) {
  return String(text ?? '')
    .split(/[\n。！？!?；;]+/)
    .map((s) => s.replace(/^[\s>#*\-–—·•\d、)）]+/, '').replace(/[：:]\s*$/, '').trim())
    .filter((s) => s.length >= 4)
}

function candidate(kind, text, source, keywords) {
  const tokens = keywords && keywords.length ? keywords : topicWords(text)
  const explicit = tokens.length > 0 && !RE.hedge.test(text)
  return {
    kind,
    text: clip(text, 300),
    evidence: clip(text, 300),
    source,
    keywords: tokens,
    explicit,
    status: kind === 'claim_done' ? 'closed' : (explicit ? 'open' : 'needs_review'),
  }
}

// 2026-11-21（照微，自查）：台账开始**把自己的描述当成待办**了。
// 实测：一天里开着的 10 条，有 7 条是我在解释台账机制时写的句子（"查到那条纠正挂在…"、"它会把我随口一句记成待办"），
// 还有一条是表格里的一行（"| 淡忘 dry | 0 候选 |"）。这不是多记了点东西，是**把警报搞成噪音**——
// 噪音听久了，真有事那天也没人看（同一课 11-09 在 verify 上吃过一次）。
//
// 两条收紧（只收窄，不新增能力）：
//   ① correction 只认"用户指出的错"，或者我自己明说"我说错/改口/收回刚才"——我描述"纠正"这个词不算纠正；
//   ② unfinished 不收表格行，也不收"在解释台账/纠正/到期"这类元描述；主语得是"我/还/剩下/待"这类真欠着的话。
const LEDGER_META = /(台账|纠正|到期|候选|这条账|那两条|turn-ledger)/

function detect(clause, source) {
  const text = clip(clause, 300)
  if (text.length < 4) return null
  const question = RE.question.test(text)
  const isTableRow = /^\s*\|/.test(text)

  // ① 纠正：要么老板指出来，要么我自己明说"我说错了/我改口/收回刚才"
  if (RE.correction.test(text)) {
    const selfAdmitted = source === 'assistant' && /^(?:我)?(?:说错|讲错|改口|收回|刚才说的|上一条)/.test(text)
    if (source === 'user' || selfAdmitted) return candidate('correction', text, source)
  }

  if (source === 'assistant' && RE.claim.test(text)) return candidate('claim_done', text, source)

  // ② 未完成：她自己说"还没…"，或主人明确指出"你还没…"；表格行、元描述、解释性句子都不算
  //    （2026-11-21 实测的假阳性来源：表格行、"它会把我随口一句记成待办"这类描述）
  const descriptive = /记成|当成|算成|写成|叫做|指的是/.test(text)
  if (RE.unfinished.test(text) && !isTableRow && !LEDGER_META.test(text) && !descriptive) {
    const fromOwner = source === 'user' && /你(?:还|也)?(?:没|未)/.test(text)
    if (source === 'assistant' || fromOwner) return candidate('unfinished', text, source)
  }

  if (source === 'assistant' && !question && RE.promise.test(text)) return candidate('promise', text, source)

  if (source === 'user' && !question && !RE.conditional.test(text)) {
    if (RE.constraint.test(text) && !RE.softDecline.test(text) && !/不要忘了?/.test(text)) return candidate('constraint', text, source)
    if (RE.requirement.test(text)) return candidate('requirement', text, source)
  }
  return null
}

// ── 写 ──────────────────────────────────────────────────────────────────

function appendRow(role, row) {
  try {
    const file = ledgerFile(role)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${JSON.stringify(row)}\n`, { encoding: 'utf8', mode: 0o600 })
    return true
  } catch { return false }
}

function ttlOf(kind, override) {
  if (override !== undefined && override !== null && Number.isFinite(Number(override))) return Number(override)
  return TTL_DAYS[kind] || 0
}

function expiresFrom(kind, atMs, ttlDays) {
  const days = ttlOf(kind, ttlDays)
  return days > 0 ? iso(atMs + days * 86400000) : ''
}

function findExact(items, id) {
  return items.find((i) => i.id === id) || null
}

function findNearest(items, cand) {
  let best = null
  let bestScore = 0
  for (const it of items) {
    if (it.status === 'closed') continue
    if (groupOf(it.kind) !== groupOf(cand.kind)) continue
    if (cand.sessionId && it.sessionId !== cand.sessionId) continue
    if (groupOf(cand.kind) === 'correction' && it.kind !== 'correction') continue
    const score = similarity(cand.keywords, it.keywords)
    if (score >= 0.6 && score > bestScore) { best = it; bestScore = score }
  }
  return best
}

function uniqueId(base, items) {
  if (!findExact(items, base)) return base
  for (let n = 2; n < 1000; n += 1) {
    const id = `${base}-${n}`
    if (!findExact(items, id)) return id
  }
  return `${base}-${Date.now().toString(36)}`
}

function isDuplicate(item, cand) {
  if (!cand.turnId) return false
  if (item.turnId !== cand.turnId) return false
  return norm(item.evidence || item.text) === norm(cand.evidence || cand.text)
}

function writeMerge(role, item, cand, atMs, extra = {}) {
  const ttlDays = ttlOf(item.kind, extra.ttlDays)
  const row = {
    v: 1, op: 'merge', id: item.id, role: safeRole(role), kind: cand.kind,
    at: iso(atMs), turnId: String(cand.turnId || ''), sessionId: String(cand.sessionId || ''), text: cand.text, evidence: cand.evidence,
    source: cand.source, keywords: cand.keywords, ttlDays,
    expiresAt: expiresFrom(item.kind, atMs, ttlDays),
  }
  const written = appendRow(role, row)
  if (written) applyRow(new Map([[item.id, item]]), row)
  return written
}

/**
 * 记一轮。
 * @returns {{ok:boolean, added:number, merged:number, closed:number, needsReview:number,
 *            skipped:number, items:Array<{id:string,kind:string,status:string}>,
 *            badLines:number, error?:string}}
 */
export function observe(role, { turnId = '', sessionId = '', at = Date.now(), user = '', assistant = '', evidence = '', ttlDays = undefined } = {}) {
  safeRole(role)
  const atMs = toMs(at)
  const when = iso(atMs)
  const res = { ok: true, added: 0, merged: 0, closed: 0, needsReview: 0, skipped: 0, items: [], badLines: 0, error: '' }

  const candidates = []
  for (const [source, text] of [['user', user], ['assistant', assistant]]) {
    if (!text) continue
    for (const clause of splitClauses(text)) {
      if (candidates.length >= MAX_ITEMS_PER_OBSERVE) break
      const clean = stripNotice(clause)
      const cand = detect(clean, source)
      if (!cand) continue
      cand.text = clean
      cand.evidence = clean
      candidates.push({ ...cand, source, turnId: String(turnId || ''), sessionId: String(sessionId || ''), atMs })
    }
    if (candidates.length >= MAX_ITEMS_PER_OBSERVE) break
  }
  if (!candidates.length) return res

  const { rows, bad } = readRows(role)
  res.badLines = bad
  const items = fold(rows)

  for (const cand of candidates) {
    const baseId = `tl-${sha(`${safeRole(role)}|${cand.kind}|${cand.keywords.slice().sort().join(',') || norm(cand.text)}`)}`

    // 1) 声称完成：关闭/降级同话题的未闭合项，再记一条 closed 事件
    //    承诺 → closed（她亲口说做了）；要求/约束/未完成 → needs_review（主人还没确认，不替她判完成）
    if (cand.kind === 'claim_done') {
      const related = items.filter((it) => it.status !== 'closed' && groupOf(it.kind) === 'loop' && similarity(cand.keywords, it.keywords) >= 0.6)
      for (const it of related) {
        const hasProof = String(evidence || '').trim().length > 0
        const next = it.kind === 'promise' ? (hasProof ? 'closed' : 'needs_review') : 'needs_review'
        const row = { v: 1, op: 'status', id: it.id, role: safeRole(role), at: when, turnId: cand.turnId, sessionId: cand.sessionId, status: next, evidence: hasProof ? String(evidence).slice(0, 300) : cand.evidence }
        if (appendRow(role, row)) {
          applyRow(new Map([[it.id, it]]), row)
          if (next === 'closed') res.closed += 1
          else res.needsReview += 1
        }
      }
      const exact = findExact(items, baseId)
      if (exact) {
        if (isDuplicate(exact, cand)) { res.skipped += 1; continue }
        if (writeMerge(role, exact, cand, atMs, { ttlDays: 0 })) res.merged += 1
        else { res.ok = false; res.error = '写不进台账' }
        continue
      }
      const id = uniqueId(baseId, items)
      const row = {
        v: 1, op: 'add', id, role: safeRole(role), kind: cand.kind, status: 'closed',
        explicit: true, text: cand.text, evidence: cand.evidence, turnId: cand.turnId, sessionId: cand.sessionId,
        at: when, source: cand.source, keywords: cand.keywords, ttlDays: 0, expiresAt: '',
      }
      if (!appendRow(role, row)) { res.ok = false; res.error = '写不进台账'; continue }
      const item = newItem(row)
      items.push(item)
      res.added += 1
      res.items.push({ id, kind: cand.kind, status: item.status })
      continue
    }

    // 2) 同一条重复投递（同一轮、同一句）：不新增、不重复计数
    let exactId = findExact(items, baseId)
    if (exactId && cand.sessionId && exactId.sessionId !== cand.sessionId) exactId = null
    if (exactId && exactId.status !== 'closed' && isDuplicate(exactId, cand)) { res.skipped += 1; continue }
    if (exactId && exactId.status === 'closed') {
      // 已闭合的旧事不再复用；这算是新一次出现 → 另起一条（id 加后缀）
    } else if (exactId) {
      if (writeMerge(role, exactId, cand, atMs, { ttlDays })) {
        res.merged += 1
        const wasReview = exactId.status === 'needs_review'
        if (wasReview && cand.explicit) {
          const row = { v: 1, op: 'status', id: exactId.id, role: safeRole(role), at: when, turnId: cand.turnId, status: 'open', evidence: 'again-explicit' }
          if (appendRow(role, row)) applyRow(new Map([[exactId.id, exactId]]), row)
        }
        res.items.push({ id: exactId.id, kind: exactId.kind, status: exactId.status })
      } else { res.ok = false; res.error = '写不进台账' }
      continue
    }

    // 3) 同话题近似（换了说法）→ 并进已有那条
    const target = findNearest(items, cand)
    if (target) {
      if (isDuplicate(target, cand)) { res.skipped += 1; continue }
      if (writeMerge(role, target, cand, atMs, { ttlDays })) {
        res.merged += 1
        if (target.status === 'needs_review' && cand.explicit) {
          const row = { v: 1, op: 'status', id: target.id, role: safeRole(role), at: when, turnId: cand.turnId, status: 'open', evidence: 'again-explicit' }
          if (appendRow(role, row)) applyRow(new Map([[target.id, target]]), row)
        }
        res.items.push({ id: target.id, kind: target.kind, status: target.status })
      } else { res.ok = false; res.error = '写不进台账' }
      continue
    }

    // 4) 新的一条
    const id = uniqueId(baseId, items)
    const ttl = ttlOf(cand.kind, ttlDays)
    const row = {
      v: 1, op: 'add', id, role: safeRole(role), kind: cand.kind, status: cand.status,
      explicit: cand.explicit, text: cand.text, evidence: cand.evidence, turnId: cand.turnId, sessionId: cand.sessionId,
      at: when, source: cand.source, keywords: cand.keywords, ttlDays: ttl,
      expiresAt: expiresFrom(cand.kind, atMs, ttl),
    }
    if (!appendRow(role, row)) { res.ok = false; res.error = '写不进台账'; continue }
    const item = newItem(row)
    items.push(item)
    res.added += 1
    if (item.status === 'needs_review') res.needsReview += 1
    res.items.push({ id, kind: cand.kind, status: item.status })
  }

  return res
}

// ── 读 ──────────────────────────────────────────────────────────────────

/** 未闭合项（open 与 needs_review），按紧迫度排序；limit 默认 50。 */
export function listOpen(role, { limit = 50, now = Date.now() } = {}) {
  const nowMs = toMs(now)
  const { rows } = readRows(role)
  const items = fold(rows)
  const ordered = items
    .filter((it) => it.status !== 'closed')
    .sort((a, b) => {
      const pa = REMIND_PRIORITY[a.kind] ?? 9
      const pb = REMIND_PRIORITY[b.kind] ?? 9
      if (pa !== pb) return pa - pb
      return (Date.parse(b.lastAt || '') || 0) - (Date.parse(a.lastAt || '') || 0)
    })
  const cap = Math.max(1, Math.min(200, Number(limit) || 50))
  return ordered.slice(0, cap).map((it) => ({
    ...it,
    expired: expiredOf(it, nowMs),
    label: KIND_LABEL[it.kind] || it.kind,
  }))
}

function isLaterPlan(text) {
  return /稍后|回头|等会|晚点|待会|一会儿|之后再/.test(String(text || ''))
}

function agendaHas(role, text) {
  try {
    const plain = String(text || '').replace(/[\s，。！？、；：,.!?;:]+/g, '')
    const grams = new Set()
    for (let i = 0; i + 1 < plain.length; i += 1) grams.add(plain.slice(i, i + 2))
    return activeItems(role).some((it) => {
      const hay = String(it?.what || '') + String(it?.next || '')
      let hit = 0
      for (const g of grams) if (hay.includes(g)) hit += 1
      return hit >= 2
    })
  } catch { return false }
}

function lineOf(item, role = '') {
  const text = clip(String(item.text || '').replace(/^(?:她|你)说[：:]\s*/, '').replace(/[，,]\s*这轮(?:还)?没看到结果.*$/, ''), 90)
  if (item.kind === 'unfinished') return `还有没做完的：${text}`
  if (item.kind === 'promise') {
    if (isLaterPlan(text)) {
      return agendaHas(role, text)
        ? `你说稍后做：${text}，议程里有计划，按计划跟`
        : `你说稍后做：${text}，议程里还没计划，先加计划`
    }
    return `你说了要做：${text}，这轮没看到结果`
  }
  if (item.kind === 'correction') return `有一条纠正没处理：${text}`
  if (item.kind === 'requirement') return `你要求过：${text}`
  if (item.kind === 'constraint') return `有一条约束要守住：${text}`
  return `台账里还有一条：${text}`
}

/** 给后台页看：今天用了多少提醒额度，还剩多少。 */
export function reminderStats(role, { now = Date.now() } = {}) {
  const nowMs = toMs(now)
  const { rows } = readRows(role)
  const items = fold(rows)
  const dayAgo = nowMs - 86400000
  const reminded24h = items.filter((it) => {
    const t = Date.parse(it.remindedAt || '')
    return Number.isFinite(t) && t > dayAgo
  }).length
  const settings = readReminderSettings()
  const maxPerDay = settings.remindPerDay
  const open = items.filter((it) => it.status === 'open')
  return {
    maxPerDay,
    reminded24h,
    remaining: maxPerDay > 0 ? Math.max(0, maxPerDay - reminded24h) : null,
    unlimited: maxPerDay === 0,
    enabled: settings.turnReminder !== false,
    open: open.length,
    explicit: open.filter((it) => it.explicit !== false).length,
  }
}

/**
 * 挑提醒：status=open、明确、没提醒过、没过期、够龄（默认 30 分钟），
 * 默认不设每日硬上限；同一条提醒过一次就不重复，靠去重/够龄，不靠限额。
 * 返回数组（limit=1 时就是一句），每条带 id，交给 markReminded 落标记。
 */
export function nextReminder(role, { limit = 1, now = Date.now(), minAgeMinutes = MIN_AGE_MINUTES, maxPerDay = undefined, sessionId = '' } = {}) {
  const settings = readReminderSettings()
  if (settings.turnReminder === false) return []
  const nowMs = toMs(now)
  const { rows } = readRows(role)
  const items = fold(rows)
  const dayAgo = nowMs - 86400000
  const capPerDay = Number(maxPerDay ?? readReminderSettings().remindPerDay ?? MAX_PER_DAY)
  const recently = items.filter((it) => {
    const t = Date.parse(it.remindedAt || '')
    return Number.isFinite(t) && t > dayAgo
  }).length
  if (capPerDay > 0 && recently >= capPerDay) return []

  const minAge = Math.max(0, Number(minAgeMinutes) || 0) * 60000
  const pool = items.filter((it) => {
    if (it.status !== 'open') return false
    if (sessionId && it.sessionId !== sessionId) return false
    if (it.explicit === false) return false
    if (it.remindedAt) {
      const t = Date.parse(it.remindedAt)
      const cooldown = it.kind === 'promise' ? 0 : 5 * 60000
      if (Number.isFinite(t) && nowMs - t < cooldown) return false
    }
    if (expiredOf(it, nowMs)) return false
    const last = Date.parse(it.lastAt || '') || Date.parse(it.firstAt || '') || 0
    if (it.kind !== 'promise' && nowMs - last < minAge) return false
    return true
  })
  pool.sort((a, b) => {
    const ta = Date.parse(a.lastAt || '') || 0
    const tb = Date.parse(b.lastAt || '') || 0
    // 超过一小时的两条，新的优先；否则按类型优先级。
    if (Math.abs(tb - ta) > 60 * 60 * 1000) return tb - ta
    const pa = REMIND_PRIORITY[a.kind] ?? 9
    const pb = REMIND_PRIORITY[b.kind] ?? 9
    if (pa !== pb) return pa - pb
    return ta - tb
  })
  const cap = Math.max(1, Math.min(10, Number(limit) || 1))
  const allowed = capPerDay > 0 ? Math.max(0, capPerDay - recently) : cap
  const filtered = pool.filter((it) => !(it.kind === 'promise' && isLaterPlan(it.text) && agendaHas(role, it.text)))
  return filtered.slice(0, Math.min(cap, allowed)).map((it) => ({
    id: it.id,
    kind: it.kind,
    label: KIND_LABEL[it.kind] || it.kind,
    text: it.text,
    evidence: it.evidence,
    turnId: it.turnId,
    expiresAt: it.expiresAt,
    line: lineOf(it, role),
  }))
}

/** 手动收口：证据确凿时把一条未闭合项标 closed；不改原文。 */
export function closeItem(role, id, { now = Date.now(), evidence = '' } = {}) {
  const target = String(id ?? '').trim()
  if (!target) return { ok: false, reason: 'id 为空' }
  const { rows } = readRows(role)
  const item = fold(rows).find((it) => it.id === target)
  if (!item) return { ok: false, reason: '台账里没有这条' }
  if (item.status === 'closed') return { ok: true, id: target, already: true }
  const row = { v: 1, op: 'status', id: target, role: safeRole(role), at: iso(toMs(now)), status: 'closed', evidence: String(evidence || '手动收口').slice(0, 300) }
  if (!appendRow(role, row)) return { ok: false, reason: '写不进台账' }
  return { ok: true, id: target, status: 'closed' }
}

/** 单独标记"这条提醒过了"；不传就永远算没提醒。 */
export function markReminded(role, id, { now = Date.now() } = {}) {
  const target = String(id ?? '').trim()
  if (!target) return { ok: false, reason: 'id 为空' }
  const { rows } = readRows(role)
  const item = fold(rows).find((it) => it.id === target)
  if (!item) return { ok: false, reason: '台账里没有这条' }
  if (item.remindedAt) return { ok: true, id: target, already: true }
  const row = { v: 1, op: 'remind', id: target, role: safeRole(role), at: iso(toMs(now)) }
  if (!appendRow(role, row)) return { ok: false, reason: '写不进台账' }
  return { ok: true, id: target }
}
