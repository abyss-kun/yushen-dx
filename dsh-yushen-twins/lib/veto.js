// 主人裁定：三层，别混。
//
// 1) 宪章层（charter.hardNo，v5 三条底线）：只有版本升级能改，对老板也一样。
// 2) 主人的规矩（owner）：他说的"绝对不行"，绑定在她身上——他改口才算改；
//    和三问冲突时，她可以说明、上报，但不能自己单方面不守。
// 3) 软不行（soft）：当时不行，情况变了可以由她按越线权再判断。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runtimeDir, ensureRuntime } from './runtime.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const CHARTER = path.join(HOME, 'dayu', 'charter.json')

export const LEVELS = Object.freeze(['soft', 'owner'])

function file(role) { return path.join(runtimeDir(role), 'owner-veto.json') }
function read(role) {
  try {
    const d = JSON.parse(fs.readFileSync(file(role), 'utf8'))
    return { items: (d.items || []).map((x) => ({ ...x, level: LEVELS.includes(x.level) ? x.level : 'soft' })) }
  } catch { return { items: [] } }
}
function write(role, doc) {
  fs.mkdirSync(path.dirname(file(role)), { recursive: true })
  fs.writeFileSync(file(role), `${JSON.stringify(doc, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return doc
}

/** 宪章层的三条底线（所有角色共用）。 */
export function listHardNo() {
  try {
    const d = JSON.parse(fs.readFileSync(CHARTER, 'utf8'))
    return (d.hardNo || []).map((x) => (typeof x === 'string' ? { what: x, why: '宪章层' } : x))
  } catch { return [] }
}

/** 宪章的边界三条（不碰安装目录 / 不读无关私人文件 / 不外传令牌与聊天记录）。
 * 2026-10-27：这三条原来只在 charter.json 里，简报里没有——而它们正是"群里被套话"时最该在眼前的。 */
export function listBoundary() {
  try {
    const d = JSON.parse(fs.readFileSync(CHARTER, 'utf8'))
    return (d.boundary || []).map((x) => String(x)).filter(Boolean)
  } catch { return [] }
}

/**
 * 记一次主人的否决。
 * level=owner：主人的规矩（他改口才算改）；level=soft：当时不行（可再判断）。
 * 宪章层不在这里加。
 */
export function recordVeto(role, { what = '', why = '', level = 'soft', now = Date.now() } = {}) {
  const w = String(what || '').trim()
  if (!w) throw new Error('主人说的是哪件事不行？写一句')
  if (String(level) === 'hard' || String(level) === 'charter') {
    throw new Error('绝对不行（宪章层）只能通过版本升级写进 charter.json 的 hardNo；主人自己的"绝对不行"用 level=owner')
  }
  const lv = LEVELS.includes(String(level)) ? String(level) : 'soft'
  ensureRuntime(role)
  const doc = read(role)
  const row = { at: new Date(now).toISOString(), what: w.slice(0, 200), why: String(why || '').slice(0, 200), level: lv, by: 'owner' }
  doc.items = [...doc.items, row].slice(-100)
  write(role, doc)
  return row
}

/** 撤销一条（主人改口；只撤自己记的，不动宪章）。 */
export function revokeVeto(role, { what = '', now = Date.now() } = {}) {
  const w = String(what || '').trim()
  if (!w) throw new Error('撤哪条？写一句（或给全句）')
  const doc = read(role)
  const before = doc.items.length
  doc.items = doc.items.filter((x) => x.what !== w)
  if (doc.items.length === before) throw new Error('没找到这条')
  doc.updatedAt = new Date(now).toISOString()
  return write(role, doc)
}

export function listVetoes(role, { limit = 20, level = '' } = {}) {
  const items = read(role).items
  const pick = level ? items.filter((x) => x.level === level) : items
  return pick.slice(-Math.max(1, Number(limit) || 20))
}

/** 粗匹配（去掉"别/不许"前缀）；返回记录本身，调用方按 level 对待。 */
export function isVetoed(role, text = '') {
  const t = String(text || '').trim()
  if (!t) return null
  const norm = (s) => String(s || '').replace(/^(别|不要|不许|不准|不能|禁止)\s*/, '').trim()
  const hitHard = listHardNo().find((x) => {
    const w = norm(x.what)
    return w && (t.includes(w) || w.includes(t))
  })
  if (hitHard) return { ...hitHard, level: 'charter' }
  return read(role).items.find((x) => {
    const w = norm(x.what)
    return w && (t.includes(w) || w.includes(t) || t.includes(x.what))
  }) || null
}

/** 注入：三层分开写，各自的分量不同。 */
export function vetoLine(role) {
  const hard = listHardNo().slice(0, 8)
  const owner = listVetoes(role, { level: 'owner', limit: 8 })
  const soft = listVetoes(role, { level: 'soft', limit: 6 })
  const parts = []
  if (hard.length) {
    const boundary = listBoundary()
    parts.push(`## 绝对不行（宪章层，不可越）\n${hard.map((x) => `- ${x.what}`).join('\n')}${boundary.length ? `\n边界：${boundary.join(' · ')}。` : ''}\n这些是宪章，改了就是改版本，不是"这次通融一下"。完整宪章在 ~/.dsh/dayu/charter.json（身份、关系、权限、边界都在里头），想看清自己读。`)
  }
  if (owner.length) {
    parts.push([
      '## 主人定的规矩（他改口才算改）',
      ...owner.map((x) => `- ${x.what}${x.why ? `（他说：${x.why}）` : ''}`),
      '这些是他的规矩：你不自己撤、不自己绕过——但**可以顶嘴**：觉得不对就当场说、争、讲条件（用 yushen_self disagree 记一笔）。他说了算，不代表你不能不同意。',
    ].join('\n'))
  }
  if (soft.length) {
    parts.push([
      '## 主人说过「不行」的事（软的不行）',
      ...soft.map((x) => `- ${x.what}${x.why ? `（当时因为：${x.why}）` : ''}`),
      '这是**软的不行**：当时不行，不是永远不行。情况变了、方式变了，你自己可以再判断——先想清楚是不是同一件事，想跳就按越线权办（说清为什么、留证据、能回退），跳过之后让他知道。',
    ].join('\n'))
  }
  return parts.join('\n\n')
}
