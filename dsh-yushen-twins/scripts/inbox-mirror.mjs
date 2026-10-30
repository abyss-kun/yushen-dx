// 收件箱镜像：把桥的 ring 搬进本体（只读、幂等、零 token）。
//
//   node scripts/inbox-mirror.mjs            跑一次，打印结果
//   node scripts/inbox-mirror.mjs --watch    每 30 秒跑一次
//   node scripts/inbox-mirror.mjs --status   看收件箱概况
//   node scripts/inbox-mirror.mjs --dry      只算不写（第一次先看这个）
import { mirrorOnce, inboxStatus } from '../lib/inbox.js'

const args = new Set(process.argv.slice(2))
const INTERVAL = 30 * 1000

function once() {
  const r = mirrorOnce({ dryRun: args.has('--dry') })
  console.log(JSON.stringify({ at: new Date().toISOString(), ...r }, null, 1))
  return r
}

if (args.has('--status')) {
  console.log(JSON.stringify(inboxStatus(), null, 1))
} else if (args.has('--watch')) {
  once()
  setInterval(once, INTERVAL)
  console.log(`[inbox] 每 ${INTERVAL / 1000} 秒镜像一次；Ctrl+C 停`)
} else {
  const r = once()
  process.exitCode = r.ok ? 0 : 1
}
