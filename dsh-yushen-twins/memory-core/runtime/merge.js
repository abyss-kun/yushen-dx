/* 标签
 * id: memory-core-merge
 * kind: module
 * summary: 合并两张纸：留下目标、给来源标墓碑、在目标上记一条“合并”线。
 * tags: 合并, 墓碑, 并卡, 单一实现
 * created: 2026-11-13 18:52:00
 * changed: 2026-11-13 18:52:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-13：重了能并，删了留墓碑）
 * audience: yushen_merge、维护
 * owner: 框架；不删正文，来源只标墓碑
 * mutable: 可改；只合并同层卡片，不跨本源
 * usage: mergeCards({from,into,reason})
 * why: 之前只能标墓碑，不能把重复的两张并成一张
 * result: 来源不再被查/注入；目标留一条合并线
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from './root.js'
import { addLinks, linksOf } from './links.js'
import { markTombstone } from './tombstone.js'

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

function findRow(key) {
  const k = String(key || '').trim()
  if (!k) return null
  for (const f of walk(path.join(dataRoot(HOME), 'library', '在用'))) {
    const rows = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } })
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i]
      if (!r) continue
      if (String(r.id || '') === k || String(r.turnId || '') === k || String(r.ref || '') === k || String(r.fromRef || '') === k) {
        return { file: f, rows, index: i, row: r }
      }
    }
  }
  return null
}

function writeRows(file, rows) {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, rows.filter(Boolean).map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  fs.renameSync(tmp, file)
}

export function mergeCards({ from = '', into = '', reason = '' } = {}) {
  if (!from || !into) return { ok: false, error: 'from 和 into 都要给' }
  const a = findRow(from)
  const b = findRow(into)
  if (!a) return { ok: false, error: '找不到来源卡' }
  if (!b) return { ok: false, error: '找不到目标卡' }
  if (a.file === b.file && a.index === b.index) return { ok: false, error: '两张是同一张' }

  const t = markTombstone({ turnId: a.row.turnId || '', ref: a.row.ref || a.row.fromRef || '', reason: reason || `并入 ${b.row.head || into}` })
  if (!t.ok) return t

  const withLink = addLinks(b.row, [
    ...linksOf(b.row),
    { type: 'same_event', to: String(a.row.turnId || a.row.ref || a.row.id || from), strength: 'hard', why: reason || '重复合并' },
  ])
  b.rows[b.index] = withLink
  writeRows(b.file, b.rows)
  return { ok: true, from: a.row.id || from, into: b.row.id || into, tombstone: t.row }
}
