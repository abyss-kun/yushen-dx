/* 标签
 * id: register-change
 * kind: module
 * tags: 变动登记, 移动, 命令行
 * created: 2026-11-04 14:28:00
 * changed: 2026-11-04 14:28:00
 * author: 照微·工作台
 * authority: 老板（2026-11-04：动了东西做记录，时间、谁……让其他角色知道被移动了）
 * why: 搬文件是常事，但只有动手的人知道；写一条，别人醒来不会当成丢了
 * result: changes.jsonl 一行 + 公告栏一行
 * mutable: 可改
 */
// 用法：
//   node scripts/register-change.mjs --who 照微 --action move \
//     --what "遗忘/合并脚本" --from "dayu/index.js 的定时器" --to "scripts/memory-housekeeping.mjs" \
//     --why "宿主太卡" --authority "主人"
//   node scripts/register-change.mjs --list [--limit 20]
import { recordChange, recentChanges } from '../lib/changes-log.js'

const args = process.argv.slice(2)
const get = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? String(args[i + 1] || '') : '' }

if (args.includes('--list')) {
  const rows = recentChanges({ limit: Number(get('limit')) || 20 })
  if (!rows.length) console.log('还没有变动记录。')
  for (const r of rows) console.log(`${r.at}｜${r.who}｜${r.action}｜${r.what}${r.from || r.to ? `（${r.from || '?'} → ${r.to || '?'}）` : ''}`)
  process.exit(0)
}

const what = get('what')
if (!what) {
  console.error('用法：node scripts/register-change.mjs --who 谁 --action move|delete|add|edit --what 动了什么 [--from 从哪] [--to 到哪] [--why 为什么] [--authority 谁让的]')
  process.exit(2)
}

const r = recordChange({
  who: get('who') || '未标注',
  action: get('action') || 'edit',
  what,
  from: get('from'),
  to: get('to'),
  why: get('why'),
  authority: get('authority'),
})
console.log(r.ok ? `记下了：${r.row.at}｜${r.row.who}｜${r.row.action}｜${r.row.what}` : '没记下来（changes.jsonl 或公告写不进去）')
process.exit(r.ok ? 0 : 1)
