/* 标签
 * id: memory-core-backfill-turnid
 * kind: module
 * summary: 给旧浅层卡补 turnId：只从 live 里的 turn 块按行号认，认不出就标 weak，不猜。
 * tags: 回填, turnId, 旧数据, 身份证, 单一实现
 * created: 2026-11-13 19:00:00
 * changed: 2026-11-13 19:00:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-13：旧卡缺 turnId，上一轮/下一轮连不起来）
 * audience: 维护、relink
 * owner: 框架；只认 live 的 turn 块，不按时间猜
 * mutable: 可改；认不出保持空，标 linkWeak
 * usage: backfillTurnIds({dry})
 * why: 旧卡没有 turnId，自动连线对它们完全无效
 * result: 能按块认出的补上；认不出的留 weak，不硬连
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from './root.js'

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

const blockCache = new Map()
function blocksOf(file) {
  if (blockCache.has(file)) return blockCache.get(file)
  const blocks = []
  let lines = []
  try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/) } catch { blockCache.set(file, blocks); return blocks }
  let cur = null
  for (let i = 0; i < lines.length; i += 1) {
    const m = /<!--\s*turn=(\d+)[^>]*?session=([^\s>]+)/.exec(lines[i])
    if (m) {
      if (cur) { cur.end = i; blocks.push(cur) }
      cur = { start: i + 1, end: lines.length, turn: Number(m[1]), session: m[2] }
    }
  }
  if (cur) { cur.end = lines.length; blocks.push(cur) }
  blockCache.set(file, blocks)
  return blocks
}

const refOf = (s) => {
  const m = /^(.*?):(\d+)$/.exec(String(s || ''))
  return m ? { file: m[1].replace(/\\/g, '/'), line: Number(m[2]) } : null
}

export function backfillTurnIds({ dry = false } = {}) {
  const files = walk(path.join(dataRoot(HOME), 'library', '在用'))
  let checked = 0
  let filled = 0
  let weak = 0
  let touched = 0
  for (const f of files) {
    const rows = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } })
    let dirty = false
    for (const row of rows) {
      if (!row || row.turnId) continue
      checked += 1
      const r = refOf(row.ref || row.fromRef)
      if (!r) { row.linkWeak = true; weak += 1; dirty = true; continue }
      const abs = path.isAbsolute(r.file) ? r.file : path.join(dataRoot(HOME), r.file)
      if (!fs.existsSync(abs)) { row.linkWeak = true; weak += 1; dirty = true; continue }
      const hit = blocksOf(abs).find((b) => r.line >= b.start && r.line <= b.end)
      if (!hit) { row.linkWeak = true; weak += 1; dirty = true; continue }
      row.turnId = `${hit.session}#${hit.turn}`
      row.sessionId = hit.session
      row.turn = hit.turn
      row.threadId = hit.session
      filled += 1
      dirty = true
    }
    if (dirty && !dry) {
      const tmp = `${f}.${process.pid}.tmp`
      fs.writeFileSync(tmp, rows.filter(Boolean).map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
      fs.renameSync(tmp, f)
      touched += 1
    }
  }
  return { ok: true, checked, filled, weak, files: touched, dry }
}
