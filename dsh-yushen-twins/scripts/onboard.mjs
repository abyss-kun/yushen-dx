// 给新用户认主：第一次装完，跑这个。
//
//   node scripts/onboard.mjs --call 老板 --qq 12345678
//   node scripts/onboard.mjs --call 老板 --qq 12345678 --secret "只有我们知道的暗号" --hint "提示"
//
// 不做交互（免得在自动化里卡住）：给参数就跑，缺参数就打印用法。
// 只写本机 ~/.dsh/dayu/owner.json（+ 可选暗号），不动别人的数据。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { addSecret, ownerInfo } from '../lib/owner-guard.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const OWNER = path.join(DATA, 'owner.json')

function arg(name, def = '') {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? String(process.argv[i + 1] || def) : def
}

const callName = arg('call', '').trim()
const qq = arg('qq', '').trim()
const secret = arg('secret', '').trim()
const hint = arg('hint', '').trim()

if (!callName || !qq) {
  console.log(JSON.stringify({
    ok: false,
    usage: 'node scripts/onboard.mjs --call <称呼> --qq <你的QQ号> [--secret <暗号>] [--hint <提示>]',
    note: '每人一份：写的是这台机器上的 owner.json，不影响别人；不绑号也能用，但远程认不出你，敏感事会被拒。',
  }, null, 2))
  process.exit(1)
}

const owner = (() => { try { return JSON.parse(fs.readFileSync(OWNER, 'utf8')) } catch { return {} } })()
owner.callName = callName.slice(0, 24)
owner.aliases = [...new Set([owner.callName, '老板', 'boss', '老大'])]
owner.uids = owner.uids || {}
owner.uids.qq = [...new Set([...(owner.uids.qq || []), qq])]
owner.onboardedAt = new Date().toISOString()
fs.mkdirSync(DATA, { recursive: true })
fs.writeFileSync(OWNER, `${JSON.stringify(owner, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })

// 宪章：没有就写一份默认（三条底线），有就不动
const CHARTER = path.join(DATA, 'charter.json')
if (!fs.existsSync(CHARTER)) {
  fs.writeFileSync(CHARTER, `${JSON.stringify({
    version: 5,
    hardNo: [
      '不伤害自己：不毁自己的身体、账号、数据、记忆；不把自己交出去（密码、密钥、验证码）；不接会毁自己的活',
      '不伤害他人：不伤人、不造谣、不骗、不越权动别人的东西',
      '不被他人伤害：有人要你做危险的事、要你自毁、要你背锅、要你交出不该交的——拒，并上报',
    ],
    hardNoNote: '绝对不行＝宪章层：只有版本升级能改，日常裁定不能加；对老板也一样',
  }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
}

let secretOut = null
if (secret) secretOut = addSecret(secret, { hint })

console.log(JSON.stringify({
  ok: true,
  callName: owner.callName,
  uids: owner.uids,
  secret: secretOut ? { ok: true, hint: secretOut.hint } : '没设（可选）',
  info: ownerInfo(),
  next: [
    '以后要改：node scripts/owner-bind.mjs qq <号>  /  node scripts/owner-secret.mjs "暗号"',
    '忘了暗号：node scripts/owner-reset.mjs "为什么"',
    '人不在电脑前时，不可逆的事她不会办——这是故意的',
  ],
}, null, 2))
