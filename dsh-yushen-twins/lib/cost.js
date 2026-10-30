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
    return `\n**你自己的那份：还剩 ${rest.toFixed(2)} 元**（本期给 ${total.toFixed(2)}${end ? `，到 ${end}` : ''}，已花 ${used.toFixed(2)}；按真实流水现算，每轮都会变）`
      + `\n今天你名下 ${today.yuan.toFixed(2)} 元（${today.turns} 回合）——QQ 那侧的账，工作台回合没署名，分不到人。${limitLine}`
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
