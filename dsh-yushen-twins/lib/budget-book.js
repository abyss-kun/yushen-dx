// 账：三个人各自的额度、已用、剩余。2026-10-29 从桌面气泡搬进面板时新建。
//
// 为什么放这儿：老板说「算账的可以放到后台，小鱼里面界面可以填空那种」。
// 桌面留着她和一句状态就够了；要改额度这种正经事，应该在面板里填、有保存、有记录。
import fs from 'node:fs'
import path from 'node:path'
import { dshHome } from './paths.js'

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
