/* 标签
 * id: memory-core-tombstone
 * kind: module
 * summary: 墓碑：只降不删、删了留记号；每删/标错一条，就在 library/meta/tombstones.jsonl 记一行。
 * tags: 墓碑, 删除标记, 只降不删, 过滤, 单一实现
 * created: 2026-11-13 18:30:00
 * changed: 2026-11-13 18:30:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-13：只降不删、留墓碑，不要真删文件）
 * audience: query 过滤、注入过滤、以后 dsh-memory
 * owner: 框架；只追加，不删、不改已有卡
 * mutable: 可改；turnId/ref 至少一个，不许空记
 * usage: tombstoneFile() / markTombstone({turnId,ref,reason,by}) / readTombstones({limit}) / tombstoneIndex({limit}) / isTombstoned({turnId,ref}, index?)
 * why: 之前只能靠人记得“这条别再用”，一删文件连“曾经有过”都没了
 * result: 墓碑单独一行一条；查询/注入可以按 Set 直接滤掉，卡还在、记号也在
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from './root.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

export function tombstoneFile() {
  return path.join(dataRoot(HOME), 'library', 'meta', 'tombstones.jsonl')
}

/** 只追加一行墓碑：不删文件、不改已有卡。 */
export function markTombstone({ turnId = '', ref = '', reason = '', by = '' } = {}) {
  const id = String(turnId || '').trim()
  const r = String(ref || '').trim()
  if (!id && !r) return { ok: false, error: 'turnId 和 ref 至少给一个' }
  const row = {
    at: new Date().toISOString(),
    turnId: id,
    ref: r,
    reason: String(reason || '').slice(0, 300),
    by: String(by || '').slice(0, 40),
  }
  try {
    const file = tombstoneFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf8')
    return { ok: true, row, file }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

export function readTombstones({ limit = 5000 } = {}) {
  try {
    return fs.readFileSync(tombstoneFile(), 'utf8').split(/\r?\n/).filter(Boolean)
      .slice(-Math.max(1, Number(limit) || 5000))
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
  } catch { return [] }
}

/** 汇总成查重用的 Set：每个墓碑的 turnId 和 ref 都算。 */
export function tombstoneIndex({ limit = 5000 } = {}) {
  const set = new Set()
  for (const r of readTombstones({ limit })) {
    const id = String(r.turnId || '').trim()
    const ref = String(r.ref || '').trim()
    if (id) set.add(id)
    if (ref) set.add(ref)
  }
  return set
}

/** 给 query/注入用：命中墓碑就返回 true；不传 index 就现读。 */
export function isTombstoned({ turnId = '', ref = '' } = {}, index = null) {
  const set = index || tombstoneIndex()
  const id = String(turnId || '').trim()
  const r = String(ref || '').trim()
  return Boolean((id && set.has(id)) || (r && set.has(r)))
}
