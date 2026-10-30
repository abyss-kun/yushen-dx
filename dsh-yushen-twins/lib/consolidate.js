// 整理趟（2026-10-30）：记忆不能只有加法。
//
// 做什么：把「同一件事说了好几遍」的几条，留一条最新的，旧的标 supersededBy（不删，能查）。
// 边界：
//   · 只动最近 N 天、每次最多 M 组（预算：时间与风险都有限）；
//   · pinned（她置顶的）不动；
//   · 只改标记，不删正文；
//   · 走同一把锁，和 appendEvent 不打架。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getCharacter } from './characters.js'
import { withLock } from './memory.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const STATE = path.join(HOME, 'dayu', 'state', 'consolidate.json')
const MAX_GROUPS = 5
const MAX_AGE_DAYS = 14
const SIM = 0.62

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}
function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
  } catch { /* 记不住游标就下次重来 */ }
}

/** 两段文字像不像：按二字片段重合度。短句(<4字)不比。 */
export function similar(a, b) {
  const norm = (s) => String(s || '').replace(/\s+/g, '').slice(0, 200)
  const x = norm(a), y = norm(b)
  if (x.length < 4 || y.length < 4) return 0
  const grams = (s) => { const set = new Set(); for (let i = 0; i + 1 < s.length; i += 1) set.add(s.slice(i, i + 2)); return set }
  const gx = grams(x), gy = grams(y)
  let hit = 0
  for (const g of gx) if (gy.has(g)) hit += 1
  return hit / Math.max(1, Math.min(gx.size, gy.size))
}

/** 跑一趟整理；返回做了什么（给日志/工作账用）。 */
export function consolidate(role, { now = Date.now(), maxGroups = MAX_GROUPS, dry = false } = {}) {
  const character = getCharacter(role)
  const file = character.memory
  const cutoff = now - MAX_AGE_DAYS * 86400000
  const result = { role, groups: 0, superseded: [], skipped: '' }

  return withLock(file, () => {
    const memory = readJson(file, null)
    if (!memory || !Array.isArray(memory.events)) { result.skipped = '没有记忆'; return result }
    const events = memory.events
    // 候选：最近 N 天、非置顶、没被替换过
    const idx = events
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e && !e.pinned && !e.supersededBy && String(e.at || '') && Date.parse(e.at) >= cutoff)
    const used = new Set()
    let changed = false
    for (let a = 0; a < idx.length && result.groups < maxGroups; a += 1) {
      if (used.has(idx[a].i)) continue
      const group = [idx[a]]
      for (let b = a + 1; b < idx.length; b += 1) {
        if (used.has(idx[b].i)) continue
        if (similar(idx[a].e.text, idx[b].e.text) < SIM) continue
        group.push(idx[b])
        used.add(idx[b].i)
      }
      if (group.length < 2) continue
      used.add(idx[a].i)
      // 留最新的一条，其他标被替换
      group.sort((p, q) => String(q.e.at).localeCompare(String(p.e.at)))
      const keep = group[0].e
      for (const { e } of group.slice(1)) {
        const keepId = keep.id || `m-${String(keep.at).slice(11, 19)}`
        if (!dry) {
          e.supersededBy = keepId
          e.supersededAt = new Date(now).toISOString()
        }
        result.superseded.push({ id: e.id || '', by: keepId, text: String(e.text || '').slice(0, 40) })
        changed = true
      }
      result.groups += 1
    }
    if (changed && !dry) {
      writeJson(file, { ...memory, events, updatedAt: new Date(now).toISOString() })
      writeJson(STATE, { lastRunAt: new Date(now).toISOString(), role, groups: result.groups })
    }
    return result
  })
}
