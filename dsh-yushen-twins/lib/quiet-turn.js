/* 标签
 * id: lib-quiet-turn
 * kind: module
 * summary: 「这轮我不说」的出口 + 每次说/不说的判断账；过期自动失效，不掷骰子。
 * audience: 她（能说不）、桥（发之前查）、面板
 * owner: 她（写不写、写什么都归她）；机制归框架
 * mutable: 可改（记录字段只增不减；过期时长 1–60 分钟）
 * defaults: 默认 10 分钟失效；最多 60 分钟
 * usage: markQuiet 写"这轮不回"；readQuiet 查；recordReplyDecision 记判断；lastReplyDecisionLine 给简报一行
 * off: 她永远不写就等于没有；桥那边不再查它即可
 */

// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-02 16:25｜大鱼·子会话（工作台）｜授权：主人（本次任务书：她这轮能自己决定说不说）｜lib/quiet-turn.js:1-237｜新增：「这轮我不说」的出口（quiet-turn.json）+ 每次说/不说的判断账（reply-decisions.jsonl）+ 简报里那句「上一轮你怎么判断的」｜为什么：桥一直是「被唤醒就回」，唯一的不回是 skipProbability 掷骰子——那不是她的判断，也没地方可回看｜验证：node scripts/test-quiet.mjs 全过；scripts/regression.mjs 新增断言全绿；桥侧发前查 quiet 的接线有静态断言｜可改：过期时长只许 1–60 分钟；记录字段只增不删（at/channel/decided/why/textLen/costYuan 六个是基线）
//
// 她这轮说不说，是她的事。
//
// 以前桥只有一条沉默出口：`skipProbability` 掷骰子。那是随机，不是判断；
// 而且沉默之后什么都不留，一周后没人算得出「她到底沉默了多少次、为什么」。
//
// 这里补三件很小的事，都不调模型、不联网：
//   ① quiet-turn.json —— 她可以写一句「这轮我不回，因为 X」，桥在发之前查它，命中就不发；
//      过期自动失效（默认 10 分钟，最多 60 分钟），不是概率。
//   ② reply-decisions.jsonl —— 每次「说 / 不说」都留一条轻量记录：
//      { at, channel, decided, why, textLen, costYuan, ... }。
//      一周后能算：沉默占比、沉默理由分布。
//   ③ lastReplyDecisionLine() —— 给简报一行（≤60 字）：
//      「上一轮你选择说/不说，因为…；这轮你也可以选。」
//      不是命令，是让她知道选择权是连续的。
//
// 边界：文件写不进去不能把回复链路带塌——所有写操作都返回 {ok:false}，不抛。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { dshHome } from './paths.js'
import { localISO, now as clockNow } from './clock.js'

/** 默认 / 上限（分钟）。她说「这轮」，一轮通常就几分钟；想静久一点可以到 60。 */
export const QUIET_DEFAULT_MINUTES = 10
export const QUIET_MAX_MINUTES = 60
/** 判断记录里只认这两种。 */
export const DECISIONS = Object.freeze(['speak', 'quiet'])

/** 运行时根目录：~/.dsh/dayu/runtime（quiet-turn.json 和 reply-decisions.jsonl 都在这）。 */
export function runtimeRoot() { return path.join(dshHome(), 'dayu', 'runtime') }
export function quietTurnFile() { return path.join(runtimeRoot(), 'quiet-turn.json') }
export function replyDecisionsFile() { return path.join(runtimeRoot(), 'reply-decisions.jsonl') }

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}

/** 原子写：先写临时文件再改名。桥随时可能在读，不能让它读到半个 JSON。 */
function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

function readJsonl(file) {
  const rows = []
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      try { rows.push(JSON.parse(line)) } catch { /* 坏行跳过，不让一行脏数据毁掉整本账 */ }
    }
  } catch { /* 还没有这本账 */ }
  return rows
}

/**
 * 她说「这轮我不回，因为 X」。
 *
 * why 是必填的——不是审查她，是这条记录将来要能回答「她为什么沉默」。
 * scope：all = 这个角色的所有 QQ 会话；也可以写具体 key（group:123 / private:456）。
 * 默认 10 分钟；超过 60 分钟按 60 算（不是永久静音）。
 *
 * @returns {{ok:boolean, at?:string, role?:string, scope?:string, why?:string, minutes?:number, expiresAt?:string, error?:string}}
 */
export function markQuiet(role, { why = '', minutes = QUIET_DEFAULT_MINUTES, scope = 'all', now = Date.now() } = {}) {
  const reason = String(why || '').trim()
  if (!reason) return { ok: false, error: '得说清为什么不说：why 不能空' }
  let min = Number(minutes)
  if (!Number.isFinite(min) || min <= 0) min = QUIET_DEFAULT_MINUTES
  min = Math.max(1, Math.min(QUIET_MAX_MINUTES, Math.round(min)))
  const atMs = Number(now) || Date.now()
  const row = {
    at: localISO(new Date(atMs)),
    role: String(role || 'dayu'),
    scope: String(scope || 'all').trim() || 'all',
    why: reason.slice(0, 200),
    minutes: min,
    expiresAt: localISO(new Date(atMs + min * 60000)),
  }
  try {
    writeJsonAtomic(quietTurnFile(), row)
    return { ok: true, ...row }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

/**
 * 桥在发之前查这个：现在命中「这轮我不说」吗？
 *
 * @param {{now?:number, role?:string, scope?:string}} opts
 *   scope 传会话 key（桥一定传）。传空 = 不按会话过滤（只给状态查看用）。
 *   如果存的是具体会话、查询没带 key，按「不命中」处理——宁可多发一句，不要静音错人。
 * @returns {{active:boolean, reason:string, at?:string, role?:string, scope?:string, why?:string, expiresAt?:string, remainingMs?:number, expired?:boolean}}
 */
export function readQuiet({ now = Date.now(), role = '', scope = '' } = {}) {
  const q = readJson(quietTurnFile())
  if (!q || typeof q !== 'object') return { active: false, reason: '没有标记' }
  const exp = Date.parse(String(q.expiresAt || '')) || 0
  const base = {
    at: q.at, role: q.role, scope: q.scope, why: q.why, expiresAt: q.expiresAt,
    remainingMs: Math.max(0, exp - now), expired: !(now < exp),
  }
  if (!(now < exp)) return { active: false, reason: '已过期', ...base }
  if (role && q.role && String(q.role) !== String(role)) return { active: false, reason: '不是这个角色', ...base }
  const sc = String(q.scope || 'all')
  if (sc !== 'all') {
    if (!scope) return { active: false, reason: '只对某个会话生效（查询没带 key）', ...base }
    if (sc !== String(scope)) return { active: false, reason: '不是这个会话', ...base }
  }
  return { active: true, reason: '命中', ...base }
}

/** 查看她自己写的标记（不看会话匹配，只看时间和内容）。 */
export function quietStatus(role = '', { now = Date.now() } = {}) {
  const q = readJson(quietTurnFile())
  if (!q || typeof q !== 'object') return { ok: true, quiet: null, active: false }
  const exp = Date.parse(String(q.expiresAt || '')) || 0
  return {
    ok: true,
    quiet: q,
    active: now < exp && (!role || !q.role || String(q.role) === String(role)),
    expired: !(now < exp),
    remainingMs: Math.max(0, exp - now),
  }
}

/**
 * 收回「这轮不说」：她改主意了，或者想马上恢复。
 * 不删文件——写一条已过期的收回标记（at/why 都留着，看得出是她自己收回的）。
 */
export function clearQuiet(role = '', { now = Date.now() } = {}) {
  const file = quietTurnFile()
  const q = readJson(file)
  if (!q) return { ok: true, cleared: false, note: '本来就没有标记' }
  if (role && q.role && String(q.role) !== String(role)) {
    return { ok: false, error: `这条标记是 ${q.role} 的，不是你的` }
  }
  const atMs = Number(now) || Date.now()
  const row = {
    at: localISO(new Date(atMs)),
    role: String(q.role || role || 'dayu'),
    scope: String(q.scope || 'all'),
    why: '（已收回）',
    minutes: 0,
    expiresAt: localISO(new Date(atMs - 1000)),
  }
  try {
    writeJsonAtomic(file, row)
    return { ok: true, cleared: true }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

/**
 * 每次「说 / 不说」留一条。零模型、零网络，只追加一行。
 *
 * 六个基线字段：at, channel, decided, why, textLen, costYuan。
 * 另带 role / key / source，方便按人、按会话、按来源复盘（source 只增不改）。
 *
 * @returns {{ok:boolean, row?:object, error?:string}}
 */
export function recordReplyDecision({
  role = 'dayu',
  channel = 'qq',
  key = '',
  decided = '',
  why = '',
  textLen = 0,
  costYuan = 0,
  source = 'plugin',
  at = clockNow(),
} = {}) {
  const verdict = String(decided || '').trim()
  if (!DECISIONS.includes(verdict)) return { ok: false, error: `decided 只能是 ${DECISIONS.join(' / ')}` }
  const len = Math.max(0, Math.round(Number(textLen) || 0))
  const cost = Math.max(0, Number(costYuan) || 0)
  const row = {
    at: localISO(at instanceof Date ? at : new Date(at)),
    channel: String(channel || 'qq').slice(0, 40),
    decided: verdict,
    why: String(why || '').slice(0, 200),
    textLen: len,
    costYuan: Number(cost.toFixed(6)),
    role: String(role || 'dayu'),
    key: String(key || ''),
    source: String(source || 'plugin').slice(0, 40),
  }
  try {
    fs.mkdirSync(path.dirname(replyDecisionsFile()), { recursive: true })
    fs.appendFileSync(replyDecisionsFile(), `${JSON.stringify(row)}\n`, 'utf8')
    return { ok: true, row }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

/** 回看最近几条判断（新的在后）。 */
export function readReplyDecisions({ limit = 50, role = '' } = {}) {
  const rows = readJsonl(replyDecisionsFile()).filter((r) => !role || String(r.role || 'dayu') === String(role))
  return rows.slice(-Math.max(1, Number(limit) || 50))
}

/**
 * 一周后要算的两个数：沉默占比、沉默理由分布。
 * sinceMs 默认 7 天。
 */
export function decisionStats({ sinceMs = 7 * 86400e3, now = Date.now(), role = '' } = {}) {
  const from = now - Math.max(0, Number(sinceMs) || 0)
  const rows = readJsonl(replyDecisionsFile()).filter((r) => {
    if (role && String(r.role || 'dayu') !== String(role)) return false
    const t = Date.parse(String(r.at || ''))
    return Number.isFinite(t) ? t >= from : false
  })
  const t = { total: rows.length, speak: 0, quiet: 0 }
  const reasons = new Map()
  for (const r of rows) {
    if (r.decided === 'quiet') {
      t.quiet += 1
      const why = String(r.why || '').trim() || '（没写理由）'
      reasons.set(why, (reasons.get(why) || 0) + 1)
    } else if (r.decided === 'speak') {
      t.speak += 1
    }
  }
  const topReasons = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([why, n]) => ({ why, n }))
  return {
    ...t,
    silenceRate: t.total ? Number((t.quiet / t.total).toFixed(3)) : null,
    topReasons,
  }
}

/**
 * 简报里那一行：上一轮怎么判断的，这轮也可以选。
 * 不超过 maxChars（默认 60 字）。没有记录就不编，只说「还没留判断」。
 */
export function lastReplyDecisionLine(role = '', { maxChars = 60 } = {}) {
  const limit = Math.max(20, Number(maxChars) || 60)
  const rows = readReplyDecisions({ limit: 1, role })
  const last = rows[rows.length - 1]
  const tail = '；这轮你也可以选。'
  if (!last) {
    const empty = '上一轮你还没留判断；这轮你也可以选。'
    return empty.length <= limit ? empty : empty.slice(0, limit)
  }
  const label = last.decided === 'quiet' ? '不说' : '说'
  const head = `上一轮你选择${label}，因为`
  const why = String(last.why || '').trim().replace(/\s+/g, ' ')
  if (!why) {
    const bare = `上一轮你选择${label}（没写理由）${tail}`
    return bare.length <= limit ? bare : bare.slice(0, limit)
  }
  const room = Math.max(4, limit - head.length - tail.length)
  const shown = why.length > room ? `${why.slice(0, Math.max(1, room - 1))}…` : why
  const line = `${head}${shown}${tail}`
  return line.length <= limit ? line : line.slice(0, limit)
}
