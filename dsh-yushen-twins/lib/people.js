// 人物档案：关于"某个人"的稳定事实。
//
// 2026-10-29 从 dsh-onebot-hub 的「人物档案」学来的。我们的问题是：
// 记忆是一份流水，所有人的事混在一起，聊到谁都得从头翻。
// 这个模块把"关于某个人的事实"单独放：处境、答应过什么、爱聊什么、别碰什么。
//
// 规矩（照着它的思路定的）：
//   · 只记**稳定的**，不记"他今天说了句什么"——那是记忆。
//   · 每条带来源和时间，能查出是谁什么时候告诉你的。
//   · 聊到这个人才注入；没聊到不占地方。
import fs from 'node:fs'
import path from 'node:path'
import { dshHome } from './paths.js'

const MAX_ITEMS = 30

function dirOf(role) {
  return path.join(dshHome(), 'dayu', 'runtime', role, 'people')
}

function fileOf(role, userId) {
  const safe = String(userId).replace(/[^0-9a-zA-Z_-]/g, '_')
  return path.join(dirOf(role), `${safe}.json`)
}

export function readPerson(role, userId) {
  try {
    return JSON.parse(fs.readFileSync(fileOf(role, userId), 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return { userId: String(userId), name: '', facts: [] }
  }
}

export function writePerson(role, userId, data) {
  const p = fileOf(role, userId)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = `${p}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ ...data, facts: (data.facts || []).slice(-MAX_ITEMS) }, null, 1), 'utf8')
  fs.renameSync(tmp, p)
}

/** 记一条关于这个人的稳定事实。source 写清楚是从哪知道的。 */
export function rememberPerson(role, userId, { name = '', fact = '', source = '', at = '' } = {}) {
  const d = readPerson(role, userId)
  if (name) d.name = String(name).slice(0, 30)
  const text = String(fact || '').trim()
  if (text) {
    d.facts = d.facts || []
    d.facts.push({ text: text.slice(0, 200), source: String(source).slice(0, 80), at: at || new Date().toISOString() })
  }
  writePerson(role, userId, d)
  return d
}

/** 简报里那一行：只有"现在聊的是这个人"时才注入。 */
export function personLine(role, userId) {
  if (!userId) return ''
  const d = readPerson(role, userId)
  const facts = (d.facts || []).slice(-5)
  if (!facts.length && !d.name) return ''
  const head = `## 关于 ${d.name || `这个人（${userId}）`}（你记着的）`
  const body = facts.map((f) => `- ${f.text}`).join('\n')
  return `${head}\n${body}`
}
