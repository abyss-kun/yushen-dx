// 分身回体：桥那边算好的摘要/习惯/印象，不再直接写本体记忆文件；
// 而是放在 state/handoff/<role>.json，由这里合并进本体（appendEvent = 唯一写入口）。
//
// 边界：
//   · 只读桥的 handoff 文件，不改桥的任何东西；
//   · 每条都带来源（qq-bridge-handoff），按文本指纹去重，游标记在 state/handoff-cursor.json；
//   · 合并不了的（读不到、坏 JSON）就跳过，不阻塞别的。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { bridgeStatePath } from './inbox.js'
import { appendEvent } from './memory.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const CURSOR = path.join(DATA, 'state', 'handoff-cursor.json')
const MAX_SEEN = 800

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}
function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
  } catch { /* 记不住游标就下次重来，appendEvent 会去重 */ }
}
const fp = (s) => crypto.createHash('sha1').update(String(s || '')).digest('hex').slice(0, 12)

/** 把桥带回来的东西合并进本体记忆。 */
export function mergeHandoff({ role = 'dayu', now = Date.now() } = {}) {
  const base = bridgeStatePath()
  if (!base) return { ok: false, reason: '没有桥的 state 路径' }
  const file = path.join(path.dirname(base), 'handoff', `${role}.json`)
  const doc = readJson(file, null)
  if (!doc || typeof doc !== 'object') return { ok: true, merged: 0, reason: '没有带回来的东西' }

  const cursor = readJson(CURSOR, {}) || {}
  const seen = new Set(Array.isArray(cursor[role]) ? cursor[role] : [])
  const items = []
  if (doc.summary && String(doc.summary).trim()) items.push(`摘要：${String(doc.summary).trim()}`)
  for (const key of ['habits', 'dynamics', 'impressions']) {
    for (const value of Array.isArray(doc[key]) ? doc[key] : []) {
      const text = String(value || '').trim()
      if (text) items.push(`${key === 'habits' ? '习惯' : key === 'dynamics' ? '动态' : '印象'}：${text}`)
    }
  }

  let merged = 0
  for (const text of items) {
    const id = fp(text)
    if (seen.has(id)) continue
    try {
      appendEvent(role, { channel: 'QQ', kind: 'note', text: text.slice(0, 500), source: 'qq-bridge-handoff', at: new Date(now).toISOString() })
      seen.add(id)
      merged += 1
    } catch { /* 单条写不进不影响别的 */ }
  }

  const list = [...seen].slice(-MAX_SEEN)
  writeJson(CURSOR, { ...cursor, [role]: list })
  return { ok: true, merged, total: items.length }
}

/** 三个角色都合一遍。 */
export function mergeAllHandoffs(options = {}) {
  const out = {}
  for (const role of ['dayu', 'xiaoyu', 'dragon']) {
    try { out[role] = mergeHandoff({ ...options, role }) } catch (e) { out[role] = { ok: false, reason: String(e?.message || e) } }
  }
  return out
}
