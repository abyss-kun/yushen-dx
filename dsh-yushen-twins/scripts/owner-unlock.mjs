// 本机解锁：人在电脑前，跑这一下，给一段短窗口。
//
//   node scripts/owner-unlock.mjs 10
//
// 窗口内不可逆的事可以办；过期自动失效。远程（QQ/B站）永远不能解锁。
import os from 'node:os'
import path from 'node:path'
import { createUnlock, isLocallyUnlocked } from '../lib/authority.js'

const mins = Number(process.argv[2] || 10)
const doc = createUnlock({ minutes: mins })
console.log(JSON.stringify({
  ok: true,
  until: new Date(doc.until).toISOString(),
  minutes: mins,
  tokenHint: doc.token.slice(0, 3) + '***',
  note: '只在能开这台电脑的人手里有效；窗口内不可逆的事可办，过期失效。',
  now: isLocallyUnlocked(),
}, null, 2))
