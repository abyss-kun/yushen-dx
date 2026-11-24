/* 标签
 * id: lib-cost
 * kind: module
 * summary: 账：今天花了多少、说几句、峰谷差价；只把数摆给她看，不当闸门。
 * audience: 她（钱的事）、面板、软边界（读它算硬线）
 * owner: 框架；数据源是桥的流水，别在这里写第二套价目表
 * mutable: 可改（只读流水；价目表在 model-prices.js）
 * defaults: 峰谷：工作日 9-12、14-18 为峰时（价格翻倍）
 * usage: qqBudgetUsed 今天 QQ 花了多少；recentSaid 最近说了几句；spendTodayAll 全来源；bridgeBudget 本期预算
 * off: 只读账；不看它的地方就等于不用（软边界/简报会读，去掉要改代码）
 */

// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 账：今天花了多少、云端一次大概多少、本地回是免费的。
//
// 用途只有一个：**把数摆给她看**——不是拿它当闸门，也不是替她决定花不花。
// 数据源：桥的 token-usage.jsonl（三个桶）+ 官方价目表（model-prices.js 的口径）。
//
// 改｜2026-11-02 16:35｜大鱼·子会话（工作台）｜授权：主人（本次任务书：别拿硬闸，让她看得见钱自己决定）｜
// lib/cost.js:1-60,260-340｜新增 bridgeBudget/qqBudgetUsed/recentSaid/recentSpends；「钱的事」补三样：
// 最近 10 分钟说了几条、这小时花了多少／小时上限、现在峰时还是谷时差多少｜
// 为什么：原来只有"今天一共"和"还剩多少"，她看不见自己说话的速度和现在的单价，也就判断不了值不值｜
// 验证：node --check lib/cost.js；node scripts/measure-injection.mjs（24205 → 见收尾记录，基线 24629）；
// node scripts/regression.mjs 0 失败｜可改：可改；只许报数，不许加"省着点/别说了"这类替她决定的话
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { qqBridgeRoot } from './paths.js'
import { fmt } from './clock.js'
import { isPeak } from './peak.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const QQ = qqBridgeRoot()
const USAGE = path.join(QQ, 'state', 'token-usage.jsonl')
const BRIDGE_CONFIG = path.join(QQ, 'config.json')
// 桥自己记的发送流水：一次 qq_send_message / qq_reply 落一行 result。用它数"最近十分钟说了几条"。
const TOOL_CALLS = path.join(QQ, 'state', 'tool-calls.jsonl')
const SEND_TOOL = /^mcp__snowluma__qq_(send_message|reply|send_group_message|send_private_message)$/

// 与 model-prices.js 的 flash 空闲价一致（元/百万）
const PRICE = { hit: 0.02, miss: 1, write: 1, out: 4 }
// 官方价：off-peak rates are half of the peak rates（2026-11-02 核
// https://api-docs.deepseek.com/quick_start/pricing）。谷时价 = 上面那三档，峰时正好一倍。
// 这里只用来说清"现在贵多少"，不参与计价（计价仍走 PRICE + 峰时按官方口径另算，见 docs/时间.md）。
const PEAK_MULTIPLE = 2

/** 一行流水该记多少钱（三个桶）。所有算账的地方共用这一份，别各写一遍。 */
function rowCost(b = {}) {
  return (Number(b.cacheHit) || 0) / 1e6 * PRICE.hit
    + (Number(b.cacheMiss) || 0) / 1e6 * PRICE.miss
    + (Number(b.cacheWrite) || 0) / 1e6 * PRICE.write
    + (Number(b.output) || 0) / 1e6 * PRICE.out
}

/** 桥的预算设置（只读）：本小时上限、今天上限。读不到就 0（= 不写上限，不冒充有）。 */
export function bridgeBudget() {
  try {
    const b = JSON.parse(fs.readFileSync(BRIDGE_CONFIG, 'utf8').replace(/^\uFEFF/, ''))?.budget || {}
    return { enabled: b.enabled !== false, hourLimit: Number(b.hourLimit) || 0, dayLimit: Number(b.dayLimit) || 0 }
  } catch { return { enabled: false, hourLimit: 0, dayLimit: 0 } }
}

/**
 * 本地「这一天」和「最近一小时」从哪毫秒起。
 * 时区走 lib/clock.js（系统时间），不自己加偏移——写死 +8 换个时区就全错。
 * 小时用滚动 60 分钟：桥的 hourLimit 就是这么算的（now - t < 3600000），口径对齐才不会两边差一截。
 */
function windowStarts(now) {
  const hh = Number(fmt(now, 'HH'))
  const mi = Number(fmt(now, 'mm'))
  const ss = Number(fmt(now, 'ss'))
  const ms = new Date(now).getMilliseconds()
  return { hourStart: now - 3600000, dayStart: now - ((hh * 3600 + mi * 60 + ss) * 1000 + ms) }
}

/**
 * QQ 侧这个小时／今天各花了多少（元）。
 * 只报事实：不设闸、不劝。峰谷差价由调用方按 lib/peak.js 判断。
 */
export function qqBudgetUsed({ now = Date.now() } = {}) {
  const { hourStart, dayStart } = windowStarts(now)
  let hour = 0
  let day = 0
  for (const r of readRows()) {
    const t = Number(r.t) || 0
    if (!t || t > now) continue
    const c = rowCost(r.b)
    if (t >= dayStart) day += c
    if (t >= hourStart) hour += c
  }
  return { hour: Number(hour.toFixed(2)), day: Number(day.toFixed(2)) }
}

/**
 * 最近 N 分钟她自己发了几条消息（QQ 侧）。
 * 数的是桥的发送流水（tool-calls.jsonl 里成功的 send/reply），一个回合分几条发就算几条——
 * "说了几条"问的是嘴，不是回合。会话→是谁 用 token-usage 的 author 认，认不出不算。
 * 读不到流水就返回 null：让注入写"读不到"，不拿 0 冒充"没说话"。
 */
export function recentSaid(role, { now = Date.now(), minutes = 10 } = {}) {
  if (!role) return null
  let text = ''
  try { text = fs.readFileSync(TOOL_CALLS, 'utf8') } catch { return null }
  const own = new Map()
  for (const r of readRows()) if (r.sid && r.author) own.set(String(r.sid), String(r.author))
  const since = now - minutes * 60000
  let n = 0
  for (const line of text.split(/\r?\n/)) {
    if (!line || line[0] !== '{') continue
    let r
    try { r = JSON.parse(line) } catch { continue }
    if (r?.type !== 'result' || r.ok !== true) continue
    if (!SEND_TOOL.test(String(r.tool || ''))) continue
    const t = Date.parse(String(r.time || '')) || 0
    if (!t || t < since || t > now + 60000) continue
    if (own.get(String(r.sessionId || '')) !== String(role)) continue
    n += 1
  }
  return n
}

/** 最近几笔（按回合合起来的 QQ 花费），给她自己查账用。 */
export function recentSpends(role, { now = Date.now(), n = 5 } = {}) {
  if (!role) return []
  const map = new Map()
  for (const r of readRows()) {
    if (String(r.author || '') !== String(role)) continue
    const t = Number(r.t) || 0
    if (!t || t > now) continue
    const k = `${r.sid || '?'}|${r.turn || 0}`
    const cur = map.get(k) || { at: 0, yuan: 0, 在哪: String(r.key || '') }
    cur.yuan += rowCost(r.b)
    cur.at = Math.max(cur.at, t)
    map.set(k, cur)
  }
  return [...map.values()].sort((a, b) => b.at - a.at).slice(0, n)
    .map((x) => ({ 什么时候: fmt(x.at, 'MM-DD HH:mm'), 在哪: x.在哪, 多少: Number(x.yuan.toFixed(4)) }))
}

function pad(n) { return String(n).padStart(2, '0') }
function dayKey(ms) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

/** 本期从哪天开始（budget.json 的「本期」写着「2026-10-29 ~ 2026-11-11」）。读不出返回 0。 */
export function periodStartMs(b) {
  const m = String(b?.本期 || '').match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return 0
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
}

/**
 * 今天一共花了多少——**所有来源**：不管 author、不管 QQ 还是工作台，全按流水折价。
 * 2026-11-03（老板：怎么总是顶着 QQ，我要看总额）：以前只报 QQ 侧，工作台的回合
 * 明明已经流进同一本 token-usage.jsonl（key=workbench），却没被算进「今天花了」。
 * 只统计，不设限。
 */
export function spendTodayAll({ now = Date.now() } = {}) {
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  let cost = 0
  let turns = 0
  for (const r of readRows()) {
    const t = Number(r.t) || 0
    if (!t || t < start.getTime() || t > now) continue
    cost += rowCost(r.b)
    turns += 1
  }
  return { turns, yuan: Number(cost.toFixed(3)) }
}

/**
 * 某人自己名下花了多少。QQ 那侧流水带 author，能分到人；工作台回合没署名，分不到人不假装。
 * 只统计，不设限。
 */
export function spendForRole(role, { sinceMs = 0, now = Date.now() } = {}) {
  if (!role) return { turns: 0, yuan: 0 }
  const rows = readRows().filter((r) => {
    const t = Number(r.t) || 0
    return t && t >= sinceMs && t <= now && String(r.author || '') === String(role)
  })
  let cost = 0
  for (const r of rows) cost += rowCost(r.b)
  return { turns: rows.length, yuan: Number(cost.toFixed(3)) }
}

/**
 * 自己那份额度还剩多少。
 * 2026-10-30 改：以前读 budget.json 里写死的「余额」——那数从设额度那天起没动过，
 * 花 2 块和花 0 块看到的都一样。现在按真实流水现算：余额 = 总额 - 本期已花。
 * 只报事实：不劝、不拦、不告诉她该怎么做。
 */
function ownBudgetLine(role, now) {
  if (!role) return ''
  try {
    const p = path.join(HOME, 'dayu', 'runtime', role, 'budget.json')
    const b = JSON.parse(fs.readFileSync(p, 'utf8'))
    const total = Number(b.总额)
    if (!Number.isFinite(total)) {
      return `\n你自己那份账还没有额度（老板还没给）；今天已经花了多少，账本里记着。`
    }
    const startMs = periodStartMs(b)
    const span = startMs ? spendForRole(role, { sinceMs: startMs, now }) : { turns: 0, yuan: Number(b.已用 || 0) }
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
    const today = spendForRole(role, { sinceMs: todayStart.getTime(), now })
    const used = Number(span.yuan.toFixed(2))
    const rest = Number((total - used).toFixed(2))
    const end = b.本期 ? String(b.本期).split('~').pop().trim() : ''
    // 她给自己定的日上限（不是别人下的命令）：只把数和差摆出来，不加话。
    const limit = Number(b.我的日上限) || 0
    const limitLine = limit
      ? `\n你自己定的日上限 ${limit.toFixed(2)} 元，今天已经 ${today.yuan.toFixed(2)}（${today.yuan > limit ? '超了' : '还没到'}）。`
      : ''
    // 宿主账本停了就别拿 0 冒充数（2026-10-31 实撞：停了 15 小时，工作台花费全是 0）。
    let staleLine = ''
    try {
      const wb = usageBetween(now - 6 * 3600 * 1000, now)
      if (wb.stale && wb.lastAt) {
        const hours = Math.floor((now - wb.lastAt) / 3600 / 1000)
        staleLine = `\n（工作台那边的账本停在 ${hours} 小时前，所以上面只有 QQ 侧的数；那边的花费看不见，不是没花。）`
      }
    } catch { /* 读不到就不说 */ }
    return `\n**你的钱：还剩 ${rest.toFixed(2)} 元**（本期 ${total.toFixed(2)}${end ? `，到 ${end}` : ''}，已花 ${used.toFixed(2)}，实时；今天名下 ${today.yuan.toFixed(2)}）`
      + `${limitLine}${staleLine}`
  } catch { return '' }
}

/** 今天还能搞砸几次（读 runtime/<role>/失败额度.json；没有就不写）。 */
function failQuotaLine(role, now) {
  if (!role) return ''
  try {
    const p = path.join(HOME, 'dayu', 'runtime', role, '失败额度.json')
    const q = JSON.parse(fs.readFileSync(p, 'utf8'))
    if (q.day !== dayKey(now)) return ''      // 跨天了，等它自己重置
    const left = Math.max(0, Number(q.上限 || 0) - Number(q.已用 || 0))
    if (!q.上限) return ''
    const tail = left > 0
      ? `用完就停手、报告，不再试。`
      : `**今天不许再动改不回来的东西** —— 停手，跟老板说。`
    return `\n今天还能搞砸 ${left} 次（上限 ${q.上限}，已用 ${q.已用 || 0}）。${tail}`
  } catch { return '' }
}


function readRows() {
  let text = ''
  try { text = fs.readFileSync(USAGE, 'utf8') } catch { return [] }
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    try { const r = JSON.parse(line); if (r?.k === 'turn' && r?.b) rows.push(r) } catch { /* 坏行跳过 */ }
  }
  return rows
}

// ── 工作台那侧的花费，归到人头上（2026-10-30）─────────────────────────
// 事实：宿主的 usage 事件只有 {ts, day, model, tokens, cost}，没有 session、没有角色。
// 所以只能"按回合窗口估"：
//   起回合时记一笔 pending（谁、什么时候），落账时把这段窗口里多出来的花费
//   记到当时唯一在跑的那个角色头上；两个角色同时跑就记「未署名」，不硬认。
// 自己的账（runtime/<role>/花费/<day>.json）里每条都带 source，看得见是估的。
const TRACK = path.join(HOME, 'dayu', 'runtime', 'dayu', '花费追踪.json')

function readTrack() {
  try { return JSON.parse(fs.readFileSync(TRACK, 'utf8').replace(/^\uFEFF/, '')) } catch { return { lastAt: Date.now(), lastCost: totalCost(), pending: [] } }
}

function writeTrack(doc) {
  try {
    fs.mkdirSync(path.dirname(TRACK), { recursive: true })
    const tmp = `${TRACK}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 1), 'utf8')
    fs.renameSync(tmp, TRACK)
  } catch { /* 记不下不影响说话 */ }
}

/** 全量累计花费（所有行），给窗口差用。 */
function totalCost() {
  let c = 0
  for (const r of readRows()) c += rowCost(r.b)
  return c
}

/**
 * 某段时间里工作台这侧花了多少。
 * 数据源是宿主的 `~/.dsh/.dshw-usage.json`（每条 {ts, day, model, tokens, cost}）。
 * 实测对得上：今天它合计 51.158 + QQ 那侧 1.24 = 审计总数 52.40——**这一份里不含 QQ**，
 * 所以拿它算工作台正好，不会跟桥的账重复。
 */
export function usageBetween(fromMs, toMs = Date.now()) {
  let events = []
  try {
    const j = JSON.parse(fs.readFileSync(path.join(HOME, '.dshw-usage.json'), 'utf8'))
    events = Array.isArray(j?.events) ? j.events : []
  } catch { return { calls: 0, tokens: 0, cost: 0, stale: true, lastAt: 0 } }
  let cost = 0
  let tokens = 0
  let calls = 0
  let lastAt = 0
  for (const e of events) {
    const t = Number(e.ts) || 0
    if (t > lastAt) lastAt = t
    if (!(t > fromMs && t <= toMs)) continue
    calls += 1
    tokens += Number(e.tokens) || 0
    cost += Number(e.cost) || 0
  }
  // 2026-10-31：这份账是宿主写的，会停（实测从 10-30 22:18 起停了 15 小时）。
  // 停了还照样返回 0，看着就像"今天没花钱"——那是假数。这里如实标出来。
  const stale = !lastAt || (toMs - lastAt) > 3 * 3600 * 1000
  return { calls, tokens, cost: Number(cost.toFixed(6)), stale, lastAt }
}

/** 起一个回合：记下"谁在跑"。落账时靠它认人。 */
export function noteTurnStart(role, { now = Date.now() } = {}) {
  if (!role) return
  const doc = readTrack()
  doc.pending = [...(doc.pending || []).slice(-20), { role, at: now }]
  writeTrack(doc)
}

/**
 * 落账：把上次到现在多出来的花费，记给当时唯一在跑的那个角色。
 * 一次跑账只认一个；同时有两个就记「未署名」，并把候选人写进去。
 */
export function settleSpend({ now = Date.now() } = {}) {
  const doc = readTrack()
  const since = Number(doc.lastAt) || now
  if (now - since < 60 * 1000) return { ok: true, skipped: '太短，先不结' }
  const delta = usageBetween(since, now)
  const pending = (doc.pending || []).filter((p) => Number(p.at) >= since - 30 * 1000)
  const roles = [...new Set(pending.map((p) => p.role))]
  const who = roles.length === 1 ? roles[0] : ''
  if (delta.cost > 0.0005) {
    const day = dayKey(now)
    const file = path.join(HOME, 'dayu', 'runtime', who || 'dayu', '花费', `${day}.json`)
    let doc2 = { day, items: [], sum: 0 }
    try { doc2 = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { /* 新的一天 */ }
    doc2.items = [...(doc2.items || []).slice(-200), {
      at: new Date(now).toISOString(),
      from: new Date(since).toISOString(),
      to: new Date(now).toISOString(),
      cost: Number(delta.cost.toFixed(4)),
      calls: delta.calls,
      tokens: delta.tokens,
      who: who || '未署名',
      candidates: roles,
      source: roles.length === 1 ? '估算·回合窗口' : '估算·多角色混合',
    }]
    doc2.sum = Number(doc2.items.reduce((a, x) => a + (Number(x.cost) || 0), 0).toFixed(4))
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const tmp = `${file}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(doc2, null, 1), 'utf8')
      fs.renameSync(tmp, file)
    } catch { /* 写不进就算了 */ }
  }
  doc.lastAt = now
  doc.pending = []
  writeTrack(doc)
  return { ok: true, cost: delta.cost, who: who || '未署名', candidates: roles }
}

/** 某天某人名下记了多少（工作台那侧的估算）。 */
export function attributedFor(role, day = dayKey(Date.now())) {
  const file = path.join(HOME, 'dayu', 'runtime', role, '花费', `${day}.json`)
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    return { day, sum: Number(d.sum) || 0, items: d.items || [] }
  } catch { return { day, sum: 0, items: [] } }
}

/** 今天（按本地日期）花了多少，以及最后一次回合的 token。 */
export function spendToday({ now = Date.now() } = {}) {
  const day = dayKey(now)
  const rows = readRows().filter((r) => {
    const t = Number(r.t) || 0
    return t && dayKey(t) === day
  })
  let cost = 0
  let last = null
  for (const r of rows) {
    cost += rowCost(r.b)
    last = r.b
  }
  return { day, turns: rows.length, yuan: Number(cost.toFixed(3)), last }
}

/** 一次云端回合大概多少钱（拿今天均值；没数据用默认形状）。 */
export function perTurnEstimate({ now = Date.now() } = {}) {
  const s = spendToday({ now })
  if (s.turns > 0) return Number((s.yuan / s.turns).toFixed(4))
  return 0.004
}

/** 给她看的一句话：不是命令，是报价。 */
export function costLine({ now = Date.now(), cache = null, role = '' } = {}) {
  const key = dayKey(now)
  if (cache && cache.day === key && Date.now() - (cache.at || 0) < 5 * 60000) return cache.line
  const per = perTurnEstimate({ now })
  let alerts = ''
  try {
    const p = path.join(HOME, 'dayu', 'inbox.jsonl')
    const rows = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).slice(-200)
    const recent = rows.map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter((r) => r && r.status === 'cost' && String(r.at || '').startsWith(new Date(now).toISOString().slice(0, 10)))
    if (recent.length) alerts = `\n账上记着：${recent.slice(-2).map((r) => String(r.text).replace(/^【账】/, '')).join('；')}。要不要跟他说、怎么说，你自己定。`
  } catch { /* 没账就不写 */ }
  // 只报数。不劝、不催——花不花是她自己的事（老板 2026-10-30 的话：不要用代码去控制她做什么）。
  //
  // 2026-11-02 老板：「我要的是她能自己判断、知道钱是什么概念，会自己克制，而不是花到限额就强行停。」
  // 所以这里摆四样事实，不下结论：
  //   ① 今天一共多少、上限多少；② 这小时多少、上限多少（桥的 rolling hour）；
  //   ③ 最近 10 分钟说了几条（她自己的嘴速）；④ 现在峰时还是谷时、单价差多少。
  // 最后一句只说"你自己判断"——说多说少是她的选择，不替她决定。
  const used = qqBudgetUsed({ now })
  const bb = bridgeBudget()
  const said = recentSaid(role, { now })
  const dayCap = bb.dayLimit > 0 ? `（上限 ${bb.dayLimit}）` : ''
  const hourCap = bb.hourLimit > 0 ? `（上限 ${bb.hourLimit}）` : ''
  const saidTxt = said === null ? '最近 10 分钟说了几条：读不到' : `最近 10 分钟你说了 ${said} 条`
  // 峰谷只认 lib/peak.js 的口径（官方按北京时间）；现在几点必须走 lib/clock.js（系统时间），不自己加偏移。
  const peakNow = isPeak(new Date(now))
  const priceTxt = peakNow
    ? `现在峰时，单价是谷时的 ${PEAK_MULTIPLE} 倍`
    : '现在谷时，单价是峰时的一半'
  const line = `## 钱的事\nQQ 那边今天一共 ${used.day.toFixed(2)} 元${dayCap}；这小时 ${used.hour.toFixed(2)} 元${hourCap}。`
    + `\n${saidTxt}；${priceTxt}。说多说少你自己判断。`
    + `\n一次云端回合大约 ${per} 元；本地回 0 元。`
    + ownBudgetLine(role, now) + failQuotaLine(role, now) + alerts
  return line
}

/**
 * 「Token 回」面板的数据（2026-10-31 23:0x）。
 * 原来这个面板调别人的接口 `/api/token-budget/data`（dsh-token-budget 插件），
 * 宿主一重启/插件没挂上，就回一句 `not found`，面板报「Unexpected token 'o'」——
 * 我们自己的页面不该靠别人插件的路由活着。这里用我们自己的流水算同一份形状：
 *   today{cost,balance,turns,calls,tokens,perCall} / sources[] / items[]
 */
export function tokenView({ now = Date.now(), balance = null } = {}) {
  const day = dayKey(now)
  const srcName = (key) => {
    const k = String(key || '')
    if (k.includes('黑话')) return '黑话学习'
    if (k.startsWith('private:')) return '私聊'
    if (k.startsWith('group:')) return '群聊'
    return k || '其他'
  }
  const rows = readRows().filter((r) => {
    const t = Number(r.t) || 0
    return t && dayKey(t) === day
  })
  const turns = new Map()
  for (const r of rows) {
    const b = r.b || {}
    const inTok = (Number(b.cacheHit) || 0) + (Number(b.cacheMiss) || 0) + (Number(b.cacheWrite) || 0)
    const outTok = Number(b.output) || 0
    const price = (Number(b.cacheHit) || 0) / 1e6 * PRICE.hit
      + (Number(b.cacheMiss) || 0) / 1e6 * PRICE.miss
      + (Number(b.cacheWrite) || 0) / 1e6 * PRICE.write
      + outTok / 1e6 * PRICE.out
    const sk = `${r.sid || '?'}|${r.turn || 0}`
    const cur = turns.get(sk) || {
      sid: String(r.sid || ''), turn: Number(r.turn) || 0, source: srcName(r.key),
      calls: 0, tokens: 0, input: 0, output: 0, cost: 0,
      first: Number(r.t) || 0, last: Number(r.t) || 0,
    }
    cur.calls += 1
    cur.input += inTok
    cur.output += outTok
    cur.tokens += inTok + outTok
    cur.cost += price
    cur.first = Math.min(cur.first, Number(r.t) || cur.first)
    cur.last = Math.max(cur.last, Number(r.t) || cur.last)
    turns.set(sk, cur)
  }
  const items = [...turns.values()].sort((a, b) => b.last - a.last).map((it) => ({ ...it, cost: Number(it.cost.toFixed(6)) }))
  const calls = rows.length
  const totalTokens = items.reduce((a, x) => a + x.tokens, 0)
  const totalCost = items.reduce((a, x) => a + x.cost, 0)
  const bySource = new Map()
  for (const it of items) {
    const cur = bySource.get(it.source) || { name: it.source, turns: 0, calls: 0, tokens: 0, cost: 0 }
    cur.turns += 1
    cur.calls += it.calls
    cur.tokens += it.tokens
    cur.cost += it.cost
    bySource.set(it.source, cur)
  }
  const sources = [...bySource.values()]
    .map((s) => ({ ...s, cost: Number(s.cost.toFixed(6)) }))
    .sort((a, b) => b.cost - a.cost)
  return {
    day,
    source: 'yushen', // 这份是我们自己算的；不是别人插件的数
    today: {
      cost: Number(totalCost.toFixed(4)),
      balance: balance === null ? null : Number(balance),
      turns: items.length,
      calls,
      tokens: totalTokens,
      perCall: calls ? Number((totalCost / calls).toFixed(6)) : 0,
    },
    sources,
    items,
  }
}
