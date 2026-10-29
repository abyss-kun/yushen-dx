// 绑主人的号：只能在能开这台电脑的人手里跑。
//
//   node scripts/owner-bind.mjs qq 12345678
//
// 为什么不在她的工具里：绑号等于"发一张老板身份证"。
// 让聊天里能触发，软磨硬泡两句就能把别人的号绑成老板。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { bindOwnerUid, ownerInfo } from '../lib/owner-guard.js'

const [channel, userId, ...rest] = process.argv.slice(2)
if (!channel || !userId) {
  console.log(JSON.stringify({
    ok: false,
    usage: 'node scripts/owner-bind.mjs <通道> <号>',
    note: '必须在老板自己的电脑上跑；不能由聊天消息触发。',
    current: ownerInfo().uids,
  }, null, 2))
  process.exit(1)
}

const uids = bindOwnerUid(channel.trim(), userId.trim())
console.log(JSON.stringify({ ok: true, channel: channel.trim(), userId: userId.trim(), uids, note: rest.join(' ') || '' }, null, 2))
