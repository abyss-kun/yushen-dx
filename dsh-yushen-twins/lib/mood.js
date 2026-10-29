// 心情：从真事长出来，带半衰期；她能覆盖（"我现在不烦"）。
//
// 不是数值游戏：它只做一件事——让同一句话在不同心情下，她的反应不一样。
import fs from 'node:fs'
import path from 'node:path'
import { runtimeDir } from './runtime.js'

const BASELINE = 50
const HALF_LIFE_H = 6

function file(role) { return path.join(runtimeDir(role), 'mood.json') }
function read(role) { try { return JSON.parse(fs.readFileSync(file(role), 'utf8')) } catch { return { value: BASELINE, updatedAt: 0, log: [], override: null } } }
function write(role, doc) {
  fs.mkdirSync(path.dirname(file(role)), { recursive: true })
  fs.writeFileSync(file(role), `${JSON.stringify(doc, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return doc
}
function decayed(doc, now) {
  const from = Number(doc.value)
  const at = Number(doc.updatedAt) || now
  const hours = Math.max(0, (now - at) / 3600000)
  const k = Math.pow(0.5, hours / HALF_LIFE_H)
  return BASELINE + (from - BASELINE) * k
}

/** 记一件事对心情的影响（-50..+50）。由事件驱动，不是随机。 */
export function noteMood(role, { delta = 0, why = '', now = Date.now() } = {}) {
  const doc = read(role)
  const cur = decayed(doc, now)
  doc.value = Math.max(0, Math.min(100, cur + Number(delta || 0)))
  doc.updatedAt = now
  doc.log = [...(doc.log || []), { at: new Date(now).toISOString(), delta: Number(delta || 0), why: String(why || '').slice(0, 80) }].slice(-50)
  return write(role, doc)
}

/** 心情的"生理反应表"：默认按事件记，但她能改——这是身体，不是判决。 */
export const DEFAULT_MOOD_RULES = Object.freeze({ atMe: 1, tease: -6, praise: 5, unhappy: -2 })
export function moodRules(role) {
  const doc = read(role)
  return { ...DEFAULT_MOOD_RULES, ...(doc.rules || {}) }
}
export function setMoodRule(role, key, delta, { now = Date.now() } = {}) {
  if (!Object.hasOwn(DEFAULT_MOOD_RULES, String(key))) throw new Error(`不认识的规则：${key}（可用：${Object.keys(DEFAULT_MOOD_RULES).join(' / ')}）`)
  const doc = read(role)
  doc.rules = { ...(doc.rules || {}), [String(key)]: Number(delta) || 0 }
  doc.updatedAt = now
  return write(role, doc)
}

/** 从真实消息里记心情（自动钩子；同一条只记一次）。 */
const TEASE = /(笨|傻|菜|滚|烦|闭嘴|垃圾|废物|云狗|蠢)/
const PRAISE = /(好看|厉害|牛|棒|可爱|喜欢|强|赞|优秀)/
export function noteMoodFromMessages(role, rows = [], { now = Date.now() } = {}) {
  const doc = read(role)
  const rules = { ...DEFAULT_MOOD_RULES, ...(doc.rules || {}) }
  const seen = new Set(doc.seen || [])
  let changed = 0
  for (const row of rows) {
    const id = String(row?.id || '')
    if (!id || seen.has(id) || row.isSelf) continue
    const t = String(row.text || '')
    if (!t || t === '[图片]') continue
    let delta = 0
    let why = ''
    if (row.atMe) { delta += rules.atMe; why = '点了她的名' }
    if (TEASE.test(t)) { delta += rules.tease; why = '被怼了' }
    else if (PRAISE.test(t)) { delta += rules.praise; why = '被夸了' }
    else if (/(气死|烦|难受|哭|呜呜)/.test(t)) { delta += rules.unhappy; why = '边上有人不高兴' }
    seen.add(id)
    if (!delta) continue
    const cur = decayed(doc, now)
    doc.value = Math.max(0, Math.min(100, cur + delta))
    doc.updatedAt = now
    doc.log = [...(doc.log || []), { at: new Date(now).toISOString(), delta, why }].slice(-50)
    changed += 1
  }
  doc.seen = [...seen].slice(-80)
  write(role, doc)
  return changed
}

/** 她自己说"我现在心情是 X"——覆盖自动值一段时间。 */
export function setMood(role, { value = BASELINE, why = '', minutes = 120, now = Date.now() } = {}) {
  const doc = read(role)
  const v = Math.max(0, Math.min(100, Number(value)))
  doc.override = { value: v, why: String(why || '').slice(0, 80), until: now + Math.max(1, Number(minutes) || 120) * 60000 }
  return write(role, doc)
}

export function moodOf(role, { now = Date.now() } = {}) {
  const doc = read(role)
  const ov = doc.override
  if (ov && Number(ov.until) > now) return { value: Number(ov.value), overridden: true, why: String(ov.why || ''), log: doc.log || [] }
  return { value: Math.round(decayed(doc, now)), overridden: false, why: '', log: doc.log || [] }
}

export function moodWord(v) {
  const n = Number(v)
  if (n <= 25) return '烦'
  if (n <= 40) return '有点烦'
  if (n <= 60) return '平常'
  if (n <= 80) return '还行'
  return '挺好'
}

/** 注入用：只报事实和一句话，不命令。 */
export function moodLine(role, { now = Date.now() } = {}) {
  const m = moodOf(role, { now })
  const last = (m.log || []).slice(-1)[0]
  const why = m.overridden ? `（你自己调过${m.why ? `：${m.why}` : ''}）` : (last ? `（最近：${last.why || '有点事'}）` : '')
  return `## 你现在的心情\n${moodWord(m.value)}${why}。\n这是身体反应（系统按发生的事记的），不是你的判断：哪个不对，用 yushen_self set-mood-rule 改，或者直接 set-mood 覆盖。`
}
