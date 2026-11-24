// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-02 16:24｜大鱼·子会话（工作台）｜授权：主人（本次任务书：体检报告 §3「一诺千金指错门」）｜scripts/judgment.mjs:1-10｜文件头写明：这里就是判断账本（~/.dsh/dayu/soul/自我笔记.jsonl，kind=judgment），不是 runtime/<role>/judgments/｜为什么：两处都叫 judgments，注入的口令「违了查判断档」把她指到了回复门槛的自动评分流水上——查了等于没查｜验证：本文件无逻辑改动（只加注释）；regression「一诺千金指向真实文件」绿；node scripts/judgment.mjs list 仍能读账本｜可改：可改；账本位置由 lib/self-note.js 定，搬家要同时改这里和 lib/motto.js
// 判断账本：记一条“当时怎么想的 → 后来对不对”。
//
// **这就是「一诺千金｜重要判断写依据」说的那个账本**——写在
// `~/.dsh/dayu/soul/自我笔记.jsonl`（`kind=judgment`，append-only，人只能读）。
// 注意别走错门：`~/.dsh/dayu/runtime/<role>/judgments/` 是**回复门槛的自动评分流水**
// （系统给她打分），不是她自己写过的判断依据；同名两物，2026-11-02 体检把这条指错了，已改。
//
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
