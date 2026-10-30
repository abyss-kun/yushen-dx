// 神念：自己决定看多细。零模型、只读、脱敏。
// 用法：ELECTRON_RUN_AS_NODE=1 "<exe>" scripts/look.mjs [headline|skim|read] [--limit=10] [--q=关键词]
import { look, awarenessIndex } from '../lib/awareness.js'

const args = process.argv.slice(2)
const depth = ['headline', 'skim', 'read'].includes(args[0]) ? args[0] : 'skim'
const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : ''
}
const out = look({ depth, limit: Number(flag('limit')) || 10, q: flag('q') })
console.log(JSON.stringify({ ok: true, index: awarenessIndex(), ...out }, null, 2))
