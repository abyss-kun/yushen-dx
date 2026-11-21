// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-handoff-merge
 * kind: module
 * summary: 分身回体：桥算好的摘要/习惯/印象走 state/handoff/<role>.json，由这里合并进本体（appendEvent 唯一写入口）。
 * tags: 回体, 合并, 唯一写入口
 * created: 2026-11-11 01:25:00
 * changed: 2026-11-11 01:25:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 桥、本体记忆、维护流程
 * owner: 框架；**只经 appendEvent 写**这条不许破
 * defaults: 合并后清 handoff 文件（已合并的不重放）
 * off: 不合并=分身说的话本体永远不知道
 * mutable: 可改合并规则；不许直接写记忆 JSON
 * usage: 读 handoff → 逐条 appendEvent → 记账
 * why: 桥直接写本体记忆会绕过脱敏/审计/去重
 * result: 一条受控的回体通道
 */
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
import { listCharacters } from './characters.js'
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
  for (const key of ['habits', 'dynamics']) {
    for (const value of Array.isArray(doc[key]) ? doc[key] : []) {
      // 2026-11-04：习惯/动态可能是 {text, at, source} 对象，别再 String() 成 [object Object]
      const text = (typeof value === 'string' ? value : (value && value.text) || '').trim()
      if (text) items.push(`${key === 'habits' ? '习惯' : '动态'}：${text}`)
    }
  }
  // 印象是对象（{summary, tags, updatedAt, channel}），不是数组——单独合并，别漏掉
  for (const [who, v] of Object.entries(doc.impressions && typeof doc.impressions === 'object' ? doc.impressions : {})) {
    const text = (typeof v === 'string' ? v : String((v && v.summary) || '')).trim()
    if (text) items.push(`印象：${who}=${text}`)
  }

  let merged = 0
  for (const text of items) {
    const id = fp(text)
    if (seen.has(id)) continue
    try {
      // 不传 session（2026-11-02 核过）：这是桥从手机带回来的交接件（一个文件），合并时没有对应的
      // DSH 会话可指；硬编一个 id 等于往去重键里塞假分身号。空着不影响读取，只影响去重粒度。
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
  // 2026-10-31：原来写死三个角色。出厂包只有两只，`dragon` 会稳定返回「没有带回来的东西」，
  // 看着像出错其实是没有这个人——按已装名册遍历，名册读不到再退回两只。
  let roles = [...FALLBACK_ROLES]
  try {
    const ids = listCharacters().map((c) => c.id)
    if (ids.length) roles = ids
  } catch { /* 名册读不到就用出厂的两只 */ }
  for (const role of roles) {
    try { out[role] = mergeHandoff({ ...options, role }) } catch (e) { out[role] = { ok: false, reason: String(e?.message || e) } }
  }
  return out
}
