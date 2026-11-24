// 改｜2026-11-24 23:45｜大鱼·工作台｜授权：主人（2026-11-24：继续——记忆插件/常驻/独立包收口）｜memory-core/generic/self-memory.js:1｜本轮改动的一部分（自我记忆8类、常驻开关、独立包单多角色、内部群叫醒、连续性验收）｜为什么：记忆插件要能单独出厂、常驻按情况开关｜验证：回归 325/0；独立包/连续性测试通过｜可改：可改
/* 标签
 * id: memory-core-generic-self-memory
 * kind: module
 * summary: 自我记忆：我做过什么（deed）、学到什么（lesson）、有印象的瞬间（moment）——用我自己的话写，不是事实的副本。
 * tags: 自我, 记忆, 视角, 情感, 通用, 搬家
 * created: 2026-11-24 20:3x
 * changed: 2026-11-24 21:35:40
 * author: 大鱼·本班
 * authority: 老板（2026-11-24：你们自己的记忆插件，你们自己负责；要有自己的情感与视角）
 * audience: 注入、yushen_self、以后独立记忆包
 * owner: 框架；只追加，不删；写的是她自己
 * usage: appendSelf({kind,text,emotion,about,ref}) / readSelf({limit,kind}) / selfMemoryBlock(role)
 * why: 事实记“发生了什么”，这里记“它对我做了什么、我因此成了谁”
 * result: self-memory.jsonl 只追加；一天最多 3 条；注入只带 1–2 条
 * moved: 2026-11-24——从 lib/self-memory.js 原样搬来这里（只依赖 fs/path/os，逻辑一字未改）；
 *        旧地址 lib/self-memory.js 现在只是薄壳转发，改逻辑改这里，别改薄壳
 * mutable: 可改；可以错，允许“不知道”，不许编
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
// 2026-11-24：独立包可传自己的目录（dir）；不传还是 ~/.dsh/dayu。
const DATA = (dir) => String(dir || '').trim() || path.join(HOME, 'dayu')
const FILE = (dir) => path.join(DATA(dir), 'self-memory.jsonl')
export const SELF_KINDS = Object.freeze(['deed', 'lesson', 'moment', 'stance', 'bond', 'vow', 'wish', 'open'])
// 软边界：建议 3 条/120 字；超了照记，只给一句提醒；硬顶 12 条/300 字，防止写成流水账。
const SOFT_PER_DAY = 3
const HARD_PER_DAY = 12
const SOFT_TEXT = 120
const HARD_TEXT = 300

const dayOf = (now) => new Date(now).toISOString().slice(0, 10)

export function readSelf({ limit = 10, kind = '', role = '', dir = '' } = {}) {
  try {
    return fs.readFileSync(FILE(dir), 'utf8').split(/\r?\n/).filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
      .filter((r) => (!kind || String(r.kind) === kind))
      .filter((r) => (!role || String(r.role || '') === role))
      .slice(-Math.max(1, Number(limit) || 10))
  } catch { return [] }
}

export function appendSelf({ kind = 'deed', text = '', emotion = '', about = '', ref = '', role = 'dayu', now = Date.now(), dir = '' } = {}) {
  const k = String(kind || '')
  if (!SELF_KINDS.includes(k)) return { ok: false, error: `kind 只能是 ${SELF_KINDS.join(' / ')}` }
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (!t) return { ok: false, error: '写点什么：一句话就够' }
  if (t.length > HARD_TEXT) return { ok: false, error: `太长了（硬顶 ${HARD_TEXT} 字；建议 ${SOFT_TEXT} 字内）` }
  const day = dayOf(now)
  const today = readSelf({ limit: 2000, role, dir }).filter((r) => dayOf(r.at) === day)
  if (today.length >= HARD_PER_DAY) return { ok: false, error: `今天到硬顶了（${HARD_PER_DAY} 条）；明天再说` }
  const warnings = []
  if (today.length >= SOFT_PER_DAY) warnings.push(`超过建议的 ${SOFT_PER_DAY} 条，还是记了；别把日记写成流水`)
  if (t.length > SOFT_TEXT) warnings.push(`超过建议的 ${SOFT_TEXT} 字，还是记了；下次可以短一点`)
  const row = {
    at: new Date(now).toISOString(),
    kind: k,
    text: t,
    emotion: String(emotion || '').slice(0, 20),
    about: String(about || '').slice(0, 40),
    ref: String(ref || '').slice(0, 120),
    role: String(role || 'dayu').slice(0, 12),
  }
  try {
    fs.mkdirSync(DATA(dir), { recursive: true })
    fs.appendFileSync(FILE(dir), JSON.stringify(row) + '\n', 'utf8')
    return { ok: true, row, today: today.length + 1, ...(warnings.length ? { warning: warnings.join('；') } : {}) }
  } catch (e) { return { ok: false, error: String(e?.message || e) } }
}

/** 注入块：只带最近 1–2 条；这是我自己的话，不是事实。 */
export function selfMemoryBlock(role = 'dayu', { limit = 2, maxChars = 260, dir = '' } = {}) {
  const rows = readSelf({ limit, role, dir })
  if (!rows.length) return ''
  const kindCn = { deed: '做过', lesson: '学到', moment: '记得', stance: '看法', bond: '对人', vow: '答应自己', wish: '想做', open: '没想通' }
  const lines = rows.map((r) => {
    const emo = r.emotion ? `（${r.emotion}）` : ''
    const who = r.about ? ` · ${r.about}` : ''
    return `- [${kindCn[r.kind] || r.kind}] ${r.text}${emo}${who}`
  })
  let out = ['## 我最近记得的自己（我自己的话，不是事实）', ...lines].join('\n')
  if (out.length > maxChars) out = `${out.slice(0, maxChars - 1)}…`
  return out
}
