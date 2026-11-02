// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 自我笔记 CLI：她自己写、人只读。
// 用法：
//   node scripts/self-note.mjs write "今天我发现..." --about "封面那件事" --mood "难受"
//   node scripts/self-note.mjs list [--limit 10]
//   node scripts/self-note.mjs show <id>
import { writeSelfNote, listSelfNotes } from '../lib/self-note.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const FILE = path.join(HOME, 'dayu', 'soul', '自我笔记.jsonl')
const argv = process.argv.slice(2)
const cmd = argv[0] || 'list'
const val = (n, d = '') => {
  const i = argv.indexOf('--' + n)
  return i >= 0 ? String(argv[i + 1] || '') : d
}

if (cmd === 'write') {
  const text = argv.slice(1).filter((a, i, arr) => !a.startsWith('--') && !['--about', '--mood'].includes(arr[i - 1])).join(' ').trim()
  const r = writeSelfNote(val('role', 'dayu'), { text, about: val('about'), mood: val('mood') })
  console.log(JSON.stringify(r))
  process.exit(r.ok ? 0 : 2)
}

if (cmd === 'show') {
  const id = argv[1]
  const rows = fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const row = rows.find((r) => r.id === id)
  if (!row) { console.error('没有这条：' + id); process.exit(2) }
  console.log(`# ${row.at} · ${row.role}${row.about ? ' · 关于：' + row.about : ''}${row.mood ? ' · 心情：' + row.mood : ''}\n`)
  console.log(row.text)
  process.exit(0)
}

const rows = listSelfNotes({ limit: Number(val('limit', '10')) || 10, role: val('role', '') })
if (!rows.length) { console.log('自我笔记：还没有（只能她自己写，人不代笔）'); process.exit(0) }
console.log(`自我笔记 ${rows.length} 条（人只读）：`)
for (const r of rows) {
  console.log(`- ${String(r.at).slice(0, 16)} ${r.about ? '[' + r.about + '] ' : ''}${String(r.text).replace(/\s+/g, ' ').slice(0, 60)}`)
}
