// 权重：主人这边的入口（她自己用 yushen_weight 工具，接入的插件没有入口）。
//
//   node scripts/weights.mjs --role dayu
//   node scripts/weights.mjs --role dayu --set replyGate=0.45 --why "群里太吵"
//   node scripts/weights.mjs --role dayu --log
//   node scripts/weights.mjs --role dayu --role-status
import { readWeights, setWeight, weightsLog, WEIGHT_DEFS, runtimeStatus } from '../lib/runtime.js'

const args = process.argv.slice(2)
const opt = (name, fallback = '') => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const role = opt('role', 'dayu')

if (args.includes('--role-status')) {
  console.log(JSON.stringify(runtimeStatus(role), null, 1))
} else if (args.includes('--log')) {
  console.log(JSON.stringify({ role, changes: weightsLog(role, { limit: 50 }) }, null, 1))
} else if (args.includes('--set')) {
  const pair = String(opt('set'))
  const [key, raw] = pair.split('=')
  const out = setWeight(role, key, Number(raw), { who: 'owner', why: opt('why', '') })
  console.log(JSON.stringify({ ok: true, role, ...out }, null, 1))
} else {
  const w = readWeights(role)
  console.log(JSON.stringify({
    role,
    values: w.values,
    defs: Object.fromEntries(Object.entries(WEIGHT_DEFS).map(([k, v]) => [k, { label: v.label, min: v.min, max: v.max, default: v.default }])),
    recent: w.log.slice(-5),
  }, null, 1))
}
