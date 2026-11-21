/* 标签
 * id: lib-recall-usage
 * kind: module
 * summary: 检索用没用上：拿她查到的出处原文，去她之后的记忆里找有没有真用起来；只标证据，不硬判。
 * tags: 检索, 度量, 用没用上, 反馈
 * created: 2026-11-11 19:4x
 * changed: 2026-11-11 19:28:39
 * author: 大鱼·本班（接手交接 2026-11-11-0255）
 * authority: 主人（2026-11-11：「用没用上这个数是死的……其他的做」）
 * why: 原来的核对只看 refs 的文件名（如 2026-11-05）在不在记忆里——文件名永远不会出现在记忆里，所以 67 次检索 0 次用上；"用上"这个数从来没动过
 * result: verifyUsage() 读出 ref 指向的原文那一行，和之后的记忆做二字组包含度比对；够 0.55 且有 5 个共同片段才标「是」，0.45~0.55 标「弱证据」（不算用上）
 * audience: 她（借阅账）、面板、维护者
 * owner: 框架；只标证据不判没用——找不到就保持空（空=还没核对，不等于没用）
 * mutable: 可改（阈值只许收紧：0.55/5 是下限；只读记忆，不扫 live，避免自证）
 * usage: verifyUsage({ days: 7, dry: true }) → { checked, used, weak, rows }
 */
// 改｜2026-11-11 19:4x｜大鱼·本班｜授权：主人（「用没用上这个数是死的……其他的做」）｜lib/recall-usage.js:1-160｜新增：核对检索有没有被用上——优先看检索时记下的 preview 片段，老账退回读 ref 指向的原文那一行；和之后的记忆比二字组，≥0.55 且 5 个共同片段才算用上｜为什么：老版拿 ref 的文件名（如 2026-11-05）去记忆里找，文件名永远不在记忆里，67 次检索 0 次用上｜验证：node scripts/test-recall-usage.mjs 4/4；真家 --dry 如实出数｜可改：可改；阈值只许收紧，只扫记忆不扫 live（避免自证）
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
//
// 为什么不能用"文件名"当证据：老版本拿 refs 的 basename 去记忆里找，比如 ref 是
// dayu/live/2026/11W45/工作台/2026-11-05-xxx.md:6166 → 取"2026-11-05"——记忆里当然没有这串，
// 于是永远 0。真证据得是那一行写了什么，不是它存在哪个文件里。
//
// 只扫记忆（soul/memory/*.json 的事件正文），不扫 live/事件流水：那些地方本来就有查询词，
// 拿它当"后来用上了"等于自证（第一版就是这么误判的，注释还留着）。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readRecallLog, markUsed, recallStats, isUsedFeedback } from './recall-log.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')

const norm = (s) => String(s || '').replace(/[\s，。；：、,.!?！？“”"'‘’（）()【】\[\]<>《》·|/\\-]+/g, '')
function bigrams(text) {
  const n = norm(text)
  const out = new Set()
  for (let i = 0; i + 2 <= n.length; i += 1) out.add(n.slice(i, i + 2))
  return out
}
function containment(a, b) {
  if (!a.size || !b.size) return { c: 0, overlap: 0 }
  let overlap = 0
  for (const g of a) if (b.has(g)) overlap += 1
  return { c: overlap / Math.min(a.size, b.size), overlap }
}

/** 一条 ref（"相对家目录的路径:行号"）指向的那一行正文。 */
export function textAtRef(ref) {
  const m = String(ref || '').match(/^(.*?):(\d+)$/)
  if (!m) return ''
  const rel = m[1].replace(/\\/g, '/')
  // 老账里两种都见过：相对家目录的（dayu/live/...）和绝对路径（C:/Users/.../dayu/live/...）。
  const file = path.isAbsolute(rel) || /^[A-Za-z]:\//.test(rel) ? rel : path.join(HOME, rel)
  let lineNo = Number(m[2])
  try {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
    if (!Number.isFinite(lineNo) || lineNo < 1) lineNo = 1
    const raw = String(lines[lineNo - 1] || '')
    // 去掉 markdown 记号与「谁：」前缀，只留那句话本身
    return raw.replace(/^#{1,6}\s*/, '').replace(/^[-*>]\s*/, '').replace(/^\*\*[^*]{1,12}\*\*[：:]\s*/, '').trim()
  } catch {
    return ''
  }
}

/** 她自己的记忆事件（只读；按时间给）。 */
export function memoryEvents() {
  const out = []
  const dir = path.join(DATA, 'soul', 'memory')
  let files = []
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')) } catch { return out }
  for (const f of files) {
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
      for (const e of doc.events || []) {
        const text = String(e.text || e.content || '').trim()
        if (text) out.push({ at: String(e.at || ''), text })
      }
    } catch { /* 坏文件跳过 */ }
  }
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)))
}

const tOf = (v) => { const t = Date.parse(String(v || '').replace(' ', 'T')); return Number.isFinite(t) ? t : 0 }

/**
 * 核对最近的检索。
 * @param {{days?:number, dry?:boolean, limit?:number, usedAt?:number, weakAt?:number, minOverlap?:number}} opts
 * @returns {{checked:number, used:number, weak:number, marked:number, rows:Array}}
 */
export function verifyUsage({ days = 7, dry = true, limit = 200, usedAt = 0.55, weakAt = 0.45, minOverlap = 5 } = {}) {
  const since = Date.now() - Math.max(1, Number(days) || 7) * 86400e3
  const rows = readRecallLog({ limit }).filter((r) => {
    const t = tOf(r.at)
    return Number.isFinite(t) && t >= since
  })
  const events = memoryEvents()
  const eventGrams = events.map((e) => ({ at: tOf(e.at), text: e.text, grams: bigrams(e.text) }))
  let checked = 0
  let used = 0
  let weak = 0
  let marked = 0
  const out = []
  for (const r of rows) {
    if (isUsedFeedback(r.used)) continue
    checked += 1
    const t0 = tOf(r.at)
    const after = eventGrams.filter((e) => !e.at || e.at >= t0)
    // 优先用检索时记下的片段（preview）——那是她当时真看到的话；老账没有 preview 才退回去读 ref 那一行。
    const previews = (r.preview || []).map((p) => String(p || '').trim()).filter((p) => p.length >= 4)
    const sources = previews.length
      ? previews
      : (r.refs || []).map((ref) => textAtRef(ref)).filter((t) => t.length >= 4)
    let best = { c: 0, overlap: 0, text: '' }
    for (const src of sources) {
      const grams = bigrams(src)
      if (grams.size < 4) continue
      for (const e of after) {
        const { c, overlap } = containment(grams, e.grams)
        if (c > best.c || (c === best.c && overlap > best.overlap)) best = { c, overlap, text: String(e.text).slice(0, 40) }
      }
    }
    if (best.c >= usedAt && best.overlap >= minOverlap) {
      used += 1
      out.push({ at: r.at, query: r.query, verdict: `用上了：${best.text}` })
      if (!dry) { markUsed({ at: r.at, used: '是' }); marked += 1 }
      continue
    }
    if (best.c >= weakAt) {
      weak += 1
      out.push({ at: r.at, query: r.query, verdict: `弱证据（${best.c.toFixed(2)}）：${best.text}` })
      if (!dry) { markUsed({ at: r.at, used: '弱证据' }); marked += 1 }
      continue
    }
    // 兜底：查过的问题后来原样出现在记忆里，也算一条弱证据（不是"用上了"）。
    const q = norm(r.query || '')
    if (q.length >= 6) {
      const hit = after.find((e) => norm(e.text).includes(q))
      if (hit) {
        weak += 1
        out.push({ at: r.at, query: r.query, verdict: '查过的话后来被提到过（弱证据）' })
        if (!dry) { markUsed({ at: r.at, used: '弱证据' }); marked += 1 }
      }
    }
  }
  return { checked, used, weak, marked, rows: out, stats: recallStats({ days }) }
}
