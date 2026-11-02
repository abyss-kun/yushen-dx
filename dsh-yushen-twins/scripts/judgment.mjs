// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 判断账本：记一条“当时怎么想的 → 后来对不对”。
// 用法：
//   node scripts/judgment.mjs add "我判断这版封面不行，因为缩略图看不清" --basis "看的是 320px 缩略图" --about 封面
//   node scripts/judgment.mjs add "..." --check-after 3      # 3 天后回看
//   node scripts/judgment.mjs list                          # 全部（含待回看）
//   node scripts/judgment.mjs due                           # 今天该回看的
//   node scripts/judgment.mjs verdict j-xxxx right --note "后来发现确实糊"
import { writeJudgment, judgeVerdict, dueJudgments, listSelfNotes } from '../lib/self-note.js'

const argv = process.argv.slice(2)
const cmd = argv[0] || 'list'
const val = (n, d = '') => {
  const i = argv.indexOf('--' + n)
  return i >= 0 ? String(argv[i + 1] || '') : d
}

if (cmd === 'add') {
  const skip = new Set(['--basis', '--about', '--check-after', '--role'])
  const words = argv.slice(1).filter((a, i, arr) => !a.startsWith('--') && !skip.has(arr[i - 1]))
  const r = writeJudgment(val('role', 'dayu'), {
    thought: words.join(' '),
    basis: val('basis'),
    about: val('about'),
    checkAfterDays: Number(val('check-after', '7')) || 7,
  })
  console.log(JSON.stringify(r))
  process.exit(r.ok ? 0 : 2)
}

if (cmd === 'verdict') {
  const id = argv[1]
  const v = argv[2]
  const r = judgeVerdict(val('role', 'dayu'), { id, verdict: v, note: val('note') })
  console.log(JSON.stringify(r))
  process.exit(r.ok ? 0 : 2)
}

if (cmd === 'due') {
  const rows = dueJudgments({ role: val('role', 'dayu') })
  if (!rows.length) { console.log('今天没有该回看的判断。'); process.exit(0) }
  console.log(`该回看 ${rows.length} 条：`)
  for (const r of rows) console.log(`- ${r.id} [${r.checkAt}] ${String(r.text).slice(0, 60)}${r.basis ? '（依据：' + r.basis.slice(0, 30) + '）' : ''}`)
  process.exit(0)
}

const rows = listSelfNotes({ limit: Number(val('limit', '10')) || 10, role: val('role', '') }).filter((r) => r.kind === 'judgment')
if (!rows.length) { console.log('判断账本：还没有'); process.exit(0) }
console.log(`判断账本 ${rows.length} 条：`)
for (const r of rows) {
  const mark = r.status === 'open' ? '待回看' : r.status === 'right' ? '后来对了' : r.status === 'wrong' ? '后来错了' : '说不清'
  console.log(`- [${mark}] ${String(r.at).slice(0, 10)} ${String(r.text).slice(0, 50)}`)
}
