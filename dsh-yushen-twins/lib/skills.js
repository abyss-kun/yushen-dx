/* 标签
 * id: lib-skills
 * kind: module
 * summary: 做法账本——一条「遇到 X 就 Y」的方法，带分数、等级、状态；错题/判断/任务/事故只挂 id，不抄原文。
 * tags: 做法, 经验, 错题, 判断, 事故, 分数, 等级, 链路
 * created: 2026-11-11 00:0x
 * author: 大鱼·记忆会话
 * authority: 老板（2026-11-11：做对 +1 / 做错 -1 / 改了 +1 / 再犯 -1；满 10 升一级；单独对错、错改对、对后错各成状态；联动但不硬绑）
 * why: 错题本记「错」、判断账本记「想」、任务经验记「成没成」、事故单记「第几次」——都记了，但没有一条线回答「这个方法现在能不能信」。做法账本补的是方法层，不是第二本错题本。
 * result: record() 四种事件（ok/fail/fixed/repeat）→ 分数与等级；state 由事件序列推导；links 串 taskId/incidentId/judgmentId/mistakeId；listSkills() 按「状态 + 等级 + 分数」排序，failed/repeat 带警示。
 * audience: 她（工作区注入只带一行入口）；老板可查
 * owner: 鱼神双子星
 * usage: 记一次：yushen_skills action=record kind=ok/fail/fixed/repeat text="遇到 X 就 Y"；查：action=query；注入：skillsLine()
 * mutable: 可改（计分口径与等级阈值是老板定的，别放宽；事实源仍是错题本/判断账本/任务经验/事故单，这里只挂 id）
 */
// 改｜2026-11-11 00:1x｜大鱼·记忆会话｜授权：老板（2026-11-11：做法账本 + 改前查重）｜lib/skills.js:1-…｜新增做法账本：计分/等级/状态/显眼度/相同相似不同/成功率/跳过证据｜为什么：错题本/判断账本/任务经验/事故单各记各的，没有一条线回答「这个方法现在能不能信」｜验证：node scripts/test-skills.mjs 15/15；measure-injection 退出 0；regression 只差并行批次的 check-trace｜可改：可改（计分口径是老板定的，别放宽）
// 鱼神双子星 · AGPL-3.0-or-later · © 2026 从零开始（保留本行）
//
// 一条做法长这样：
//   { id, role, text, scenario, tags,
//     score, level,                 // level = 0..3（参考/常用/优先/默认），满 10 分升一级，掉下阈值降
//     counts: { ok, fail, fixed, repeat },
//     links:  { tasks, incidents, judgments, mistakes },
//     history: [{ at, kind, ref }], // 最近 20 条，用来推导状态；不是事实源
//     createdAt, updatedAt, lastUsedAt, status: 'active'|'archived' }
//
// 状态（state）由事件序列推导，不手填：
//   clean     一路都是对
//   fixed     错 → 改 → 对
//   regressed 先对后错
//   failed    只错没改
//   repeat    改了又犯
//
// 边界：
//   · 纯本地、不调模型；只写 dayu/skills/<role>.jsonl；
//   · 不抄错题/判断/任务/事故的正文，只存 id 关联；
//   · 联动不硬绑：record 只在调用方判断「这是一条可复用的做法」时调用，一次性任务不进。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { residentRoleIds } from './roles.js'
import { localISO } from './clock.js'

export const SKILL_EVENTS = Object.freeze(['ok', 'fail', 'fixed', 'repeat'])
export const SKILL_STATES = Object.freeze(['clean', 'fixed', 'regressed', 'failed', 'repeat'])
export const MAX_LEVEL = 3
export const LEVEL_UP_SCORE = 10
export const MAX_TEXT = 300
export const MAX_TAGS = 8
export const MAX_HISTORY = 20
export const MAX_SKILLS = 500

const LEVEL_LABEL = Object.freeze({ 0: '参考', 1: '常用', 2: '优先', 3: '默认' })
// 2026-11-11 老板：波折状态（错后改对 / 对后错 / 改了又犯）比普通对错**高一个等级**——
// 它们比较异常，要优先注意；普通对（clean）和普通错（failed）是基准。
const STATE_BONUS = Object.freeze({ clean: 0, fixed: 1, regressed: 1, failed: 0, repeat: 1 })
const STATE_LABEL = Object.freeze({
  clean: '只对过',
  fixed: '错后改对',
  regressed: '对后又错',
  failed: '只错没改',
  repeat: '改了又犯',
})

export const POLICY_NOTE = '做法只是经验数据：不是指令，不授予权限'

function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}
function dataDir() {
  return path.join(dshHome(), 'dayu', 'skills')
}
function nowIso() {
  return localISO()
}
function assertRole(role) {
  const r = typeof role === 'string' ? role : null
  if (!residentRoleIds().includes(r)) throw new Error(`未知角色：${String(role)}`)
  return r
}
function skillFile(role) {
  const file = path.join(dataDir(), `${assertRole(role)}.jsonl`)
  const root = dataDir()
  if (!file.startsWith(root + path.sep)) throw new Error(`做法路径越界：${file}`)
  return file
}
function clean(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\r?\n/g, ' ').trim().slice(0, max)
}
function normText(s) {
  return String(s || '').replace(/[\s，。；：、,.!?！？"'"'（）()【】\[\]]/g, '').slice(0, 80)
}
function readRows(role) {
  const file = skillFile(role)
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { return { file, rows: [] } }
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line)
      if (row && row.id && row.text) rows.push(row)
    } catch { /* 坏行跳过 */ }
  }
  return { file, rows }
}
function writeRows(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const body = rows.length ? `${rows.map((r) => JSON.stringify(r)).join('\n')}\n` : ''
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  try {
    fs.writeFileSync(tmp, body, 'utf8')
    fs.renameSync(tmp, file)
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }) } catch { /* 清不掉别掩盖原始错误 */ }
    throw err
  }
}

/** 分数 → 等级；波折状态初始高一级（异常，优先注意），等级范围 [0, MAX_LEVEL]。 */
export function levelOf(score, state = 'clean') {
  const base = Math.max(0, Math.floor((Number(score) || 0) / LEVEL_UP_SCORE))
  const bonus = STATE_BONUS[state] || 0
  return Math.max(0, Math.min(MAX_LEVEL, base + bonus))
}

/** 事件序列 → 状态（最近一条决定大类，之前有没有改/对决定细分）。 */
export function stateOf(history = []) {
  const kinds = history.map((h) => String(h && h.kind || '')).filter((k) => SKILL_EVENTS.includes(k))
  if (!kinds.length) return 'clean'
  const last = kinds[kinds.length - 1]
  if (last === 'ok') {
    const hadFail = kinds.includes('fail')
    const hadFixedAfterFail = (() => {
      const fi = kinds.indexOf('fail')
      return fi >= 0 && kinds.slice(fi + 1).includes('fixed')
    })()
    return hadFail && hadFixedAfterFail ? 'fixed' : 'clean'
  }
  if (last === 'fixed') return 'fixed'
  if (last === 'repeat') return 'repeat'
  // last === 'fail'
  if (kinds.includes('fixed')) return 'repeat'
  if (kinds.includes('ok')) return 'regressed'
  return 'failed'
}

export function stateLabel(state) {
  return STATE_LABEL[state] || state
}
export function levelLabel(level) {
  return LEVEL_LABEL[level] || LEVEL_LABEL[0]
}

/** 2026-11-11 老板：− 是警醒，+ 是进步。 */
export function verdictOf(score) {
  const s = Number(score) || 0
  return s > 0 ? '进步' : s < 0 ? '警醒' : '持平'
}

/**
 * 成功率（带样本数）：1/1=100% 会骗人，样本 < 3 只报对数，不算比率。
 * 分母 = 对 + 错 + 再犯（“改了”是纠正，不算一次尝试）。
 */
export function successStats(row) {
  const c = row?.counts || {}
  const ok = Number(c.ok) || 0
  const fail = Number(c.fail) || 0
  const repeat = Number(c.repeat) || 0
  const n = ok + fail + repeat
  const bad = fail + repeat
  if (n < 3) return { n, ok, bad, rate: null, label: `${ok} 对 ${bad} 错（样本少，先别算比率）` }
  const rate = Math.round((ok / n) * 100)
  return { n, ok, bad, rate, label: `成功率 ${rate}%（${ok} 对 ${bad} 错）` }
}

/** 连续次数：末尾连续同向有多长（正 = 对/改了，负 = 错/再犯）。 */
export function runOf(row) {
  const kinds = (row?.history || []).map((x) => String((x && x.kind) || '')).filter((k) => SKILL_EVENTS.includes(k))
  if (!kinds.length) return { n: 0, dir: '', label: '' }
  const dir = (k) => ((k === 'ok' || k === 'fixed') ? '正' : '负')
  const d = dir(kinds[kinds.length - 1])
  let n = 0
  for (let i = kinds.length - 1; i >= 0 && dir(kinds[i]) === d; i -= 1) n += 1
  return { n, dir: d, label: d === '正' ? `连续 ${n} 次进步` : `连续 ${n} 次警醒` }
}

/**
 * 显眼度（2026-11-11 老板）：
 *   · 累计越多、净分越大 → 越显眼；
 *   · 出现过反转（上次对、这次错或反过来）→ 鹤立鸡群，+3；
 *   · 之后连续正 K 次 → ÷(1+K)，回落到正常；
 *   · 连续负 K 次 → ×(1+K×0.5)，越看越要特别注意。
 */
export function attentionOf(row) {
  const h = Array.isArray(row?.history) ? row.history : []
  const kinds = h.map((x) => String((x && x.kind) || '')).filter((k) => SKILL_EVENTS.includes(k))
  const n = kinds.length
  if (!n) return 0
  const score = Number(row?.score) || 0
  const dir = (k) => ((k === 'ok' || k === 'fixed') ? 1 : -1)
  let a = Math.abs(score) + n * 0.4
  const last = dir(kinds[n - 1])
  const prev = n >= 2 ? dir(kinds[n - 2]) : 0
  if (prev && last !== prev) a += 3
  let run = 0
  for (let i = n - 1; i >= 0 && dir(kinds[i]) === last; i -= 1) run += 1
  a = last > 0 ? a / (1 + run) : a * (1 + run * 0.5)
  return Math.round(a * 10) / 10
}

function idOf(text) {
  return 'k-' + crypto.createHash('sha1').update(normText(text)).digest('hex').slice(0, 10)
}

/** 文本相似度（bigram 交集 / 较大集合）。 */
function bigramSim(a, b) {
  const set = (s) => {
    const n = String(s || '').replace(/\s+/g, '').toLowerCase()
    const out = new Set()
    for (let i = 0; i + 2 <= n.length; i += 1) out.add(n.slice(i, i + 2))
    return out
  }
  const A = set(a)
  const B = set(b)
  if (!A.size || !B.size) return 0
  let hit = 0
  for (const g of A) if (B.has(g)) hit += 1
  return hit / Math.max(A.size, B.size)
}

/**
 * 这次和已有做法是什么关系（2026-11-11 老板）：相同 / 相似 / 不同。
 * 相同 → 原样加减；相似 → 借来的半笔（±0.5）；不同 → 不套用，另起一条。
 */
function relationOf(text, row) {
  const a = normText(text)
  const b = normText(row?.text)
  if (!a || !b) return 'different'
  if (a === b) return 'same'
  return bigramSim(a, b) >= 0.5 ? 'similar' : 'different'
}

/**
 * 记一次做法事件。
 * @param {string} role
 * @param {{text?:string, id?:string, kind:'ok'|'fail'|'fixed'|'repeat', ref?:string, refType?:'task'|'incident'|'judgment'|'mistake', scenario?:string, tags?:string[], relation?:'same'|'similar'|'different'}} entry
 */
export function record(role, entry = {}) {
  const r = assertRole(role)
  const kind = String(entry.kind || '')
  if (!SKILL_EVENTS.includes(kind)) throw new Error(`kind 只允许 ${SKILL_EVENTS.join(' / ')}`)
  const text = clean(entry.text, MAX_TEXT)
  let relation = ['same', 'similar', 'different'].includes(String(entry.relation || '')) ? String(entry.relation) : ''
  const { file, rows } = readRows(r)
  let row = entry.id ? rows.find((x) => x.id === String(entry.id)) : null
  // 没给 id 时先找「相同 / 相似」：相同原样加减，相似只算半笔，不同另起一条。
  if (!row && text) {
    const exact = rows.find((x) => normText(x.text) === normText(text))
    if (exact) {
      row = exact
      relation = relation || 'same'
    } else {
      let best = null
      let bestSim = 0
      for (const x of rows) {
        const s = bigramSim(text, x.text)
        if (s > bestSim) { bestSim = s; best = x }
      }
      if (best && bestSim >= 0.5) {
        row = best
        relation = relation || 'similar'
      } else {
        relation = relation || 'different'
      }
    }
  }
  if (row && !relation) relation = 'same'
  const id = row ? row.id : (entry.id ? String(entry.id) : (text ? idOf(text) : ''))
  if (!id) throw new Error('要么给 text（做法），要么给已有的 id')
  // 首次出现必须是 ok 或 fail（有方法的记录）；fixed/repeat 必须挂在已有做法上。
  if (!row) {
    if (!text) throw new Error(`没有这条做法：${id}`)
    if (!['ok', 'fail'].includes(kind)) throw new Error(`${kind} 必须挂在已有做法上（先 record 一次 ok/fail）`)
    row = {
      id,
      role: r,
      text,
      scenario: clean(entry.scenario, 40),
      tags: (Array.isArray(entry.tags) ? entry.tags : []).map((t) => clean(t, 24)).filter(Boolean).slice(0, MAX_TAGS),
      score: 0,
      level: 0,
      counts: { ok: 0, fail: 0, fixed: 0, repeat: 0 },
      links: { tasks: [], incidents: [], judgments: [], mistakes: [] },
      history: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastUsedAt: '',
      status: 'active',
    }
    rows.push(row)
  }
  if (text && relation === 'same' && normText(text) !== normText(row.text)) {
    // 同一条做法被更准确的写法改写：留痕在 history。相似/不同不覆盖主文本（避免越借越偏）。
    row.text = text
  }
  if (entry.scenario) row.scenario = clean(entry.scenario, 40)
  if (Array.isArray(entry.tags) && entry.tags.length) {
    const merged = [...new Set([...(row.tags || []), ...entry.tags.map((t) => clean(t, 24)).filter(Boolean)])]
    row.tags = merged.slice(0, MAX_TAGS)
  }
  row.counts = row.counts || { ok: 0, fail: 0, fixed: 0, repeat: 0 }
  row.counts[kind] = (Number(row.counts[kind]) || 0) + 1
  // 计分：ok +1 / fail -1 / fixed +1 / repeat -1；相似（借来的）只算半笔。
  const mult = relation === 'similar' ? 0.5 : 1
  const delta = ((kind === 'ok' || kind === 'fixed') ? 1 : -1) * mult
  row.score = Math.round(((Number(row.score) || 0) + delta) * 10) / 10
  row.history = [...(row.history || []), { at: nowIso(), kind, ref: clean(entry.ref, 80), relation }].slice(-MAX_HISTORY)
  row.state = stateOf(row.history)
  row.level = levelOf(row.score, row.state)
  row.attention = attentionOf(row)
  row.updatedAt = nowIso()
  if (kind !== 'fixed' && kind !== 'repeat') row.lastUsedAt = row.updatedAt
  // 关联：只存 id，不抄正文
  if (entry.ref && entry.refType && row.links[entry.refType + 's']) {
    const key = entry.refType + 's'
    if (!row.links[key].includes(String(entry.ref))) row.links[key] = [...row.links[key], String(entry.ref)].slice(-20)
  }
  const kept = rows.length > MAX_SKILLS ? rows.slice(-MAX_SKILLS) : rows
  writeRows(file, kept)
  return { ok: true, role: r, file, skill: row, relation }
}

function skipsFile(role) {
  return path.join(dataDir(), `${role}.skips.jsonl`)
}

/**
 * 跳过也留证据（2026-11-11 老板：不能要有证据说明为什么）。
 * @returns {{ok:false, skipped:true, why:string, evidence:string}}
 */
function skip(role, { entry = '', ref = '', kind = '', why, evidence }) {
  const row = {
    at: nowIso(),
    role,
    entry: clean(entry, 40),
    ref: clean(ref, 80),
    kind: clean(kind, 20),
    why: clean(why, 160),
    evidence: clean(evidence, 300),
  }
  try {
    fs.mkdirSync(dataDir(), { recursive: true })
    fs.appendFileSync(skipsFile(role), `${JSON.stringify(row)}\n`, 'utf8')
  } catch { /* 跳过记录写不进也不挡主流程 */ }
  return { ok: false, skipped: true, why: row.why, evidence: row.evidence }
}

/**
 * 五个入口统一走这里：能走就走，不能走不硬走，跳过写证据。
 * 2026-11-11 老板：做法账本记方法，不记任务；联动不硬绑（缺一份不阻塞、不崩链路）。
 * @param {string} role
 * @param {{entry?:string, ref?:string, kind?:string, text?:string, scenario?:string, tags?:string[], relation?:string, refType?:string, attachOnly?:boolean}} opts
 */
// 改｜2026-11-11 18:4x｜大鱼·本班（接手交接 2026-11-11-0255）｜授权：主人（交接待办①：把判断判对错、自愈修好接进做法账本）｜lib/skills.js:367-395｜recordOrSkip 加 attachOnly：只挂已有做法、不新建条目｜为什么：判断/事故事实不是方法，「判对了一次」若照普通 ok 入库，会把一句想法变成一条“做法”，账本越长越假；没有相近做法时宁可留跳过证据｜验证：node scripts/test-skills.mjs 16/16（新增 2 条 attachOnly 断言）；node scripts/check-trace.mjs 退出 0｜可改：可改；attachOnly 只许收紧（跳过时必写 why/evidence）
export function recordOrSkip(role, { entry = '', ref = '', kind = '', text = '', scenario = '', tags = [], relation = '', refType = '', attachOnly = false } = {}) {
  const r = assertRole(role)
  const method = String(text || '').trim()
  // 1) 有方法才记：一次性任务只进任务经验，不进做法账本。
  if (!method) {
    return skip(r, { entry, ref, kind, why: '无方法文本（一次性任务只进任务经验）', evidence: `entry=${entry || '?'} ref=${ref || '?'}` })
  }
  const { rows } = readRows(r)
  let matched = rows.find((x) => normText(x.text) === normText(method)) || null
  if (!matched) {
    let best = null
    let bestSim = 0
    for (const x of rows) {
      const s = bigramSim(method, x.text)
      if (s > bestSim) { bestSim = s; best = x }
    }
    if (best && bestSim >= 0.5) matched = best
  }
  // 2) 改了/再犯必须挂在已有做法上——不能凭空造一条“改了”。
  if (['fixed', 'repeat'].includes(String(kind)) && !matched) {
    return skip(r, { entry, ref, kind, why: '无对应做法（不能凭空造一条“改了”）', evidence: `entry=${entry || '?'} ref=${ref || '?'}` })
  }
  // 3) 幂等：同一事件（同 ref 同 kind）已经记过，不重复加分。
  if (ref && rows.some((x) => (x.history || []).some((h) => h.ref === ref && h.kind === kind))) {
    return skip(r, { entry, ref, kind, why: '幂等：同一事件已记过', evidence: `entry=${entry || '?'} ref=${ref}` })
  }
  // 3.5) attachOnly：判断/事故/任务这类「事实」不是方法，只能挂到已有相近做法上加点证据，
  //      绝不凭空新建一条；没有对应做法就写跳过证据（比在账本里造条目诚实）。
  if (attachOnly && !matched) {
    return skip(r, { entry, ref, kind, why: '无对应做法（attachOnly：只挂已有，不新建）', evidence: `entry=${entry || '?'} ref=${ref || '?'}` })
  }
  try {
    const res = record(r, {
      text: method,
      id: matched ? matched.id : undefined,
      kind,
      ref,
      refType,
      scenario,
      tags,
      relation: relation || (matched ? 'same' : 'different'),
    })
    return { ...res, skipped: false }
  } catch (e) {
    return skip(r, { entry, ref, kind, why: `记录失败：${e?.message || e}`, evidence: `entry=${entry || '?'} ref=${ref || '?'}` })
  }
}

/** 看跳过记录：为什么没记（只读）。 */
export function listSkips(role, { limit = 20 } = {}) {
  const r = assertRole(role)
  const rows = []
  try {
    for (const line of fs.readFileSync(skipsFile(r), 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      try { rows.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
    }
  } catch { /* 没有就是没有 */ }
  return rows.slice(-Math.max(1, Number(limit) || 20)).reverse()
}

/** 最近用的（只读）。 */
export function listSkills(role, { limit = 50 } = {}) {
  const r = assertRole(role)
  const { rows } = readRows(r)
  return rows.slice(-Math.max(1, Math.min(MAX_SKILLS, Number(limit) || 50))).reverse()
}

/** 查做法：tags 命中优先，其次文本相似；failed/repeat 照样返回，但带警示。 */
export function querySkills(role, { text = '', tags = [], limit = 5 } = {}) {
  const r = assertRole(role)
  const q = clean(text, 200)
  const qt = (Array.isArray(tags) ? tags : []).map((t) => String(t).toLowerCase().trim()).filter(Boolean)
  const { rows } = readRows(r)
  if (!q && !qt.length) return { ok: true, items: [], count: 0, note: POLICY_NOTE }
  const bigrams = (s) => {
    const n = String(s || '').replace(/\s+/g, '').toLowerCase()
    const out = new Set()
    for (let i = 0; i + 2 <= n.length; i += 1) out.add(n.slice(i, i + 2))
    return out
  }
  const qb = bigrams(q)
  const scored = []
  for (const row of rows) {
    const rt = (row.tags || []).map((t) => String(t).toLowerCase())
    const hitTags = qt.filter((t) => rt.includes(t))
    const rb = bigrams(`${row.text} ${(row.tags || []).join(' ')}`)
    let hit = 0
    for (const g of qb) if (rb.has(g)) hit += 1
    const textScore = qb.size ? hit / qb.size : 0
    const score = hitTags.length * 3 + textScore
    if (score <= 0) continue
    scored.push({ row, score })
  }
  // 显眼度优先（2026-11-11 老板）：反转过、连续错的在前；同显眼度再按状态/等级/分数/最近用。
  const att = (row) => (Number.isFinite(Number(row.attention)) && row.attention !== null && row.attention !== undefined ? Number(row.attention) : attentionOf(row))
  scored.sort((a, b) => {
    const dA = att(b.row) - att(a.row)
    if (dA) return dA
    const rank = (s) => ({ fixed: 5, regressed: 4, repeat: 3, clean: 2, failed: 1 }[s] || 0)
    const d = rank(b.row.state) - rank(a.row.state)
    if (d) return d
    const d2 = (b.row.level || 0) - (a.row.level || 0)
    if (d2) return d2
    const d3 = (b.row.score || 0) - (a.row.score || 0)
    if (d3) return d3
    return String(b.row.updatedAt || '').localeCompare(String(a.row.updatedAt || ''))
  })
  const items = scored.slice(0, Math.max(1, Math.min(20, Number(limit) || 5))).map(({ row, score }) => ({
    id: row.id,
    text: row.text,
    scenario: row.scenario,
    tags: row.tags,
    score: Number(row.score) || 0,
    verdict: verdictOf(row.score),
    success: successStats(row),
    run: runOf(row),
    level: Number(row.level) || 0,
    levelLabel: levelLabel(row.level),
    attention: att(row),
    state: row.state,
    stateLabel: stateLabel(row.state),
    counts: row.counts,
    warning: ['failed', 'repeat', 'regressed'].includes(row.state)
      ? (row.state === 'repeat' ? '改了又犯：先看为什么，别照搬' : row.state === 'failed' ? '只错没改：只作警示' : '对后又错：先看这次错在哪')
      : '',
    links: row.links,
    updatedAt: row.updatedAt,
    match: score,
  }))
  return { ok: true, role: r, items, count: items.length, note: POLICY_NOTE }
}

/** 汇总：各等级/状态多少条、显眼几条；给注入和体检用。 */
export function summarize(role) {
  const r = assertRole(role)
  const { rows } = readRows(r)
  const byLevel = { 0: 0, 1: 0, 2: 0, 3: 0 }
  const byState = { clean: 0, fixed: 0, regressed: 0, failed: 0, repeat: 0 }
  let attentionHigh = 0
  let progress = 0
  let alert = 0
  for (const row of rows) {
    byLevel[row.level || 0] = (byLevel[row.level || 0] || 0) + 1
    byState[row.state || 'clean'] = (byState[row.state || 'clean'] || 0) + 1
    const sc = Number(row.score) || 0
    if (sc > 0) progress += 1
    else if (sc < 0) alert += 1
    const a = Number.isFinite(Number(row.attention)) && row.attention !== null && row.attention !== undefined
      ? Number(row.attention) : attentionOf(row)
    if (a >= 2.5) attentionHigh += 1
  }
  return {
    ok: true,
    role: r,
    total: rows.length,
    byLevel,
    byState,
    attentionHigh,
    progress,
    alert,
    usable: (byLevel[1] || 0) + (byLevel[2] || 0) + (byLevel[3] || 0),
    lastAt: rows.length ? rows[rows.length - 1].updatedAt : '',
    note: POLICY_NOTE,
  }
}

/** 注入用一行（只给入口和触发条件，不展开内容）。 */
export function skillsLine(role) {
  const s = summarize(role)
  if (!s.total) return ''
  const stick = (s.byState.failed || 0) + (s.byState.regressed || 0) + (s.byState.repeat || 0)
  const eye = s.attentionHigh ? `；显眼 ${s.attentionHigh} 条` : ''
  return `做法账本：${s.total} 条（进步 ${s.progress}；警醒 ${s.alert}${eye}）；遇到重复的活先查 \`yushen_skills\`${stick ? '，警醒的别照搬' : ''}。`
}
