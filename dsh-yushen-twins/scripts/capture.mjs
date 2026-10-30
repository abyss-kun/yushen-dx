// 即时记录（老板入口）：想法/对话/决定先落盘。
// 用法：
//   ELECTRON_RUN_AS_NODE=1 "<exe>" scripts/capture.mjs add "……" [--kind=idea|talk|decision] [--tags=鱼神,备份]
//   ... capture.mjs list [--date=2026-10-25] [--limit=20]
//   ... capture.mjs search 关键词
import { capture, listCapture, searchCapture } from '../lib/capture.js'

const args = process.argv.slice(2)
const action = args[0] || 'list'
const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : ''
}
const rest = args.slice(1).filter((a) => !a.startsWith('--'))
if (action === 'add') {
  const r = capture(rest.join(' '), { kind: flag('kind'), tags: flag('tags').split(',').filter(Boolean) })
  console.log(JSON.stringify({ ok: r.ok, ...r }, null, 2))
  if (!r.ok) process.exitCode = 1
} else if (action === 'search') {
  console.log(JSON.stringify({ ok: true, items: searchCapture(rest.join(' '), { limit: 30 }) }, null, 2))
} else if (action === 'list') {
  console.log(JSON.stringify({ ok: true, items: listCapture({ date: flag('date'), limit: Number(flag('limit')) || 20 }) }, null, 2))
} else {
  console.error('用法：add "内容" [--kind=… --tags=…] | list [--date=…] | search 关键词')
  process.exitCode = 2
}
