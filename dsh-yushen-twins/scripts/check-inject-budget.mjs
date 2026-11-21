/* 标签
 * id: check-inject-budget
 * kind: module
 * tags: 注入, 预算, 检查
 * created: 2026-11-04 23:12:00
 * changed: 2026-11-04 23:01:20
 * author: 照微·工作台
 * authority: 老板（2026-11-04：做分层预算）
 * why: 总量没超不代表没人在某一层偷偷加东西
 * result: 一条命令看四层各自多厚、超了哪层；退出码 1 = 有层超
 * mutable: 可改
 */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
import { measureLayers, INJECT_BUDGET } from '../lib/inject-budget.js'
const json = process.argv.includes('--json')
const roles = process.argv.includes('--all') ? ['dayu', 'xiaoyu', 'dragon'] : ['dragon']

const out = []
let bad = 0
for (const role of roles) {
  const m = measureLayers(role)
  out.push(m)
  if (!m.ok) bad += 1
}

if (json) {
  console.log(JSON.stringify({ budget: INJECT_BUDGET, roles: out, ok: bad === 0 }, null, 2))
  process.exit(bad ? 1 : 0)
}

console.log(`注入分层预算（字；上限见括号）`)
for (const m of out) {
  console.log(`\n${m.role}：合计 ${m.total} 字`)
  for (const r of m.rows) {
    const mark = r.over ? `✗ 超 ${r.over}` : '·'
    console.log(`  ${mark} ${r.layer.padEnd(5)} ${String(r.chars).padStart(4)} / ${String(r.cap).padStart(4)}`)
  }
}
console.log(bad ? '\n有层超预算：先删再加，别拿现场换东西。' : '\n各层都在预算内。')
process.exit(bad ? 1 : 0)
