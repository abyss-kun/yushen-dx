/* 标签
 * id: memory-core-feedback
 * kind: module
 * summary: 回写一句“这次召回用没用上、结果好不好”，让记忆有机会从使用里改。
 * tags: 反馈, 召回, 结果, 判断, 闭环
 * created: 2026-11-13 01:10:00
 * changed: 2026-11-20 00:07:22
 * author: 大鱼·本班
 * authority: 老板（2026-11-13：继续完善记忆架构；反馈闭环）
 * audience: yushen_feedback 工具、以后 dsh-memory
 * owner: 框架；只追加，不改旧结论
 * mutable: 可改；turnId/ref 至少一个，不许空记
 * usage: recordFeedback({turnId, ref, layer, used, outcome, note}) / readFeedback()
 * why: 之前只有“搜过”的日志，没有“用了以后对不对”的回写
 * result: 每次召回可以留下 used/outcome；以后才好改召回和判断
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from './root.js'
import { recallCounts } from './recall-use.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

export function feedbackFile() {
  return path.join(dataRoot(HOME), 'library', 'meta', 'feedback.jsonl')
}

export function recordFeedback({ turnId = '', ref = '', layer = '', used = '', outcome = '', note = '' } = {}) {
  const id = String(turnId || '').trim()
  const r = String(ref || '').trim()
  if (!id && !r) return { ok: false, error: 'turnId 和 ref 至少给一个' }
  const row = {
    at: new Date().toISOString(),
    turnId: id,
    ref: r,
    layer: String(layer || '').slice(0, 20),
    used: String(used || '').slice(0, 20),
    outcome: String(outcome || '').slice(0, 20),
    note: String(note || '').slice(0, 200),
  }
  try {
    const file = feedbackFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf8')
    return { ok: true, row, file }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

export function readFeedback({ limit = 200 } = {}) {
  try {
    return fs.readFileSync(feedbackFile(), 'utf8').split(/\r?\n/).filter(Boolean)
      .slice(-limit)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
  } catch { return [] }
}

/** 按 turnId / ref 汇总：好、坏、用上、没用。 */
export function feedbackIndex({ limit = 5000 } = {}) {
  const map = new Map()
  const bump = (key, row) => {
    if (!key) return
    const cur = map.get(key) || { good: 0, bad: 0, used: 0, unused: 0, recall: 0, lastAt: '' }
    const at = String(row.at || '')
    if (at && at > cur.lastAt) cur.lastAt = at
    const used = String(row.used || '')
    const outcome = String(row.outcome || '')
    if (/用上/.test(used) && !/没/.test(used)) cur.used += 1
    if (/没用|未用/.test(used)) cur.unused += 1
    if (/好/.test(outcome) && !/坏/.test(outcome)) cur.good += 1
    if (/坏|错/.test(outcome)) cur.bad += 1
    map.set(key, cur)
  }
  for (const r of readFeedback({ limit })) {
    bump(String(r.turnId || ''), r)
    bump(String(r.ref || ''), r)
  }
  // 自动那边：recall-log 里“后来核对上用上了”的 refs 也算一次使用；
  // 只认明确的“是/用上了”，弱证据不算。
  try {
    const log = path.join(dataRoot(HOME), 'runtime', 'recall-log.jsonl')
    for (const line of fs.readFileSync(log, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      let r = null
      try { r = JSON.parse(line) } catch { continue }
      if (!/^(是|用上了)$/.test(String(r.used || '').trim())) continue
      for (const ref of (r.refs || [])) bump(String(ref || ''), { used: '用上了' })
    }
  } catch { /* 没有自动日志就算了 */ }
  // 2026-11-20：弱使用——卡片被召回几次（recall-use.jsonl），单独记 recall，不冒充“用上了”。
  try {
    for (const [key, n] of recallCounts()) {
      const cur = map.get(key) || { good: 0, bad: 0, used: 0, unused: 0, recall: 0, lastAt: '' }
      cur.recall = Math.max(Number(cur.recall) || 0, Number(n) || 0)
      map.set(key, cur)
    }
  } catch { /* 没有弱使用账就算了 */ }
  return map
}
