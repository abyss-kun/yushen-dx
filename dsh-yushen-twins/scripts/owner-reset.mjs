// 本机重置暗号：只能在能开这台电脑的人手里跑。
//
//   node scripts/owner-reset.mjs "为什么重置"
//
// 为什么不做成她的工具：谁在 QQ 上喊一句"我忘了"，都能触发重置的话，
// 暗号就成了摆设。恢复的凭据只能是"能开这台电脑"，不是"会说这句话"。
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { resetSecrets, recoveryInfo, ownerInfo } from '../lib/owner-guard.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const reason = process.argv.slice(2).join(' ').trim()

if (!reason) {
  console.log(JSON.stringify({
    ok: false,
    usage: 'node scripts/owner-reset.mjs "为什么重置"',
    note: '必须在老板自己的电脑上跑；不能由聊天消息触发。',
    recovery: recoveryInfo(),
  }, null, 2))
  process.exit(1)
}

const before = ownerInfo()
const out = resetSecrets({ reason })
console.log(JSON.stringify({
  ok: true,
  cleared: out.cleared,
  backup: path.join(HOME, 'dayu', 'owner-secret.backup.json'),
  hadUids: Object.keys(before.uids || {}),
  note: '旧暗号全部作废；绑定的号还在，仍然认得你。要新暗号就在工作台重新设一条。',
}, null, 2))
