/* 标签
 * id: lib-heartbeat-journal
 * kind: module
 * summary: 心跳逐跳留痕——每一跳写一行到 ~/.dsh/dayu/heartbeat/<日期>.jsonl；落盘/读取/汇总转调共享内核 memory-core/heartbeat.mjs，这一层只留她的语义（枚举、分组、落点回填）。
 * tags: 心跳, 留痕, 面板, 自省, 自由时间
 * created: 2026-11-10 19:40:00
 * changed: 2026-11-17 21:20:00
 * author: 大鱼·子代理（软边界）
 * authority: 老板（2026-11-10 手机端任务单：心跳要逐跳留痕；「什么也没发生」也算合法产出；2026-11-10 22:3x：桥的唤醒也算兜底一类、面板要按类报数、触线单独算一跳）
 * why: 原来心跳只往事件层聚合成「一天一行 + 计数」，看不出这一跳她想了没、做了没；面板只能报「跳了几次」，报不出「活没活」。2026-11-10 补：面板按类报数（她选的/外部事件/节拍），trigger 加「额度线」、whyNot 加「额度线」。
 * result: 每一跳一行、一天一个文件；summaryOf() 给面板做汇总（含 byTrigger 与 byClass）；wakeClassOf() 定类；reconcileLandings() 用证据补「落点」，不猜。
 * mutable: 可改（字段别减；trigger 枚举别私自加——加之前先问老板）
 * audience: 她（醒来/面板）、桥（/wake 写一跳）、新角色
 * owner: 框架；trigger 枚举要加先问老板
 * defaults: trigger 五档（自省/兜底/她约的/有人找/她自己要的+额度线）；thought 三档；whyNot 六档
 * usage: appendHeartbeat 写一跳（转调内核）；readHeartbeats/summaryOf 给面板；wakeClassOf 分组；reconcileLandings 用证据补落点
 * off: 不接写入口就只剩空文件；已写的行不删；要停整个心跳去关 freeTime 开关
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-10 19:40｜大鱼·子会话（② 心跳日志）｜授权：老板（本次任务书：给心跳补逐跳留痕 + 面板能看有产出/空转）｜lib/heartbeat-journal.js:1-…｜新增：appendHeartbeat / readHeartbeats / summaryOf / reconcileLandings｜为什么：心跳原来只留「今天跳了几次」（事件层聚合），看不出每一跳是谁叫的、她想没想、落了没有；没有这份留痕，「空转也是合法产出」这句就只能嘴上说，面板也分不出她今天真干了活还是空跳了一天｜验证：node --check lib/heartbeat-journal.js；node scripts/test-heartbeat-journal.mjs（temp 自造家，N/N 过）｜可改：可改（写入永远失败静默，绝不挡心跳）
// 改｜2026-11-11 01:15｜大鱼·子代理（闭环 P2）｜授权：老板（2026-11-11：「心跳接入记忆插件」「留一手不全塞进去」）｜lib/heartbeat-journal.js:27-35,75-80,104-115,125-132,134-140｜写入/读取/汇总下沉到 memory-core/heartbeat.mjs，本地只留枚举校验/分组/落点回填｜为什么：心跳和记忆同构（按角色存），该放共享内核，dsh-memory 装给外面角色也能读；两份实现就是两套账｜验证：test-heartbeat-journal 仍 12/12（字段、行格式、返回一致）；test-heartbeat-core 通过；鱼神外无引用｜可改：可改（函数名/字段/行格式一个字都不许变——有测试盯着）
// 改｜2026-11-17 21:20｜大鱼·子代理（心跳落盘）｜授权：老板（验收 4.11：心跳在跑但 level/signals 没落盘；只加不判）｜lib/heartbeat-journal.js:36-40,82-…,200-…｜新增：painLevel / signals(kind+level) / painText 三列；appendHeartbeat 在调用方没传 pain 时按同一套输入重算一份只供复盘的快照；readPain(row) 兼容旧行｜为什么：buildPainSignals 的结果原来只在内存里用于 shouldWake，日志证明不了痛觉真的触发过；不改 dayu/index.js 的调用点，所以在写入口自己重算（不参与叫醒决定）｜口径：不写 signal.what/refs 原样、不写群正文、不写密钥（文本脱敏+截断）；0 级不写三列，旧行格式一个字不变｜验证：node --check；scripts/test-heartbeat-persist.mjs（temp 家，不调模型）；test-heartbeat-journal 仍 12/12｜可改：可改（字段只增不减；readPain 对旧行永远给 0/空，不猜）
//
// 三条边界（照 body-loop 的规矩）：
//   · **失败静默**：日志写不进去只返回 {ok:false}，绝不抛、绝不挡心跳主流程；
//   · **不许猜**：`thought` 只知道三种（想 / 不想 / 未知）；叫醒那一跳她还没表态，就写 `未知`；
//     `landed` 同理——写这一行时还没有落点就写 null（不是 false），等 reconcileLandings 拿证据补；
//   · **空转合法**：landed=false 不是失败，是「这一跳什么也没发生」，照样记一行。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
// 2026-11-11 闭环 P2：写入/读取/汇总下沉到共享内核 memory-core/heartbeat.mjs。
// 这一层只保留**她的语义**：trigger 枚举校验、thought 三档、whyNot 六档、wakeClassOf 分组、落点回填。
// 为什么：心跳和记忆同构（都按角色存），该在共享内核里；dsh-memory 装给外面角色时也能读，
// 不用依赖鱼神。两份实现就是两套账，所以只留一份真身（内存核心里那份）。
import * as coreHb from '../memory-core/heartbeat.mjs'
// 2026-11-17：痛觉快照的输入。buildPainSignals 是纯函数；另外三个只读当前状态，
// 用来在调用方（dayu/index.js freeTimeOnce）没把 pain 传进来时重算一份**只供落盘复盘**的快照。
// 这一层不决定叫不叫——叫不叫仍然由调用方拿 buildPainSignals 的结果判。
import { buildPainSignals } from './heartbeat-signals.js'
import { listWaiting } from './waiting.js'
import { activeItems } from './agenda.js'
import { listLoops } from '../memory-core/runtime/open-loops.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const DIR = path.join(DATA, 'heartbeat')

/** 谁叫的这一跳。枚举固定：加之前先问老板（手机端任务单里只有这五种；2026-11-10 老板同意加「额度线」）。 */
export const TRIGGERS = Object.freeze(['自省', '兜底', '她约的', '有人找', '她自己要的', '额度线'])
/** 想不想。**只认三种**；不知道就是「未知」，不许猜。 */
export const THOUGHTS = Object.freeze(['想', '不想', '未知'])
/** 会叫醒她、可能产生「落点」的那几种；自省只是体跳，不算一次「醒」。
 *  2026-11-10：「额度线」**故意先不进这张表**——触线那一下算不算一次「醒」（要不要进 produced/idle 统计），
 *  老板没给口径，先按"单独记一跳、不进醒的统计"处理；要进的话由老板/上层加，别在这儿自己加。 */
export const WAKE_TRIGGERS = Object.freeze(['兜底', '她约的', '有人找', '她自己要的'])
/** 2026-11-10 老板：醒来要知道「有人找我、我没回，为什么」。只认这几档，说不清就「未知」。 */
export const WHY_NOT = Object.freeze(['没醒', '桥断', '在忙', '判了不回', '额度线', '未知'])

/**
 * 这一跳归哪一类（面板按类报数用）。
 * 2026-11-10 老板：「桥的唤醒也是兜底的一种，和下面的兜底属于同一类」——
 * **分组层面成立，触发层面不合并**（桥带着一条消息进来，兜底是空的，所以 trigger 还是分开记）。
 * 映射照老板给的写死，不自己加类：
 *   她约的 / 她自己要的 → 她选的
 *   有人找             → 外部事件
 *   兜底 / 自省         → 节拍
 *   额度线             → 边界（2026-11-10 主代理定：这不是有人找，也不是表叫她，是**体系拦了她一下**；
 *                        单开一类，面板上能看见"今天被边界挡了几次"，不许并进节拍）
 *   不认识的值         → 未知
 */
export function wakeClassOf(trigger) {
  const t = String(trigger || '').trim()
  if (t === '她约的' || t === '她自己要的') return '她选的'
  if (t === '有人找') return '外部事件'
  if (t === '兜底' || t === '自省') return '节拍'
  if (t === '额度线') return '边界'
  return '未知'
}

/** 本地日期（一天一个文件；跟 body-loop / freetime 的口径一致）。
 *  2026-11-11：真身在共享内核，这里只转发（对外仍是这个名字，调用方不用改）。 */
export function dayOf(now = Date.now()) { return coreHb.dayOf(now) }
function fileOf(day) { return path.join(DIR, `${day}.jsonl`) }

function oneLine(s, n = 200) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
}

// ── 痛觉落盘（2026-11-17）────────────────────────────────────────────
// 只写「哪里痛」的最小复述：painLevel、signals（kind + level）、painText（coalesce 那句话）。
// 不写 signal.what / refs 原样、不写群正文、不写密钥；文本再脱敏 + 截断一次。
// 读面：readPain(row) 对旧行（没有这三列）永远给 known:false / 0 / 空，不抛、不猜。
const PAIN_GRACE_MS = 5 * 60 * 1000
const PAIN_SIGNAL_MAX = 12
const PAIN_TEXT_MAX = 400
const KEY_PATTERNS = [
  /sk-[A-Za-z0-9_-]{6,}/g,
  /ghp_[A-Za-z0-9]{8,}/g,
  /AKIA[0-9A-Z]{12,}/g,
  /Bearer\s+[A-Za-z0-9._-]{8,}/gi,
  /api[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9._-]{8,}/gi,
]

function clampLevel(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(3, Math.round(n))) : 0
}

/** 摘要文本只留一行；密钥样式一律抹掉（宁可少一句，也不把密钥写进日志）。 */
function painLine(s, n = PAIN_TEXT_MAX) {
  let out = String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 800)
  for (const re of KEY_PATTERNS) out = out.replace(re, '[已隐去]')
  return out.slice(0, n)
}

function recentMs(ms, now) {
  const t = Number(ms) || 0
  return t > 0 && t <= now && now - t <= PAIN_GRACE_MS
}

/**
 * summary-pending 的全量读数（含刚被 markNotified 的那条）。
 * 为什么不用 listPending：它在调用方 markNotified 之后已经读不到这一跳刚叫过的那条，
 * 而复盘恰恰要记「这跳是被它叫醒的」。
 */
function recentSummaryPending(role, now) {
  try {
    const file = path.join(DATA, 'runtime', String(role), 'summary-pending.jsonl')
    const lines = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
    const checks = new Map()
    const notifiedAt = new Map()
    for (const line of lines) {
      let r = null
      try { r = JSON.parse(line) } catch { continue }
      if (!r || !r.dedupeKey) continue
      const key = String(r.dedupeKey)
      if (r.kind === 'check') checks.set(key, r)
      else if (r.kind === 'notified') {
        const t = Date.parse(r.at || '') || 0
        if (t > 0) notifiedAt.set(key, t)
      }
    }
    const out = []
    for (const [key, row] of checks) {
      const t = notifiedAt.get(key) || 0
      // 没叫过的（t=0）照常算；刚叫过的（5 分钟内）也算这一跳的痛；更早的按原语义不再痛。
      if (t > 0 && !recentMs(t, now)) continue
      out.push(row)
    }
    return out
  } catch { return [] }
}

/**
 * 这一跳的痛觉快照。**只用于落盘复盘，不参与叫不叫的决定。**
 * 调用方（dayu/index.js:1355）算完 pain 没有把它交给 appendHeartbeat，所以这里用同一套输入重算一次。
 * 刚被这一跳 mark 掉的 agenda / open-loop / summary（5 分钟内）仍然算进来：
 * 否则「这跳正是被它叫醒的」反而会记成 0，复盘就失真。
 */
function painSnapshot(role, now = Date.now()) {
  try {
    const id = oneLine(role, 40)
    if (!id) return null
    const waits = listWaiting(id, { now })
    const agendaDue = activeItems(id)
      .filter((i) => {
        const dueAt = Number(i.dueAtMs) || 0
        if (!(dueAt > 0 && dueAt <= now)) return false
        const notified = Number(i.dueNotifiedAtMs) || 0
        return notified < dueAt || recentMs(notified, now)
      })
      .map((i) => (recentMs(i.dueNotifiedAtMs, now) ? { ...i, dueNotifiedAtMs: 0 } : i))
    const loops = listLoops(id, { status: 'open', now })
      .filter((l) => !l.notifiedAt || recentMs(Date.parse(l.notifiedAt) || 0, now))
      .map((l) => (l.notifiedAt ? { ...l, notifiedAt: '' } : l))
    const summaryPending = recentSummaryPending(id, now)
    if (!waits.length && !agendaDue.length && !loops.length && !summaryPending.length) return null
    return buildPainSignals({ waits, agendaDue, loops, summaryPending, failures: [], ownerAsks: [], now })
  } catch { return null }
}

/** 把 buildPainSignals 的结果收成可落盘的三列；坏入参不抛。 */
function normalizePain(pain) {
  if (!pain || typeof pain !== 'object') return null
  const signals = (Array.isArray(pain.signals) ? pain.signals : [])
    .filter((s) => s && typeof s === 'object' && s.kind != null)
    .slice(0, PAIN_SIGNAL_MAX)
    .map((s) => ({ kind: oneLine(s.kind, 40), level: clampLevel(s.level) }))
    .filter((s) => s.kind)
  return {
    level: clampLevel(pain.level),
    signals,
    text: painLine(pain?.coalesce?.text ?? pain.text ?? '', PAIN_TEXT_MAX),
  }
}

/**
 * 读一行里的痛觉（旧行兼容）。
 * @returns {{known:boolean, level:number, signals:Array<{kind:string,level:number}>, text:string}}
 */
export function readPain(row = {}) {
  const src = row && typeof row === 'object' ? row : {}
  const known = src.painLevel !== undefined && src.painLevel !== null
  const signals = Array.isArray(src.signals)
    ? src.signals
      .filter((s) => s && typeof s === 'object' && s.kind != null)
      .slice(0, PAIN_SIGNAL_MAX)
      .map((s) => ({ kind: oneLine(s.kind, 40), level: clampLevel(s.level) }))
      .filter((s) => s.kind)
    : []
  return {
    known,
    // 旧行没有这一列：给 0（不是"没有痛"，是"这行没记"——known 会如实说）。
    level: known ? clampLevel(src.painLevel) : 0,
    signals,
    text: known ? painLine(src.painText, PAIN_TEXT_MAX) : '',
  }
}

/** 归一化一行。写进去的东西必须能被人一眼读，也必须是真话。 */
export function normalizeRow({ role = '', trigger = '', thought = '', did = '', landed = null, spent = null, unanswered = null, whyNot = '', sessionId = '', refs = [], pain = null, now = Date.now() } = {}) {
  const t = String(trigger || '').trim()
  const th = String(thought || '').trim()
  const row = {
    at: new Date(now).toISOString(),
    role: oneLine(role, 40),
    // 枚举外的 trigger 记成「未知」（不猜、也不偷偷塞进某个已知档）
    trigger: TRIGGERS.includes(t) ? t : '未知',
    thought: THOUGHTS.includes(th) ? th : '未知',
    did: oneLine(did),
    // true/false 之外一律 null：写这一行的时候还没有落点，就是"还不知道"
    landed: landed === true ? true : landed === false ? false : null,
    spent: Number.isFinite(Number(spent)) && spent !== null && spent !== '' ? Number(spent) : null,
    // 2026-11-10 主代理：这一跳醒来时"有几个人在等、没回是因为什么"。
    // unanswered 允许 null（还不知道）；whyNot 只认四档，别的值记「未知」——原因不许编。
    unanswered: unanswered === null || unanswered === '' ? null : (Number.isFinite(Number(unanswered)) ? Number(unanswered) : null),
    whyNot: !whyNot ? '' : (WHY_NOT.includes(String(whyNot).trim()) ? String(whyNot).trim() : '未知'),
    // 这一跳投给了哪条分身会话、引用了哪几张议程/卡：只存指针，不复制正文。
    sessionId: oneLine(sessionId, 80),
    refs: Array.isArray(refs) ? refs.map((x) => oneLine(x, 80)).filter(Boolean).slice(0, 12) : [],
  }
  // 2026-11-17：痛觉三列只在有内容（或被显式传入）时写——0 级/没传时行格式和旧日志一字不差。
  const p = normalizePain(pain)
  if (p) {
    row.painLevel = p.level
    row.signals = p.signals
    row.painText = p.text
  }
  return row
}

/**
 * 写一跳。**失败静默**：返回 {ok:false, reason}，从不抛。
 * @param {object} [opts.pain] 可选：buildPainSignals 的原样结果（调用方没传就按当前状态重算一份快照）。
 * @returns {{ok:boolean, at?:string, file?:string, row?:object, reason?:string}}
 */
export function appendHeartbeat({ role = '', trigger = '', thought = '', did = '', landed = null, spent = null, unanswered = null, whyNot = '', sessionId = '', refs = [], pain = null, now = Date.now() } = {}) {
  try {
    // 显式传入的 pain 一律照写（包括 0 级）；没传就重算，0 级不写三列（旧行兼容）。
    // 重算只读同一份状态、不调模型；失败静默——记不上痛觉绝不能挡这一跳。
    const snap = pain == null ? painSnapshot(role, now) : null
    const used = pain != null ? pain : (snap && Number(snap.level) > 0 ? snap : null)
    const row = normalizeRow({ role, trigger, thought, did, landed, spent, unanswered, whyNot, sessionId, refs, pain: used, now })
    // 2026-11-11：落盘交给共享内核（它只存不判；枚举校验在上面的 normalizeRow 里）。
    return coreHb.append(role, row, { now })
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 160) }
  }
}

/**
 * 读若干天的记录（新→旧）。
 * 2026-11-11：转调共享内核（读取顺序、坏行跳过、按角色筛、跨天，行为与原实现一致）。
 * @param {{role?:string, now?:number, days?:number}} opts
 */
export function readHeartbeats({ role = '', now = Date.now(), days = 1 } = {}) {
  return coreHb.read(role, { days, now })
}

/** 今天是哪几种跳（面板那行字用得上）。
 *  2026-11-11：行从共享内核读，**这里只加她的语义**——哪几种算"醒"（WAKE_TRIGGERS）、
 *  落没落点（produced/idle/unknown）、按哪一类分组（wakeClassOf）。内核不认识这些。 */
export function summaryOf({ role = '', now = Date.now(), days = 1 } = {}) {
  const rows = readHeartbeats({ role, now, days })
  const today = dayOf(now)
  const only = rows.filter((r) => dayOf(Date.parse(r.at || '') || now) === today)
  let produced = 0; let idle = 0; let unknown = 0; let spent = 0; let lastAt = ''; let lastSelfAt = ''
  const byTrigger = {}
  const byClass = {}
  // 2026-11-17：痛觉的读面聚合（旧行没这三列就算“没记”，不补 0、不猜；只读，不参与任何判断）。
  const pain = { rows: 0, maxLevel: 0, byKind: {}, lastAt: '', lastText: '' }
  for (const r of only) {
    const trig = String(r.trigger || '未知')
    byTrigger[trig] = (byTrigger[trig] || 0) + 1
    // 2026-11-10 老板：面板要能按类报数（她选的 / 外部事件 / 节拍 / 未知）
    const cls = wakeClassOf(trig)
    byClass[cls] = (byClass[cls] || 0) + 1
    const at = Date.parse(r.at || '') || 0
    if (at && at > (Date.parse(lastAt || '') || 0)) lastAt = r.at
    if (trig === '自省' && at && at > (Date.parse(lastSelfAt || '') || 0)) lastSelfAt = r.at
    if (Number.isFinite(Number(r.spent))) spent += Number(r.spent)
    const p = readPain(r)
    if (p.known) {
      pain.rows += 1
      if (p.level > pain.maxLevel) pain.maxLevel = p.level
      for (const s of p.signals) pain.byKind[s.kind] = (pain.byKind[s.kind] || 0) + 1
      if (at >= (Date.parse(pain.lastAt || '') || 0)) { pain.lastAt = r.at || ''; pain.lastText = p.text }
    }
    if (WAKE_TRIGGERS.includes(trig)) {
      if (r.landed === true) produced += 1
      else if (r.landed === false) idle += 1
      else unknown += 1
    }
  }
  const selfTicks = byTrigger['自省'] || 0
  const wakes = byTrigger['兜底'] || 0 + 0 // 只为了可读；真正的 wakes 在下面算
  return {
    ok: true,
    day: today,
    total: only.length,
    selfTicks,
    wakes: produced + idle + unknown,
    produced, idle, unknown,
    spent: Math.round(spent * 10000) / 10000,
    lastAt,
    lastSelfAt,
    // 下一跳预计 = 最近一次自省 + 30 分钟（自省就是宿主那口钟）
    nextAt: lastSelfAt ? new Date((Date.parse(lastSelfAt) || 0) + 30 * 60 * 1000).toISOString() : '',
    byTrigger,
    byClass,
    pain,
    _unused: wakes,
  }
}

/** 找「落点」的证据：她自己记了一句 / 排了一件下一步。找到了才算落点，找不到就是空转。 */
function defaultEvidence({ role, from = 0, now = Date.now() } = {}) {
  if (!role) return null
  const inWindow = (at) => {
    const t = Date.parse(at || '') || 0
    return t > (Number(from) || 0) && t <= now
  }
  // ① 排了一件下一步（yushen_agenda add → items[].createdAt）
  try {
    const a = JSON.parse(fs.readFileSync(path.join(DATA, 'runtime', role, 'agenda.json'), 'utf8').replace(/^\uFEFF/, ''))
    // ①a 到期项被标 done：这是“做完了”的直接证据，带是谁在哪个会话做的。
    const done = (a.items || []).find((it) => String(it.state || '') === 'done' && Number(it.dueNotifiedAtMs) > 0 && inWindow(it.doneAt || it.updatedAt))
    if (done) return { what: `做完了：${oneLine(done.what, 50)}${done.doneBy ? `（${done.doneBy.slice(-8)}）` : ''}` }
    const hit = (a.items || []).find((it) => inWindow(it.createdAt) && String(it.what || '').trim())
    if (hit) return { what: `排了一件：${oneLine(hit.what, 60)}` }
  } catch { /* 没议程就当没这条证据 */ }
  // ② 记了一句（yushen_self action=remember → 记忆 events，source 固定）
  try {
    const c = JSON.parse(fs.readFileSync(path.join(DATA, 'characters.json'), 'utf8').replace(/^\uFEFF/, ''))
    const row = (c.characters || []).find((x) => x.id === role)
    if (row?.memory) {
      const file = path.isAbsolute(row.memory) ? row.memory : path.join(DATA, 'soul', row.memory)
      const mem = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
      const hit = (mem.events || []).find((e) => e && String(e.source || '') === 'yushen_self:remember' && inWindow(e.at))
      if (hit) return { what: `记了一句：${oneLine(hit.text, 60)}` }
    }
  } catch { /* 记忆读不出来就不算证据，不猜 */ }
  return null
}

/**
 * 补落点：叫醒那一跳写的时候她还没表态，这里拿证据补上（true=真落了 / false=确认空转）。
 * 只补「醒」类、只补 null、只补 5 分钟~24 小时之间的（更早的不追，更近的还在写）。
 * 找不到证据就补 false——空转是合法产出，不是失败。
 * @param {{role?:string, now?:number, minAgeMs?:number, maxAgeMs?:number, evidence?:Function}} opts
 */
export function reconcileLandings({ role = '', now = Date.now(), minAgeMs = 5 * 60 * 1000, maxAgeMs = 24 * 3600 * 1000, evidence = null } = {}) {
  const look = typeof evidence === 'function' ? evidence : defaultEvidence
  const days = [dayOf(now), dayOf(now - 86400000)]
  let checked = 0; let landed = 0; let idle = 0; let changedFiles = 0
  for (const day of days) {
    const file = fileOf(day)
    const lines = (() => { try { return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(Boolean) } catch { return [] } })()
    if (!lines.length) continue
    let changed = false
    const next = lines.map((line) => {
      let row = null
      try { row = JSON.parse(line) } catch { return line }
      if (!row || (role && row.role !== role)) return line
      if (!WAKE_TRIGGERS.includes(String(row.trigger || ''))) return line
      if (row.landed !== null && row.landed !== undefined) return line
      const at = Date.parse(row.at || '') || 0
      if (!at) return line
      const age = now - at
      if (age < minAgeMs || age > maxAgeMs) return line
      checked += 1
      let ev = null
      try { ev = look({ role: row.role, from: at, now }) } catch { ev = null }
      const fixed = ev
        ? { ...row, landed: true, evidence: oneLine(ev.what, 120) }
        : { ...row, landed: false }
      if (ev) landed += 1; else idle += 1
      changed = true
      return JSON.stringify(fixed)
    })
    if (changed) {
      try {
        const tmp = `${file}.${process.pid}.tmp`
        fs.writeFileSync(tmp, `${next.join('\n')}\n`, 'utf8')
        fs.renameSync(tmp, file)
        changedFiles += 1
      } catch { /* 补不上就算了，下一跳再试；绝不挡心跳 */ }
    }
  }
  return { ok: true, checked, landed, idle, changedFiles }
}
