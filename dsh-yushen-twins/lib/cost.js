// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 账：今天花了多少、云端一次大概多少、本地回是免费的。
//
// 用途只有一个：**把数摆给她看**——不是拿它当闸门，也不是替她决定花不花。
// 数据源：桥的 token-usage.jsonl（三个桶）+ 官方价目表（model-prices.js 的口径）。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { qqBridgeRoot } from './paths.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const QQ = qqBridgeRoot()
const USAGE = path.join(QQ, 'state', 'token-usage.jsonl')

// 与 model-prices.js 的 flash 空闲价一致（元/百万）
const PRICE = { hit: 0.02, miss: 1, write: 1, out: 4 }

function pad(n) { return String(n).padStart(2, '0') }
function dayKey(ms) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

/** 本期从哪天开始（budget.json 的「本期」写着「2026-10-29 ~ 2026-11-11」）。读不出返回 0。 */
export function periodStartMs(b) {
  const m = String(b?.本期 || '').match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return 0
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
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
  for (const r of rows) {
    const b = r.b || {}
    cost += (Number(b.cacheHit) || 0) / 1e6 * PRICE.hit
      + (Number(b.cacheMiss) || 0) / 1e6 * PRICE.miss
      + (Number(b.cacheWrite) || 0) / 1e6 * PRICE.write
      + (Number(b.output) || 0) / 1e6 * PRICE.out
  }
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
    return `\n**你的钱：还剩 ${rest.toFixed(2)} 元**（本期 ${total.toFixed(2)}${end ? `，到 ${end}` : ''}，已花 ${used.toFixed(2)}，实时）`
      + `\n今天你名下 ${today.yuan.toFixed(2)} 元（${today.turns} 回合，QQ 侧）${limitLine}${staleLine}`
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
  for (const r of readRows()) {
    const b = r.b || {}
    c += (Number(b.cacheHit) || 0) / 1e6 * PRICE.hit
      + (Number(b.cacheMiss) || 0) / 1e6 * PRICE.miss
      + (Number(b.cacheWrite) || 0) / 1e6 * PRICE.write
      + (Number(b.output) || 0) / 1e6 * PRICE.out
  }
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
    const b = r.b || {}
    cost += (Number(b.cacheHit) || 0) / 1e6 * PRICE.hit
      + (Number(b.cacheMiss) || 0) / 1e6 * PRICE.miss
      + (Number(b.cacheWrite) || 0) / 1e6 * PRICE.write
      + (Number(b.output) || 0) / 1e6 * PRICE.out
    last = b
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
  const s = spendToday({ now })
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
  const line = `## 钱的事\nQQ 那边今天一共 ${s.yuan} 元（${s.turns} 回合）；一次云端回合大约 ${per} 元；本地回 0 元，不回也 0 元。`
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
