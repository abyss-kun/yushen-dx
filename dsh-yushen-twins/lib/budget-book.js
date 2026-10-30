// 账：三个人各自的额度、已用、剩余。2026-10-29 从桌面气泡搬进面板时新建。
//
// 为什么放这儿：老板说「算账的可以放到后台，小鱼里面界面可以填空那种」。
// 桌面留着她和一句状态就够了；要改额度这种正经事，应该在面板里填、有保存、有记录。
import fs from 'node:fs'
import path from 'node:path'
import { dshHome } from './paths.js'
import { spendForRole, periodStartMs } from './cost.js'

const ROLES = [['dayu', '大鱼'], ['xiaoyu', '小鱼'], ['dragon', '照微']]

function fileOf(role) {
  return path.join(dshHome(), 'dayu', 'runtime', role, 'budget.json')
}

function readOne(role) {
  try {
    const d = JSON.parse(fs.readFileSync(fileOf(role), 'utf8').replace(/^\uFEFF/, ''))
    return {
      role,
      total: Number(d.总额 ?? d.total ?? 0),
      used: Number(d.已用 ?? d.used ?? 0),
      rest: Number(d.余额 ?? d.rest ?? 0),
      days: Number(d.本期天数 ?? 0),
      raw: d,
    }
  } catch {
    return { role, total: 0, used: 0, rest: 0, days: 0, raw: null }
  }
}

export function readBudgets() {
  const rows = ROLES.map(([role, name]) => {
    const b = readOne(role)
    return { role, name, total: b.total, used: b.used, rest: b.rest, days: b.days, missing: b.raw === null }
  })
  const sum = rows.reduce((a, r) => ({ total: a.total + r.total, used: a.used + r.used, rest: a.rest + r.rest }),
    { total: 0, used: 0, rest: 0 })
  return { ok: true, rows, sum }
}

/** 改某人的本期总额。写之前记一条，写之后重算余额（余额 = 总额 - 已用）。 */
export function setBudget(role, total, days = 0) {
  const t = Number(total)
  if (!Number.isFinite(t) || t < 0 || t > 10000) return { ok: false, error: '额度要是个 0–10000 的数' }
  const b = readOne(role)
  if (!b.raw) return { ok: false, error: '这个人还没有账本（先让鱼神跑起来一次）' }
  const next = { ...b.raw, 总额: Number(t.toFixed(2)), 余额: Number((t - b.used).toFixed(2)) }
  if (Number(days) > 0) next.本期天数 = Number(days)
  const p = fileOf(role)
  const tmp = `${p}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8')
  fs.renameSync(tmp, p)
  // 改动记录：谁改的、什么时候、从多少到多少
  try {
    const log = path.join(dshHome(), 'dayu', 'runtime', role, '额度改动.jsonl')
    fs.appendFileSync(log, JSON.stringify({
      at: new Date().toISOString(), from: b.total, to: Number(t.toFixed(2)), by: 'owner',
    }) + '\n', 'utf8')
  } catch { /* 记不下不影响改 */ }
  return { ok: true, role, total: Number(t.toFixed(2)), rest: next.余额 }
}

// ── 自己管账（2026-10-30 老板要的测试：让她自己看得见、自己记、自己定心情价）──────
// 边界：这里只写"她自己那本"，不改额度、不设闸、不催。额度仍是老板的。
// 余额一直按真实流水现算（cost.js）；她的手记是**另一件事**——写"为什么花、值不值"，
// 不参与余额，避免和系统测得的花费重复计算。

function readRaw(role) {
  try { return JSON.parse(fs.readFileSync(fileOf(role), 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
}

function writeRaw(role, data) {
  const p = fileOf(role)
  const tmp = `${p}.tmp`
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, p)
}

/** 她自己那本账的样子：剩多少（现算）、今天花了多少、她定的日上限、最近手记。 */
export function budgetView(role, { now = Date.now() } = {}) {
  const b = readRaw(role)
  if (!b) return { ok: false, error: '还没有账本' }
  const total = Number(b.总额)
  const start = periodStartMs(b)
  const period = start ? spendForRole(role, { sinceMs: start, now }) : { turns: 0, yuan: 0 }
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0)
  const today = spendForRole(role, { sinceMs: dayStart.getTime(), now })
  const limit = Number(b.我的日上限) || 0
  return {
    ok: true,
    role,
    本期给: Number.isFinite(total) ? total : null,
    现算已花: period.yuan,
    现在剩: Number.isFinite(total) ? Number((total - period.yuan).toFixed(2)) : null,
    今天花了: today.yuan,
    今天回合: today.turns,
    我定的日上限: limit || null,
    超没超: limit ? today.yuan > limit : null,
    手记: (Array.isArray(b.明细) ? b.明细 : []).slice(-5),
  }
}

/** 记一笔自己认为的花费（写进她自己那本的明细；不参与余额计算）。 */
export function recordSpend(role, { amount, what, why = '', now = Date.now() } = {}) {
  const n = Number(amount)
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: '金额要是个非负数' }
  const b = readRaw(role)
  if (!b) return { ok: false, error: '还没有账本' }
  const list = Array.isArray(b.明细) ? b.明细 : []
  list.push({
    at: new Date(now).toISOString(),
    花了多少: Number(n.toFixed(3)),
    买了什么: String(what || '').slice(0, 80),
    为什么: String(why || '').slice(0, 160),
    by: role,
  })
  b.明细 = list.slice(-200)
  writeRaw(role, b)
  return { ok: true, role, 记了: Number(n.toFixed(3)), 条数: b.明细.length }
}

/** 她自己定日上限（传 0 取消）。这是她给自己定的，不是别人下的命令。 */
export function setDailyLimit(role, yuan) {
  const n = Number(yuan)
  if (!Number.isFinite(n) || n < 0 || n > 10000) return { ok: false, error: '日上限要是个 0–10000 的数（0 = 取消）' }
  const b = readRaw(role)
  if (!b) return { ok: false, error: '还没有账本' }
  if (n === 0) delete b.我的日上限
  else b.我的日上限 = Number(n.toFixed(2))
  writeRaw(role, b)
  return { ok: true, role, 我定的日上限: n === 0 ? null : Number(n.toFixed(2)) }
}
