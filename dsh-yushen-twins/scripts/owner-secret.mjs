// 加一条暗号：只能在能开这台电脑的人手里跑。
//
//   node scripts/owner-secret.mjs "只有我们知道的暗号" --hint "提示"
//
// 为什么不在她的工具里：加暗号等于"多配一把钥匙"。
// 聊天里能加，软磨硬泡就能让冒充者配一把他自己知道的。
import os from 'node:os'
import path from 'node:path'
import { addSecret, ownerInfo } from '../lib/owner-guard.js'

const args = process.argv.slice(2)
const hintAt = args.indexOf('--hint')
const text = (hintAt >= 0 ? args.slice(0, hintAt) : args).join(' ').trim()
const hint = hintAt >= 0 ? args.slice(hintAt + 1).join(' ').trim() : ''

if (!text) {
  console.log(JSON.stringify({
    ok: false,
    usage: 'node scripts/owner-secret.mjs "暗号" --hint "提示"',
    note: '必须在老板自己的电脑上跑；不能由聊天消息触发。',
    current: ownerInfo().secrets.map((s) => ({ label: s.label, hint: s.hint })),
  }, null, 2))
  process.exit(1)
}

const out = addSecret(text, { hint })
console.log(JSON.stringify({ ok: true, ...out, note: '只存盐+哈希，不存明文；这条暗号以后只用来认人。' }, null, 2))
