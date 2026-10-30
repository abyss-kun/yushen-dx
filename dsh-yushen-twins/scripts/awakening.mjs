// 点化 / 收回（老板入口）。
// 用法：
//   ELECTRON_RUN_AS_NODE=1 "<DeepSeek Harness.exe>" scripts/awakening.mjs list
//   ... awakening.mjs awaken <id> [--note="…"]
//   ... awakening.mjs seal <id> [--note="…"] [--return-memory]
import { listAwakening, awaken, seal } from '../lib/awakening.js'

const args = process.argv.slice(2)
const action = args[0] || 'list'
const role = args[1] || ''
const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : ''
}
const has = (name) => args.includes(`--${name}`)

try {
  if (action === 'list') {
    console.log(JSON.stringify({ ok: true, items: listAwakening() }, null, 2))
  } else if (action === 'awaken') {
    console.log(JSON.stringify({ ok: true, item: awaken(role, { note: flag('note') }), items: listAwakening() }, null, 2))
  } else if (action === 'seal') {
    console.log(JSON.stringify({ ok: true, item: seal(role, { note: flag('note'), returnMemory: has('return-memory') }), items: listAwakening() }, null, 2))
  } else {
    console.error('用法：list | awaken <id> | seal <id> [--note=…] [--return-memory]')
    process.exitCode = 2
  }
} catch (error) {
  console.error(String(error?.message || error))
  process.exitCode = 1
}
