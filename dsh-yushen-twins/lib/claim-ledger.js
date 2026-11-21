/* 标签
 * id: lib-claim-ledger
 * kind: module
 * summary: 结论账（append-only）：从她自己的明确文本里抽结论/方案/状态/取舍，落 runtime/<role>/claim-ledger.jsonl；同话题合并、冲突不覆盖、显式改口可更正，回答前只查相关话题。
 * tags: 结论账, 结论, 方案, 状态, 取舍, 冲突, 改口, 一致性, 回答前检查
 * created: 2026-11-17 21:30:00
 * changed: 2026-11-17 21:31:58
 * author: 大鱼·子会话
 * authority: 老板（2026-11-17：信箱"有用→要修→要删"前后矛盾，机制没在回答前发现；turn-ledger 只记任务/承诺，不记结论）
 * audience: 回答前的自检、下一轮会话、维护者
 * owner: 框架；append-only，旧结论不删、不静默覆盖
 * mutable: 可改判据/合并阈值；不许把"猜"写成结论，不许替她改成没说过的话
 * usage: record(role,{turnId,at,assistant|text,topic}) / checkAnswer(role,{text,topic}) / listClaims(role,{topic,status}) / extractClaims(text)
 * defaults: 每条结论最多 300 字；每段文本最多抽 8 条；同话题合并阈值：topic 相等/包含，或关键词重合度 ≥ 0.6
 * off: 没接任何调用点；checkAnswer 纯本地读账，不调模型、不读会话全文
 * why: 只记任务/承诺不够——"保留/删/改"这类结论前后打架时，得在回答之前就看见
 * result: 一条一行（append-only），读时折叠；冲突标 conflict 且两边都留，改口标 corrected
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 结论账 · 最小模块（2026-11-17）
//
// 规矩：
//   1. 只从**明确判断**里抽：原文得有"保留/删/改/修/要用/完成/不做/方案/决定/结论是"这类话；
//      问句、含糊（可能/也许/看情况）不记成硬结论——含糊的标 needs_review，不当冲突用。
//   2. 同话题（topic 相等/包含，或关键词重合）合并到一条；**方向相反**才标 conflict：
//      删 vs 保留/修/改/做/用，以及 保留 vs 改。冲突时两边都留（旧结论 status=conflict），
//      不静默覆盖，也不自动判谁赢。
//   3. 显式"改成/更正/之前说错了/改口"= 改口：旧结论标 corrected，另记新结论，不报冲突。
//   4. checkAnswer 只读该角色账里**相关话题**的条目，返回 {ok, conflicts, needsReview}；
//      不读会话全文、不调模型。回答之后若要落账，另调 record。
//   5. 坏行跳过；写不进去返回 ok:false，不假装成功。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

export const CLAIM_STATUSES = Object.freeze(['active', 'conflict', 'needs_review', 'corrected', 'superseded'])

const MAX_CLAIMS = 8
const MAX_CLAIM_CHARS = 300
const MAX_TOPIC_CHARS = 30
const MAX_KEYWORDS = 40
const MAX_OCCURRENCES = 8
const MAX_LIMIT = 200

const clip = (s, n = MAX_CLAIM_CHARS) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

/** 话题归一化：去掉标点和空白，只用于比较，不用于展示。 */
const norm = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/[\s，。！？、；：,.!?;:"'“”‘’（）()【】[\]]/g, '')

function toMs(value, fallback = Date.now()) {
  if (value === undefined || value === null || value === '') return fallback
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : fallback
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  const t = Date.parse(String(value))
  return Number.isFinite(t) ? t : fallback
}

const iso = (ms) => new Date(ms).toISOString()
const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10)

/** 角色 id 只用来拼目录；不合法就报错，不悄悄写到别处。 */
export function safeRole(role) {
  const id = String(role ?? '').trim()
  if (!id) throw new Error('claim-ledger：没有角色 id')
  return id.replace(/[\\/:*?"<>|\s]/g, '_').slice(0, 40)
}

/** DSH 家目录（每次调用现读环境变量，测试设 DSH_HOME 才能生效）。 */
export function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

/** 台账文件：~/.dsh/dayu/runtime/<role>/claim-ledger.jsonl。 */
export function ledgerFile(role) {
  return path.join(dshHome(), 'dayu', 'runtime', safeRole(role), 'claim-ledger.jsonl')
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

function newClaim(row) {
  const at = String(row.at || '')
  return {
    id: String(row.id || ''),
    role: String(row.role || ''),
    topic: String(row.topic || ''),
    claim: String(row.claim || ''),
    status: CLAIM_STATUSES.includes(row.status) ? row.status : 'active',
    action: String(row.action || ''),
    turnId: String(row.turnId || ''),
    at,
    firstAt: at,
    lastAt: at,
    evidence: String(row.evidence || ''),
    keywords: Array.isArray(row.keywords) ? row.keywords.slice(0, MAX_KEYWORDS) : [],
    conflictWith: String(row.conflictWith || ''),
    correctedFrom: String(row.correctedFrom || ''),
    statusAt: '',
    statusReason: String(row.reason || ''),
    seenCount: 1,
    occurrences: [{
      turnId: String(row.turnId || ''),
      at,
      claim: String(row.claim || ''),
      evidence: String(row.evidence || ''),
    }],
  }
}

function applyRow(items, row) {
  if (row.op === 'add') {
    if (!items.has(row.id)) items.set(row.id, newClaim(row))
    return
  }
  const it = items.get(row.id)
  if (!it) return
  const at = String(row.at || '')
  if (row.op === 'merge') {
    it.seenCount += 1
    it.claim = String(row.claim || it.claim)
    it.evidence = String(row.evidence || it.evidence)
    it.turnId = String(row.turnId || it.turnId)
    if (row.action) it.action = String(row.action)
    if (row.topic) it.topic = String(row.topic)
    if (Array.isArray(row.keywords) && row.keywords.length) {
      it.keywords = [...new Set([...(it.keywords || []), ...row.keywords])].slice(0, MAX_KEYWORDS)
    }
    it.lastAt = at || it.lastAt
    it.occurrences.push({
      turnId: String(row.turnId || ''),
      at,
      claim: String(row.claim || ''),
      evidence: String(row.evidence || ''),
    })
    if (it.occurrences.length > MAX_OCCURRENCES) it.occurrences = it.occurrences.slice(-MAX_OCCURRENCES)
    return
  }
  if (row.op === 'status') {
    if (CLAIM_STATUSES.includes(row.status)) it.status = row.status
    it.statusAt = at || it.statusAt
    if (row.reason) it.statusReason = String(row.reason)
    if (row.conflictWith) it.conflictWith = String(row.conflictWith)
    if (row.correctedFrom) it.correctedFrom = String(row.correctedFrom)
  }
}

function fold(rows) {
  const items = new Map()
  for (const row of rows) applyRow(items, row)
  return items
}

// ── 话题词 / 相似 ────────────────────────────────────────────────────────

const STOP_CHARS = '我你他她它的了着过把被给对向从和与跟同及或而但就都也还又很太更最是这那有在吗呢吧啊呀嘛哦嗯个些一请帮别让先再会要能可不没'

/** 话题关键词：汉字二元组 + 英文/数字词；只做粗判，不做语义理解。 */
export function topicWords(text) {
  const s = String(text ?? '').toLowerCase().replace(/[^0-9a-z\u4e00-\u9fa5]+/g, ' ')
  const out = new Set()
  for (const part of s.split(/\s+/)) {
    if (!part) continue
    if (/^[0-9]+$/.test(part)) continue
    if (/^[a-z0-9]+$/.test(part)) { if (part.length >= 3) out.add(part); continue }
    for (let i = 0; i + 1 < part.length; i += 1) {
      const bg = part.slice(i, i + 2)
      if (/^[0-9]/.test(bg)) continue
      let keep = true
      for (const ch of bg) { if (STOP_CHARS.includes(ch)) { keep = false; break } }
      if (keep) out.add(bg)
    }
  }
  return [...out].slice(0, MAX_KEYWORDS)
}

function similarity(a, b) {
  const A = new Set(a || [])
  const B = new Set(b || [])
  if (!A.size || !B.size) return 0
  let hit = 0
  for (const x of A) if (B.has(x)) hit += 1
  return hit / Math.min(A.size, B.size)
}

/** 是不是同一话题：相等、包含（至少 2 字），或关键词重合度 ≥ 0.6。 */
export function sameTopic(a, b) {
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.length >= 2 && nb.length >= 2 && (na.includes(nb) || nb.includes(na))) return true
  return similarity(topicWords(a), topicWords(b)) >= 0.6
}

// ── 判据：动作 / 话题 / 改口 ────────────────────────────────────────────

// [动作, 正则]；扫描时取"最早出现"的那个，同位置按本数组顺序。
const ACTION_RULES = [
  ['drop', /(?:删除|删掉|删了|删去|删|去掉|移除|废弃|放弃|取消|停用|关掉|干掉|砍掉|撤掉|作废|不用|不需要|不做|别再|不修|不改|不修改|不处理|不弄|不搞|不添加|不增加|不上线|不发布|不继续)/],
  ['keep', /(?:保留|留着|留下|别删|不删|不动|维持|继续用|照旧|原样|仍要|还要)/],
  ['reject', /(?:(?<!还)没用(?!过|了)|不重要|没啥用|没有用|不划算|没必要|不行)/],
  ['change', /(?:改成|改为|更正为|换成|替换为|调整|修改|重做|替换|改)/],
  ['fix', /(?:修复|修好|修|维护|补好|补齐)/],
  ['build', /(?:新增|添加|加上|增加|做|实现|搭建|写|补)/],
  ['use', /(?:要用|采用|使用|上线|发布|启用|用)/],
  ['decide', /(?:决定|定了|就按|方案是|结论是|选择)/],
]

const ORDER = new Map(ACTION_RULES.map(([a], i) => [a, i]))

// 只记"明确判断"：没有这些词就不算结论。
const JUDGE_RE = /(?:结论|方案|决定|原则|本质|目标|重点|关键|问题|结果)是|(?:就|应该|肯定|其实|主要|关键|重点)是|有用|没用|重要|不重要|不需要|不用|不动|可以|应该|需要|必须|决定|定了|就按|保留|删|去掉|移除|废弃|放弃|取消|停用|改|修|做|完成|做完|搞定|通过|上线|发布|提交|采用|添加|增加|选择|优先|取舍|调整为/

const HEDGE_RE = /(?:可能|也许|大概|看情况|好像|似乎|或许|不一定|考虑一下|再想想|有待)/

const RETRACT_RE = /(?:之前|刚才|上次|上一条)?(?:说错|讲错|说错话|讲错话|说错了|讲错了|更正|纠正|改口|收回刚才的话|收回上一句|收回之前的话)|不是[^，,。；;]{1,24}?[，,]\s*(?:而是|是)|(?:不|别)是(?:要|打算|准备)?(?:删|改|修)[^，,。；;]{0,12}[，,]\s*(?:而是|是)/

// "不用删/没必要改/不打算修" = 不做的动作，方向其实是保留，别记成删。
const NO_NEED_RE = /(?:不用|不需要|不必|没必要|无需|不打算|不想|不准备)(?:再)?(?:删|改|修|动|处理|折腾|碰)/

// "改成/改为/决定/方案是"后面的具体动作优先（"决定删掉"算删，不算"决定"）。
const PREFER_TAIL_RE = /(?:改成|改为|换成|替换为|更正为|变成|决定|定了|就按|方案是|结论是|选择)/

const ACTION_LABEL = Object.freeze({
  drop: '删除/不用',
  keep: '保留',
  reject: '没用/没必要',
  change: '改',
  fix: '修',
  build: '要做/加',
  use: '要用',
  decide: '决定',
  '': '没明说',
})

const TOPIC_LEAD = /^(?:关于|对于|针对|至于|然后|另外|还有|所以|因此|但是|不过|其实|我觉得|我认为|我们|我|你|你们|他们|她们|这个|那个|这些|那些|这|那|它|把|将|给|对|在|是|要|需要|应该|得|就|还是|先|再|也|都|只)/

const GENERIC_TOPICS = new Set(['方案', '决定', '结论', '结果', '目标', '重点', '关键', '原则', '本质', '计划', '安排'])

function cleanTopic(s) {
  let t = String(s ?? '').replace(/[\s，。！？、；：,.!?;:"'“”‘’（）()【】[\]]/g, '')
  for (let i = 0; i < 4; i += 1) {
    const next = t.replace(TOPIC_LEAD, '')
    if (next === t) break
    t = next
  }
  t = t.replace(/(?:的话|了吧|了|吧|吗|呢|啊|呀|嘛|哦|嗯)+$/, '')
  t = t.replace(/(?:可能|可以|应该|需要|必须|大概|也许|或许|通常|一般|决定|选择|觉得|认为|定为|设为|改为|还是|就是)+$/, '')
  t = t.replace(/(?:是|的|有|要|需要|应该|得|就|把|将|给|不)+$/, '')
  return t.slice(0, MAX_TOPIC_CHARS)
}

function actionAt(text) {
  let best = null
  for (const [action, re] of ACTION_RULES) {
    const m = re.exec(text)
    if (!m) continue
    const hit = { action, index: m.index, length: m[0].length }
    if (!best || hit.index < best.index || (hit.index === best.index && ORDER.get(action) < ORDER.get(best.action))) best = hit
  }
  return best
}

/** 判定这句话的"动作"和位置；认不出动作但认得出判断词时 action=''。 */
function firstHit(text) {
  const noNeed = NO_NEED_RE.exec(text)
  if (noNeed) return { action: 'keep', index: noNeed.index, length: noNeed[0].length, marker: noNeed[0] }
  const prefer = PREFER_TAIL_RE.exec(text)
  if (prefer) {
    const tail = text.slice(prefer.index + prefer[0].length)
    const tailHit = actionAt(tail)
    if (tailHit) {
      return {
        action: tailHit.action,
        index: prefer.index,
        length: prefer[0].length + tailHit.index + tailHit.length,
        marker: prefer[0] + tail.slice(0, tailHit.index + tailHit.length),
      }
    }
  }
  const hit = actionAt(text)
  if (hit) return { ...hit, marker: text.slice(hit.index, hit.index + hit.length) }
  const judge = JUDGE_RE.exec(text)
  if (!judge) return null
  return { action: '', index: judge.index, length: judge[0].length, marker: judge[0] }
}

function topicFor(text, hit) {
  const head = cleanTopic(text.slice(0, hit.index))
  const tail = cleanTopic(text.slice(hit.index + hit.length))
  const generic = (t) => !norm(t) || norm(t).length < 2 || GENERIC_TOPICS.has(norm(t))
  if (!generic(head)) return head
  if (!generic(tail)) return tail
  return head || tail
}

function isQuestion(seg, clause) {
  if (seg.question) return true
  return /[？?]|(?:吗|呢)\s*$|^(?:要不要|是否|是不是|能不能|该不该|有没有)/.test(clause)
}

function stripRetractLead(clause) {
  const s = String(clause)
  const a = s.replace(/^[^，,。；;:：]{0,20}?(?:说错|讲错|说错话|讲错话|说错了|讲错了|更正|纠正|改口|收回刚才的话|收回上一句)[^，,。；;:：]{0,12}[，,：:]?/, '')
  if (a !== s) return a.trim()
  const b = /^([^，,。；;:：]{0,20}?)(?:不|别)是[^，,。；;:：]{0,24}[，,：:]\s*(?:而是|是)?(.*)$/.exec(s)
  if (b) return `${b[1] || ''}${b[2] || ''}`.trim()
  return s.trim()
}

/** 按句号/问号/分号/换行切；问句单独标记，后面丢掉。 */
function splitClauses(text) {
  const out = []
  const parts = String(text ?? '').split(/([。！？!?；;\n]+)/)
  for (let i = 0; i < parts.length; i += 2) {
    const raw = parts[i]
    const delim = parts[i + 1] || ''
    const cleaned = String(raw || '')
      .replace(/^[\s>#*\-–—·•\d、)）]+/, '')
      .replace(/[：:]\s*$/, '')
      .trim()
    if (!cleaned) continue
    out.push({ text: cleaned, question: /[？?]/.test(delim) })
  }
  return out
}

/**
 * 抽结论（纯函数，不读不写）。
 * 只从 assistant 文本用；每条带 topic/claim/action/status/evidence/turnId/at。
 */
export function extractClaims(text, { turnId = '', at = Date.now(), topic = '' } = {}) {
  const atMs = toMs(at)
  const when = iso(atMs)
  const out = []
  for (const seg of splitClauses(text)) {
    if (out.length >= MAX_CLAIMS) break
    const clause = clip(seg.text, MAX_CLAIM_CHARS)
    if (clause.length < 3) continue
    if (isQuestion(seg, clause)) continue
    // "还没用过/没用上"是经历，不是结论方向，别记成"要用"
    if (/(?:还没|尚未|没有|没)(?:用|试)过|没用上|用不上|没试过/.test(clause)) continue

    const retract = RETRACT_RE.test(clause)
    const work = retract ? stripRetractLead(clause) : clause
    if (work.length < 3) continue

    const hit = firstHit(work)
    if (!hit) continue

    const topicText = clip(topic || topicFor(work, hit), MAX_TOPIC_CHARS)
    if (!topicText) continue

    const hedged = HEDGE_RE.test(work)
    const status = hedged ? 'needs_review' : 'active'
    const claimText = clip(clause, MAX_CLAIM_CHARS)

    out.push({
      topic: topicText,
      topicKey: norm(topicText),
      claim: claimText,
      evidence: claimText,
      action: hit.action,
      marker: hit.marker,
      retract,
      explicit: !hedged,
      status,
      turnId: String(turnId || ''),
      at: when,
      atMs,
      keywords: [...new Set([...topicWords(topicText), ...topicWords(claimText)])].slice(0, MAX_KEYWORDS),
    })
  }
  return out
}

// ── 冲突 / 写 ────────────────────────────────────────────────────────────

/** 方向相反：删 vs 其它；保留 vs 改；说"没用" vs 保留/要用/修/做。没明说方向的不算冲突。 */
function conflictingActions(a, b) {
  if (!a || !b) return false
  if ((a === 'drop') !== (b === 'drop')) return true
  if ((a === 'keep' && b === 'change') || (a === 'change' && b === 'keep')) return true
  if ((a === 'reject') !== (b === 'reject')) {
    const other = a === 'reject' ? b : a
    if (['keep', 'use', 'fix', 'build'].includes(other)) return true
  }
  return false
}

function baseId(role, cand) {
  return `cl-${sha(`${safeRole(role)}|${norm(cand.topic)}|${cand.action}|${norm(cand.claim).slice(0, 80)}`)}`
}

function uniqueId(base, items) {
  if (!items.has(base)) return base
  for (let n = 2; n < 1000; n += 1) {
    const id = `${base}-${n}`
    if (!items.has(id)) return id
  }
  return `${base}-${Date.now().toString(36)}`
}

function appendRow(role, row) {
  try {
    const file = ledgerFile(role)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${JSON.stringify(row)}\n`, { encoding: 'utf8', mode: 0o600 })
    return true
  } catch { return false }
}

function sameTurnSameClaim(items, cand) {
  if (!cand.turnId) return false
  for (const it of items.values()) {
    if (it.turnId !== cand.turnId) continue
    if (it.status === 'corrected' || it.status === 'superseded') continue
    if (norm(it.claim) === norm(cand.claim)) return true
  }
  return false
}

function pickOld(c) {
  return { id: c.id, topic: c.topic, claim: c.claim, status: c.status, action: c.action, at: c.at, turnId: c.turnId, evidence: c.evidence }
}

/**
 * 记一条/多条结论。
 * @returns {{ok:boolean, added:number, merged:number, conflicts:number, retracted:number,
 *            skipped:number, badLines:number, items:Array<{id:string,topic:string,status:string}>, error?:string}}
 */
export function record(role, { turnId = '', at = Date.now(), assistant = '', text = '', topic = '' } = {}) {
  safeRole(role)
  const whenStart = toMs(at)
  const when = iso(whenStart)
  const source = String(assistant || text || '')
  const res = { ok: true, added: 0, merged: 0, conflicts: 0, retracted: 0, skipped: 0, badLines: 0, items: [], error: '' }
  if (!source.trim()) return res

  const candidates = extractClaims(source, { turnId, at: whenStart, topic })
  if (!candidates.length) return res

  const { rows, bad } = readRows(role)
  res.badLines = bad
  const items = fold(rows)

  for (const cand of candidates) {
    if (sameTurnSameClaim(items, cand)) { res.skipped += 1; continue }

    // 1) 显式改口：同话题未结案的旧结论全部标 corrected，再记新结论；不报冲突
    if (cand.retract) {
      const related = [...items.values()].filter((it) => it.status !== 'corrected' && it.status !== 'superseded' && sameTopic(it.topic, cand.topic))
      let corrected = 0
      for (const old of related) {
        const row = {
          v: 1, op: 'status', id: old.id, role: safeRole(role), status: 'corrected',
          at: when, turnId: String(turnId || ''), reason: 'explicit-retraction', evidence: cand.evidence,
        }
        if (appendRow(role, row)) { applyRow(items, row); corrected += 1 }
      }
      res.retracted += corrected

      const id = uniqueId(baseId(role, cand), items)
      const row = {
        v: 1, op: 'add', id, role: safeRole(role), topic: cand.topic, claim: cand.claim,
        status: 'active', action: cand.action, turnId: String(turnId || ''), at: when,
        evidence: cand.evidence, keywords: cand.keywords,
        correctedFrom: related.length ? related[0].id : '',
      }
      if (!appendRow(role, row)) { res.ok = false; res.error = '写不进结论账'; continue }
      applyRow(items, row)
      res.added += 1
      res.items.push({ id, topic: cand.topic, status: 'active' })
      continue
    }

    // 2) 同话题的现有有效结论
    const same = [...items.values()].filter((it) => it.status === 'active' && sameTopic(it.topic, cand.topic))

    // 2a) 方向相反 → 标冲突，两边都留
    const target = same.find((it) => conflictingActions(it.action, cand.action)) || null
    if (target) {
      const id = uniqueId(baseId(role, cand), items)
      const reason = `同一话题「${cand.topic}」：旧结论是「${ACTION_LABEL[target.action] || target.action}」，新结论是「${ACTION_LABEL[cand.action] || cand.action}」`
      const addRow = {
        v: 1, op: 'add', id, role: safeRole(role), topic: cand.topic, claim: cand.claim,
        status: 'conflict', action: cand.action, turnId: String(turnId || ''), at: when,
        evidence: cand.evidence, keywords: cand.keywords, conflictWith: target.id, reason,
      }
      if (!appendRow(role, addRow)) { res.ok = false; res.error = '写不进结论账'; continue }
      const statusRow = {
        v: 1, op: 'status', id: target.id, role: safeRole(role), status: 'conflict',
        at: when, turnId: String(turnId || ''), conflictWith: id, reason, evidence: cand.evidence,
      }
      if (!appendRow(role, statusRow)) { res.ok = false; res.error = '写不进结论账'; continue }
      applyRow(items, addRow)
      applyRow(items, statusRow)
      res.added += 1
      res.conflicts += 1
      res.items.push({ id, topic: cand.topic, status: 'conflict' })
      continue
    }

    // 2b) 同话题、方向一致 → 合并（不新建一条）
    if (same.length) {
      const mergeTarget = same[same.length - 1]
      const row = {
        v: 1, op: 'merge', id: mergeTarget.id, role: safeRole(role), topic: mergeTarget.topic,
        claim: cand.claim, evidence: cand.evidence, action: cand.action || mergeTarget.action,
        keywords: cand.keywords, at: when, turnId: String(turnId || ''),
      }
      if (!appendRow(role, row)) { res.ok = false; res.error = '写不进结论账'; continue }
      applyRow(items, row)
      res.merged += 1
      res.items.push({ id: mergeTarget.id, topic: mergeTarget.topic, status: mergeTarget.status })
      continue
    }

    // 3) 新的一条
    const id = uniqueId(baseId(role, cand), items)
    const row = {
      v: 1, op: 'add', id, role: safeRole(role), topic: cand.topic, claim: cand.claim,
      status: cand.status, action: cand.action, turnId: String(turnId || ''), at: when,
      evidence: cand.evidence, keywords: cand.keywords,
    }
    if (!appendRow(role, row)) { res.ok = false; res.error = '写不进结论账'; continue }
    applyRow(items, row)
    res.added += 1
    res.items.push({ id, topic: cand.topic, status: cand.status })
  }

  return res
}

// ── 回答前检查（只读、不调模型） ────────────────────────────────────────

/**
 * 回答前自检：只查相关话题的结论账，不读会话全文、不调模型、不写账。
 * @param {string} role
 * @param {{text?:string, topic?:string}} opts text=这次准备说/正在说的话；topic=明确话题（可省）
 * @returns {{ok:boolean, conflicts:Array<{old:object,new:object,reason:string}>, needsReview:boolean}}
 */
export function checkAnswer(role, { text = '', topic = '' } = {}) {
  safeRole(role)
  const draft = String(text || '')
  const textClaims = extractClaims(draft, { at: Date.now() })
  const topics = new Set()
  if (String(topic || '').trim()) topics.add(String(topic).trim())
  for (const c of textClaims) if (c.topic) topics.add(c.topic)

  // 显式改口：不报冲突（改口要靠 record 落账）
  if (RETRACT_RE.test(draft)) return { ok: true, conflicts: [], needsReview: false }
  if (!topics.size) return { ok: true, conflicts: [], needsReview: false }

  const { rows } = readRows(role)
  const claims = [...fold(rows).values()]
  const relevant = claims.filter((c) => [...topics].some((t) => sameTopic(t, c.topic)))
  const conflicts = []
  const seen = new Set()

  // 1) 账里已有、还没解决的冲突（只报相关话题）
  for (const c of relevant) {
    if (c.status !== 'conflict' || !c.conflictWith) continue
    const other = claims.find((x) => x.id === c.conflictWith)
    if (!other) continue
    const key = [c.id, other.id].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)
    const old = (Date.parse(c.at || '') || 0) <= (Date.parse(other.at || '') || 0) ? c : other
    const nw = old === c ? other : c
    conflicts.push({
      old: pickOld(old),
      new: pickOld(nw),
      reason: `账上两条结论冲突还没解决：「${clip(old.claim, 80)}」vs「${clip(nw.claim, 80)}」`,
    })
  }

  // 2) 这次要说的话，和账上有效结论方向相反
  for (const nc of textClaims) {
    if (!nc.action) continue
    for (const c of relevant) {
      if (c.status !== 'active') continue
      if (!sameTopic(nc.topic, c.topic)) continue
      if (!conflictingActions(c.action, nc.action)) continue
      const key = `fresh|${c.id}|${norm(nc.claim)}`
      if (seen.has(key)) continue
      seen.add(key)
      conflicts.push({
        old: pickOld(c),
        new: { id: '', topic: nc.topic, claim: nc.claim, status: 'active', action: nc.action, at: nc.at, turnId: nc.turnId, evidence: nc.evidence },
        reason: `同一话题「${nc.topic}」：账上记的是「${ACTION_LABEL[c.action] || c.action}」，这次要说的是「${ACTION_LABEL[nc.action] || nc.action}」`,
      })
    }
  }

  return { ok: conflicts.length === 0, conflicts, needsReview: conflicts.length > 0 }
}

// ── 读（可追溯旧结论） ───────────────────────────────────────────────────

/**
 * 看结论账：可按话题/状态过滤；默认按最近出现排序。
 * @param {{topic?:string, status?:(string|string[]), limit?:number}} opts
 */
export function listClaims(role, { topic = '', status = '', limit = 50 } = {}) {
  const { rows } = readRows(role)
  let claims = [...fold(rows).values()]
  if (String(topic || '').trim()) claims = claims.filter((c) => sameTopic(topic, c.topic))
  const want = status ? (Array.isArray(status) ? status : [status]) : []
  if (want.length) claims = claims.filter((c) => want.includes(c.status))
  claims.sort((a, b) => (Date.parse(b.lastAt || '') || 0) - (Date.parse(a.lastAt || '') || 0))
  const cap = Math.max(1, Math.min(MAX_LIMIT, Number(limit) || 50))
  return claims.slice(0, cap).map((c) => ({
    ...c,
    label: ACTION_LABEL[c.action] || c.action || '',
  }))
}
