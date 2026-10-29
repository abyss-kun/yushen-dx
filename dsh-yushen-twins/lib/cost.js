// 账：今天花了多少、云端一次大概多少、本地回是免费的。
//
// 用途只有一个：**告诉她**，好让她自己悠着点——不是拿它当闸门。
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

/** 自己那份额度还剩多少（读 runtime/<role>/budget.json；没有就不写）。 */
function ownBudgetLine(role, now) {
  if (!role) return ''
  try {
    const p = path.join(HOME, 'dayu', 'runtime', role, 'budget.json')
    const b = JSON.parse(fs.readFileSync(p, 'utf8'))
    const rest = b.余额
    const total = b.总额
    if (rest === null || rest === undefined) {
      return `\n你自己那份账还没有额度（老板还没给）；今天已经花了多少，账本里记着。`
    }
    const used = b.已用 ?? 0
    return `\n**你自己的那份：还剩 ${Number(rest).toFixed(2)} 元**（本期给 ${Number(total).toFixed(2)}，已用 ${Number(used).toFixed(2)}）。花完就没有了，不是从别人那儿挪。`
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
  const line = `## 钱的事\n今天云端花了 ${s.yuan} 元（${s.turns} 次）；一次云端回合大约 ${per} 元；本地回是 0 元；不回的 0 元。主人不是富翁，你悠着点——怎么花、花不花，你自己定。`
    + ownBudgetLine(role, now) + failQuotaLine(role, now) + alerts
  return line
}
