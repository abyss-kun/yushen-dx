// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 诺言本：我说“我要做”的时候，当场记一条——什么时候说的、当时怎么想、打算什么时候做。
// 用法：
//   node scripts/promise-book.mjs add "要做的事" --why "当时怎么想" --when 明天/23:00/2026-11-03
//   node scripts/promise-book.mjs list            # 未完成的（逾期标红）
//   node scripts/promise-book.mjs done <id> --evidence "证据"
//   node scripts/promise-book.mjs drop <id> --reason "为什么不做"
// 存储：~/.dsh/dayu/promises/诺言.jsonl（只增；状态就地更新）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DIR = path.join(HOME, 'dayu', 'promises')
const FILE = path.join(DIR, '诺言.jsonl')
fs.mkdirSync(DIR, { recursive: true })

const argv = process.argv.slice(2)
const cmd = argv[0] || 'list'
const val = (name, fallback = '') => {
  const i = argv.indexOf('--' + name)
  return i >= 0 ? String(argv[i + 1] || '') : fallback
}
const pos = argv.slice(1).filter((a) => !a.startsWith('--') && !['--why', '--when', '--evidence', '--reason'].some((f) => argv[argv.indexOf(a) - 1] === f))

const read = () => {
  const out = []
  try {
    for (const line of fs.readFileSync(FILE, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try { out.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
    }
  } catch { /* 还没有 */ }
  return out
}
const write = (rows) => {
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  fs.renameSync(tmp, FILE)
}

const now = new Date()
const stamp = (d = now) => new Date(d.getTime() + 8 * 3600e3).toISOString().replace('Z', '+08:00')

if (cmd === 'add') {
  const what = pos.join(' ').trim()
  if (!what) { console.error('要写清做什么：add "要做的事" --why "当时怎么想" --when 什么时候'); process.exit(2) }
  const why = val('why', '')
  const when = val('when', '')
  const row = {
    id: 'p-' + crypto.createHash('sha1').update(`${stamp()}|${what}`).digest('hex').slice(0, 8),
    at: stamp(),
    what,
    why,
    when,
    status: 'open',
    evidence: '',
    doneAt: '',
  }
  fs.appendFileSync(FILE, JSON.stringify(row) + '\n', 'utf8')
  console.log(JSON.stringify({ ok: true, id: row.id, what: row.what, when: row.when }))
  process.exit(0)
}

if (cmd === 'done' || cmd === 'drop') {
  const id = pos[0]
  if (!id) { console.error('要 id：list 里看'); process.exit(2) }
  const rows = read()
  const row = rows.find((r) => r.id === id)
  if (!row) { console.error('没有这个 id：' + id); process.exit(2) }
  row.status = cmd === 'done' ? 'done' : 'dropped'
  row.evidence = val('evidence', cmd === 'done' ? '' : val('reason', ''))
  row.doneAt = stamp()
  write(rows)
  console.log(JSON.stringify({ ok: true, id, status: row.status }))
  process.exit(0)
}

// list
const rows = read().filter((r) => r.status === 'open')
if (!rows.length) { console.log('诺言本：空（没有未完成的）'); process.exit(0) }
console.log(`诺言本：${rows.length} 条未完成`)
for (const r of rows) {
  const overdue = r.when && /^\d{4}-\d{2}-\d{2}/.test(r.when) && r.when < now.toISOString().slice(0, 10)
  console.log(`${overdue ? '⚠ 逾期 ' : ''}${r.id} · ${r.at.slice(0, 16)} 说的：${r.what}`)
  if (r.why) console.log(`    当时想：${r.why}`)
  if (r.when) console.log(`    打算：${r.when}`)
}
