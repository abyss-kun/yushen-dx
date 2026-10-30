// 纠结记录（老板入口）：她两难时说的话，原样留档。
// 用法：
//   ELECTRON_RUN_AS_NODE=1 "<exe>" scripts/thought.mjs list [--role=xiaoyu] [--date=2026-10-25]
//   ... thought.mjs add "她在纠结什么……" --role=xiaoyu
import { recordThought, listThoughts } from '../lib/thoughts.js'

const args = process.argv.slice(2)
const action = args[0] || 'list'
const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : ''
}
const rest = args.slice(1).filter((a) => !a.startsWith('--'))
if (action === 'list') {
  console.log(JSON.stringify({ ok: true, items: listThoughts({ role: flag('role'), date: flag('date'), limit: Number(flag('limit')) || 20 }) }, null, 2))
} else if (action === 'add') {
  const r = recordThought({ role: flag('role'), text: rest.join(' ') })
  console.log(JSON.stringify(r, null, 2))
  if (!r.ok) process.exitCode = 1
} else {
  console.error('用法：list [--role=… --date=…] | add "内容" --role=…')
  process.exitCode = 2
}
