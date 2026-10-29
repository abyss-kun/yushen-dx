// 联想：看到 A 想起 B。
//
// 不是"推送"：她自己问"这事我以前碰到过吗"，这里给候选，并明说"字面像，可能不是同一件事"。
import { strength } from './decay.js'

function cjkBigrams(s) {
  const t = String(s || '').replace(/[^\u4e00-\u9fa5a-z0-9]/gi, ' ').trim()
  const out = new Set()
  for (const seg of t.split(/\s+/)) {
    if (!seg) continue
    if (/^[a-z0-9]+$/i.test(seg)) { out.add(seg.toLowerCase()); continue }
    for (let i = 0; i < seg.length - 1; i += 1) out.add(seg.slice(i, i + 2))
  }
  return out
}

/**
 * 从旧事里找"可能相关"的几条。
 * @param {{query:string, entries:Array<{at?:string,text?:string,channel?:string}>, limit?:number, min?:number, now?:number}} p
 */
export function associate({ query = '', entries = [], limit = 5, min = 0.12, now = Date.now() } = {}) {
  const q = cjkBigrams(query)
  if (!q.size) return []
  const scored = []
  for (const e of entries) {
    const text = String(e.text || e.what || '')
    const eSet = cjkBigrams(text)
    if (!eSet.size) continue
    let hit = 0
    for (const g of q) if (eSet.has(g)) hit += 1
    const overlap = hit / Math.min(q.size, eSet.size)
    if (overlap < min) continue
    scored.push({ ...e, score: Math.round(overlap * 100) / 100, freshness: Math.round(strength({ at: e.at || e.updatedAt }, { now }) * 100) / 100 })
  }
  return scored.sort((a, b) => b.score - a.score || b.freshness - a.freshness).slice(0, Math.max(1, limit))
}
