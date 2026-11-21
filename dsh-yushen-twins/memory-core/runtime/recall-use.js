/* 标签
 * id: memory-core-recall-use
 * kind: module
 * summary: 弱使用账：卡片被检索/注入“被召回”时记一笔，让经验/知识卡也能凭被想起次数上浮。
 * tags: 记忆, 使用, 分级, 弱信号
 * created: 2026-11-20 00:1x
 * author: 大鱼·本班
 * authority: 老板（2026-11-20「可以」：把被召回记成一次弱使用）
 * audience: 查询、分级、后台维护
 * why: 只有“用没用上”的反馈太稀，经验/知识卡永远停在中游
 * result: library/meta/recall-use.jsonl 只追加；同一条 6 小时内只记一次；计数供 feedbackIndex/tierOf 用
 * mutable: 可改；只追加，不删原文；弱信号不能当“用上了”
 */
import fs from 'node:fs'
import path from 'node:path'
import { dataRoot } from './root.js'

const HOME = process.env.DSH_HOME || path.join(process.env.HOME || process.env.USERPROFILE || '', '.dsh')
const FILE = () => path.join(dataRoot(HOME), 'library', 'meta', 'recall-use.jsonl')

const seen = new Map() // key -> 上次记录时间（本进程内节流）

/** 记一次“被召回”。同 key 在 minGapMs 内不重复写；空 key 不记。source: explicit|auto。 */
export function noteRecall(key, { now = Date.now(), minGapMs = 6 * 3600e3, source = 'explicit' } = {}) {
  const k = String(key || '').trim()
  if (!k) return { ok: false, why: 'no-key' }
  // 2026-11-20：只认显式检索（老板「看着来」后定的口径）；auto 一律不记。
  if (String(source) !== 'explicit') return { ok: true, skipped: true, why: 'auto-not-counted' }
  const last = seen.get(k) || 0
  if (now - last < minGapMs) return { ok: true, skipped: true, key: k }
  seen.set(k, now)
  try {
    const file = FILE()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, JSON.stringify({ at: new Date(now).toISOString(), key: k, source: 'explicit' }) + '\n', 'utf8')
    return { ok: true, key: k }
  } catch (e) { return { ok: false, error: String(e?.message || e) } }
}

/** 每张卡被召回了几次（只读）。 */
export function recallCounts({ limit = 50000 } = {}) {
  const map = new Map()
  try {
    const lines = fs.readFileSync(FILE(), 'utf8').split(/\r?\n/).filter(Boolean).slice(-limit)
    for (const line of lines) {
      let r = null
      try { r = JSON.parse(line) } catch { continue }
      const k = String(r?.key || '')
      if (!k) continue
      map.set(k, (map.get(k) || 0) + 1)
    }
  } catch { /* 没有账就是空 */ }
  return map
}
