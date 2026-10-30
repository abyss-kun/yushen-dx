// 零模型记账：把一条事实写进工作账本，不叫模型、不花 token。
// 用法：
//   ELECTRON_RUN_AS_NODE=1 "<DeepSeek Harness.exe>" scripts/note.mjs "修好了 XX" [--files=a,b] [--evidence=...] [--kind=fix]
// 想查：scripts/wheel-check.mjs / scripts/session-search.mjs / GET /api/dayu/search?deep=1（都不走模型）
import { recordWork } from '../lib/worklog.js'

const args = process.argv.slice(2)
const positional = args.filter((a) => !a.startsWith('--'))
const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : ''
}
const what = positional.join(' ').trim()
if (!what) {
  console.error('用法：note.mjs "做了什么" [--files=a,b] [--evidence=...] [--kind=change]')
  process.exit(2)
}
const files = flag('files').split(',').map((s) => s.trim()).filter(Boolean)
const row = recordWork({ what, files, evidence: flag('evidence'), kind: flag('kind') || 'change', note: flag('note') })
console.log(JSON.stringify({ ok: true, row }, null, 2))
