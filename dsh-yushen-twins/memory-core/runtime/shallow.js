/* 标签
 * id: memory-core-shallow
 * kind: module
 * summary: 浅层（在用）的写入口：精提炼的结论按类别/日期落到 library/在用。
 * tags: 浅层, 在用, 结论, 写入, 单一实现
 * created: 2026-11-13 00:40:00
 * changed: 2026-11-13 00:40:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-13：继续完善记忆架构；中层→浅层的写收进 core）
 * audience: refine、未来 dsh-memory
 * owner: 框架；只追加，不覆盖
 * mutable: 可改；同 fromRef/同 head 不重复写
 * usage: inUseFile(kind,day) / appendInUse(kind,day,row)
 * why: 以前 appendInUse 埋在 refine 脚本里，出厂版用不到
 * result: 浅层写入只有一份；refine 只负责判断
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from './root.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

export function inUseFile(kind, day) {
  return path.join(dataRoot(HOME), 'library', '在用', String(kind || '记忆'), `${day}.jsonl`)
}

function readRows(file) {
  const rows = []
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      try { rows.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
    }
  } catch { /* 还没有文件 */ }
  return rows
}

export function appendInUse(kind, day, row) {
  const file = inUseFile(kind, day)
  const rows = readRows(file)
  const seen = new Set(rows.map((r) => String(r.fromRef || '')))
  if (seen.has(String(row.fromRef))) return { ok: true, skipped: true, why: '同一条指针写过', file }
  if (rows.some((r) => String(r.head || '').trim() === String(row.head || '').trim())) {
    return { ok: true, skipped: true, why: '已有同一条结论', file }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const out = {
    ...row,
    tier: row.tier || '中游',
    useCount: Number(row.useCount) || 0,
    lastUsed: row.lastUsed || row.at || '',
    ...(row.pin ? { pin: true } : {}),
  }
  fs.appendFileSync(file, JSON.stringify(out) + '\n', 'utf8')
  return { ok: true, skipped: false, file, row: out }
}
