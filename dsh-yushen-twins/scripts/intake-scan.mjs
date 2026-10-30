// 入职扫描 CLI：node scripts/intake-scan.mjs
// 扫已装插件，写 ~/.dsh/xiaoyu/registry/index.json，并打印摘要。

import { scanPlugins, readRegistry, characterCandidates } from '../lib/intake.js'

const list = scanPlugins()
console.log(`扫描完成：${list.length} 个插件 → ${readRegistry().scannedAt}`)
for (const p of list) {
  console.log(`- ${p.name}@${p.version || '?'}  文件 ${p.counts.files}  资产 图${p.counts.image}/视${p.counts.video}/音${p.counts.audio}/模型${p.counts.model}  风险 网络=${p.flags.network} 执行=${p.flags.exec} 写盘=${p.flags.writes}`)
}
const cands = characterCandidates()
console.log(`\n可当人物形象的候选：${cands.length} 个`)
for (const c of cands.slice(0, 10)) console.log(`- [${c.kind}] ${c.plugin} :: ${c.rel} (${Math.round(c.bytes / 1024)} KB)`)
