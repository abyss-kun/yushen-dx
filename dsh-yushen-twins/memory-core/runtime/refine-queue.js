/* 标签
 * id: memory-core-refine-queue
 * kind: module
 * summary: 精提炼的工作队列：从新的中层 state=queued 和旧的待提炼 pending 里取候选。
 * tags: 精提炼, 队列, 中层, 待提炼, 去重
 * created: 2026-11-13 00:30:00
 * changed: 2026-11-13 00:30:45
 * author: 大鱼·本班
 * authority: 老板（2026-11-13：继续完善记忆架构；refine 队列收进 core）
 * audience: refine 脚本、维护
 * owner: 框架；只读队列，不改行
 * mutable: 可改；新旧两种状态都要兼容
 * usage: queuedRows() / ownerMap()
 * why: 以前 refine 自己走两套目录、两套状态；现在统一由 core 取
 * result: 中层 queued 和旧待提炼 pending 合成一份候选
 */
import fs from 'node:fs'
import path from 'node:path'
import { LIB } from './middle.js'

const QUEUED = new Set(['pending', 'queued'])
const walk = (dir, out = []) => {
  let es = []
  try { es = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of es) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (p.endsWith('.jsonl')) out.push(p)
  }
  return out
}
const read = (f) => {
  const rows = []
  try {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      try { rows.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
    }
  } catch { /* 读不到跳过 */ }
  return rows
}

export function isQueued(state) { return QUEUED.has(String(state || 'pending')) }

/** 新中层 state=queued + 旧待提炼 pending/queued；每行带 _file，供 refine 回写。 */
export function queuedRows() {
  const rows = []
  const seen = new Set()
  for (const dir of ['中层', '手抄本']) {
    for (const f of walk(path.join(LIB, dir))) {
      for (const r of read(f)) {
        if (r?.state !== 'queued' || !r.id || seen.has(String(r.id))) continue
        seen.add(String(r.id))
        rows.push({ ...r, _file: f })
      }
    }
  }
  for (const f of walk(path.join(LIB, '待提炼'))) {
    for (const r of read(f)) {
      if (!isQueued(r?.state) || !r.id || seen.has(String(r.id))) continue
      seen.add(String(r.id))
      rows.push({ ...r, _file: f })
    }
  }
  return rows
}

/** id → 文件；refine 用它知道这一行该回写哪个文件。 */
export function ownerMap() {
  const map = new Map()
  for (const f of walk(path.join(LIB, '待提炼'))) for (const r of read(f)) if (r?.id) map.set(String(r.id), f)
  // 旧手抄本先扫，中层后扫：同 id 以中层为准。
  for (const dir of ['手抄本', '中层']) {
    for (const f of walk(path.join(LIB, dir))) for (const r of read(f)) if (r?.state === 'queued' && r?.id) map.set(String(r.id), f)
  }
  return map
}
