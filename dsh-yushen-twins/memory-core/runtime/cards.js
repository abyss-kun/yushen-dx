/* 标签
 * id: memory-core-cards
 * kind: module
 * summary: 后台卡片目录：按类型/游/角色/状态列出浅层纸，算好 tier 和墓碑过滤。
 * tags: 后台, 卡片, 列表, 游, 墓碑, 单一实现
 * created: 2026-11-13 19:50:00
 * changed: 2026-11-13 19:50:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-13：按钮先放放，把后台做好）
 * audience: 未来页面/API、维护、查询
 * owner: 框架；只读，不写卡
 * mutable: 可改；过滤规则和 query 保持一致
 * usage: listCards({type,tier,role,status,limit}) / getCard(key) / cardStats()
 * why: 之前只有 query 按词搜，没有“把某一类/某一游的纸列出来”的后台能力
 * result: 页面以后可以直接拿到卡片列表和统计，不用自己扫文件
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from './root.js'
import { feedbackIndex } from './feedback.js'
import { tierOf, tierRank } from './tier.js'
import { tombstoneIndex, isTombstoned } from './tombstone.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

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

function allRows() {
  const rows = []
  for (const f of walk(path.join(dataRoot(HOME), 'library', '在用'))) {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      try { rows.push({ ...JSON.parse(line), _file: f }) } catch { /* 坏行跳过 */ }
    }
  }
  return rows
}

export function listCards({ type = '', tier = '', role = '', status = '', limit = 200, includeTombstoned = false } = {}) {
  const fb = feedbackIndex()
  const tombs = tombstoneIndex()
  const out = []
  for (const r of allRows()) {
    if (!includeTombstoned && isTombstoned({ turnId: r.turnId || '', ref: r.ref || r.fromRef || '' }, tombs)) continue
    if (type && String(r.kind || '') !== String(type)) continue
    if (role && String(r.role || '') !== String(role)) continue
    if (status && String(r.status || 'active') !== String(status)) continue
    const feedback = fb.get(String(r.turnId || '')) || fb.get(String(r.ref || '')) || null
    const t = tierOf(r, feedback)
    if (tier && t !== String(tier)) continue
    out.push({ ...r, tier: t, _feedback: feedback || undefined })
  }
  return out
    .sort((a, b) => (tierRank(a.tier) - tierRank(b.tier)) || String(b.lastUsed || b.at || '').localeCompare(String(a.lastUsed || a.at || '')))
    .slice(0, Math.max(1, Number(limit) || 200))
}

export function getCard(key) {
  const k = String(key || '').trim()
  if (!k) return null
  const fb = feedbackIndex()
  for (const r of allRows()) {
    if (String(r.id || '') === k || String(r.turnId || '') === k || String(r.ref || '') === k || String(r.fromRef || '') === k) {
      const feedback = fb.get(String(r.turnId || '')) || fb.get(String(r.ref || '')) || null
      return { ...r, tier: tierOf(r, feedback), _feedback: feedback || undefined }
    }
  }
  return null
}

export function cardStats() {
  const rows = listCards({ limit: 100000 })
  const byTier = {}
  const byKind = {}
  for (const r of rows) {
    byTier[r.tier] = (byTier[r.tier] || 0) + 1
    byKind[r.kind || '未知'] = (byKind[r.kind || '未知'] || 0) + 1
  }
  return { total: rows.length, byTier, byKind }
}
