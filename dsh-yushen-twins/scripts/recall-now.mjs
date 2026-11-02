// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// CLI：被触发时自动找旧事。手动试：node scripts/recall-now.mjs "还记得上次那个封面吗"
// 加 --include-expired 才返回「已失效」的旧结论（默认跳过；返回时标 [已失效]）。
import { recallNow, looksLikeRecall } from '../lib/recall-now.js'

const argv = process.argv.slice(2)
const includeExpired = argv.includes('--include-expired')
const text = argv.filter((x) => x !== '--include-expired').join(' ').trim()
if (!text) {
  console.error('给一句话：node scripts/recall-now.mjs "还记得上次那个封面的字吗" [--include-expired]')
  process.exit(2)
}
const triggered = looksLikeRecall(text)
const r = recallNow(text, { includeExpired })
if (!r.hits.length) {
  console.log(`没有想起相关的（触发=${triggered ? '是' : '否'}；关键词 ${r.keywords.join('/')}）`)
  process.exit(0)
}
console.log(`想起 ${r.hits.length} 条（共 ${r.total} 条命中；触发=${triggered ? '是' : '否'}；关键词 ${r.keywords.join('/')}）`)
for (const h of r.hits) {
  const src = [h.kind, h.role, h.file ? `${h.file}:${h.line}` : ''].filter(Boolean).join('·')
  console.log(`- [${src}]${h.expired ? '[已失效]' : ''} ${h.text}`)
  if (h.at) console.log(`    ${h.at}`)
}
