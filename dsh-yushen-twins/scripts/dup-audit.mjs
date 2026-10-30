// 查重 CLI（全知的一次查询）：node scripts/dup-audit.mjs
import { scanDuplicates } from '../lib/dup.js'

const r = scanDuplicates()
console.log(`插件 ${r.plugins.length} 个：${r.plugins.map((p) => p.name).join('、')}`)
for (const p of r.plugins) console.log(`- ${p.name}: 路由 ${p.routes}，工具 ${p.tools}`)
console.log(`\n重复路由：${r.dupRoutes.length}`)
for (const d of r.dupRoutes) console.log(`  ${d.name} ← ${d.owners.join(' / ')}`)
console.log(`重复工具名：${r.dupTools.length}`)
for (const d of r.dupTools) console.log(`  ${d.name} ← ${d.owners.join(' / ')}`)
for (const n of r.notes) console.log(`注：${n}`)
