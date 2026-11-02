// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// CLI：重建倒排索引（增量）。手动跑：node scripts/reindex.mjs [--force]
//   --force  忽略旧索引的 mtime/size，全部重建
// 输出一行给 tick 记日志：文档数 / token 数 / 耗时 / 文件大小 / 截断情况。
import { buildIndex } from '../lib/inverted.js'

const force = process.argv.includes('--force')
try {
  const r = buildIndex({ force })
  const mb = (r.bytes / 1024 / 1024).toFixed(2)
  const cut = r.truncated
    ? `；截断：${r.truncated.reason}（丢 ${r.truncated.droppedDocs} 行）`
    : ''
  console.log(`倒排：${r.docs} 行文档 / ${r.tokens} token / ${r.ms}ms / ${mb}MB（复用 ${r.reused} 个文件、重建 ${r.rebuilt} 个）${cut}`)
} catch (error) {
  console.error(`倒排重建失败：${error?.message || error}`)
  process.exit(1)
}
