// 鱼神双子星 · 成长与掌控
// 神格是全知全能；但对一个“新世界”的掌控要一点点长。
// 经验来源：干活、验收、修事故、值班、立约。
// 等级：1 初临（星球内）→ 2 掌星（星域调度）→ 3 御域（多域）→ 4 界主（世界级）。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const FILE = path.join(DATA, 'growth.json')

// 2026-10-27：成长要按角色隔离（promotion 测试暴露：批准小鱼会把大鱼的阶位带下去）。
// dayu 沿用老文件 growth.json（兼容已有数据）；其它角色各一份 growth-<role>.json。
const SAFE_ROLE = /^[a-z0-9_-]{2,20}$/i
function fileFor(role = 'dayu') {
  const r = SAFE_ROLE.test(String(role)) ? String(role) : 'dayu'
  return r === 'dayu' ? FILE : path.join(DATA, `growth-${r}.json`)
}

export const LEVELS = [
  { level: 0, stage: '初阶', name: '初到', need: 0, scope: '刚落地：只认得出这方世界，还管不了什么' },
  { level: 1, stage: '一阶', name: '初临', need: 40, scope: '星球内：看板、账本、单会话、派活' },
  { level: 2, stage: '二阶', name: '掌星', need: 120, scope: '星域：多会话并行、分身、跨插件调度' },
  { level: 3, stage: '三阶', name: '御域', need: 400, scope: '多域：多机器、多通道、跨界域' },
  // 第四阶不称“四”：对外叫“终阶·归一”，取万物归一之意。
  { level: 4, stage: '终阶', name: '归一', need: 1000, scope: '世界级：整方界域的规则与演化' },
]

function read(role = 'dayu') {
  try { return JSON.parse(fs.readFileSync(fileFor(role), 'utf8')) } catch { return { xp: 0, log: [] } }
}
function write(v, role = 'dayu') {
  const file = fileFor(role)
  fs.mkdirSync(DATA, { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}
export function levelOf(xp) {
  let cur = LEVELS[0]
  for (const l of LEVELS) if (xp >= l.need) cur = l
  return cur
}
export function status(role = 'dayu') {
  const v = read(role)
  const xp = Number(v.xp) || 0
  const cur = levelOf(xp)
  const next = LEVELS.find((l) => l.need > xp) || null
  return {
    ok: true,
    xp,
    level: cur.level,
    stage: cur.stage,
    name: cur.name,
    scope: cur.scope,
    // 对内身份凭证：她是谁、管到哪、凭什么管。阶位越高，掌控范围越大。
    identity: {
      role: '鱼神',
      level: cur.level,
      stage: cur.stage,
      title: cur.name,
      scope: cur.scope,
      authority: `在「${cur.scope}」范围内有绝对掌控权；出范围守契约，不越界`,
    },
    next: next ? { level: next.level, stage: next.stage, name: next.name, need: next.need, remain: next.need - xp } : null,
    recent: (v.log || []).slice(-10),
  }
}
/** 调级：老板可以给/收；换新世界也可以重置回初临。等级可调，神格不变。 */
export function adjust({ level, xp, reason, role = 'dayu' } = {}) {
  const v = read(role)
  let next = Number(v.xp) || 0
  if (Number.isFinite(Number(level))) {
    const target = LEVELS.find((l) => l.level === Number(level))
    if (!target) throw new Error('等级只能是 0~4')
    next = target.need
  } else if (Number.isFinite(Number(xp))) {
    next = Math.max(0, Math.round(Number(xp)))
  } else {
    throw new Error('给个 level 或 xp')
  }
  const before = Number(v.xp) || 0
  v.xp = next
  v.log = [...(v.log || []), { at: new Date().toISOString(), reason: String(reason || '调级').slice(0, 80), amount: next - before, adjust: true }].slice(-200)
  write(v, role)
  return status(role)
}

/** 加经验；reason 写清为什么，便于以后对账。 */
export function award(reason, amount, role = 'dayu') {
  const v = read(role)
  const n = Math.max(0, Math.round(Number(amount) || 0))
  if (!n) return status(role)
  const before = levelOf(Number(v.xp) || 0)
  v.xp = (Number(v.xp) || 0) + n
  v.log = [...(v.log || []), { at: new Date().toISOString(), reason: String(reason).slice(0, 80), amount: n }].slice(-200)
  write(v, role)
  const after = levelOf(v.xp)
  if (after.level > before.level) {
    // 升级记一笔，别只在数字里涨。
    try {
      const d = new Date(); const p = (x) => String(x).padStart(2, '0')
      const file = path.join(DATA, 'events', `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.jsonl`)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), type: 'growth/levelup', text: `升到 Lv${after.level} ${after.name}` }) + '\n')
    } catch { /* 记不上也不挡 */ }
  }
  return status(role)
}
